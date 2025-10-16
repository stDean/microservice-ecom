import https from "https";
import http from "http";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import {
  recordCircuitBreakerFailure,
  recordCircuitBreakerSuccess,
} from "./circuitBreaker";

/**
 * @interface AuthenticatedRequest
 * @notice Extends Express Request with user context
 * @dev Populated by JWT authentication middleware
 */
export interface AuthenticatedRequest extends Request {
  requestId?: string;
  user?: {
    id: string;
    email: string;
    role: string;
  };
  rawBody?: string; // Added rawBody property
}

/**
 * @title Service Proxy Factory
 * @notice Creates HTTP proxy middleware for microservices
 * @dev Handles request forwarding, response piping, and error handling for service-to-service communication
 *
 * @param serviceUrl - Base URL of the target microservice (e.g., "http://auth-service:3001")
 * @param serviceName - Logical name of the service for circuit breaking and logging
 * @returns Express middleware function that proxies requests to the target service
 *
 * @workflow
 * 1. Constructs target URL using service URL, API version, and request path
 * 2. Determines HTTP/HTTPS client based on protocol
 * 3. Sets up request headers including user context and correlation ID
 * 4. Forwards request body (raw or parsed) to target service
 * 5. Pipes response back to client with status code and headers
 * 6. Updates circuit breaker state based on response status
 * 7. Handles proxy errors with graceful fallback responses
 *
 * @features
 * - Automatic protocol detection (HTTP/HTTPS)
 * - User context propagation via X-User-* headers
 * - Request body forwarding (raw or parsed JSON)
 * - Response streaming with header preservation
 * - Circuit breaker integration
 * - Comprehensive logging for debugging
 * - Error handling with service unavailable responses
 *
 * @example
 * // Proxy all /auth requests to authentication service
 * app.use('/auth', createServiceProxy('http://auth-service:3001', 'auth'));
 *
 * // Proxy authenticated user requests
 * app.use('/users', authenticateToken, createServiceProxy('http://user-service:3002', 'users'));
 */
export const createServiceProxy = (serviceUrl: string, serviceName: string) => {
  return (req: AuthenticatedRequest, res: Response) => {
    const requestId = req.requestId;
    const url = new URL(
      `${serviceUrl}/api/v1/${serviceName}${req.path === "/" ? "" : req.path}`
    );

    const isHttps = url.protocol === "https:";
    const client = isHttps ? https : http;

    // Convert port to number if it exists and is numeric
    const port = url.port ? parseInt(url.port, 10) : isHttps ? 443 : 80;

    const options = {
      hostname: url.hostname,
      port: port,
      path: url.pathname + url.search,
      method: req.method,
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
        "X-User-Id": req.user?.id || "",
        "X-User-Email": req.user?.email || "",
        "X-User-Role": req.user?.role || "",
        Authorization: req.headers.authorization || "",
      } as Record<string, string>,
    };

    console.log(
      `🔁 [HTTP PROXY] ${req.method} ${req.path} -> ${url.toString()}`
    );

    console.log(`👤 [USER HEADERS]`, {
      userId: req.user?.id,
      email: req.user?.email,
      role: req.user?.role,
    });

    const proxyReq = client.request(options, (proxyRes) => {
      let responseData = "";

      proxyRes.on("data", (chunk) => {
        responseData += chunk;
      });

      proxyRes.on("end", () => {
        console.log(
          `✅ [HTTP PROXY] ${serviceName} responded:`,
          proxyRes.statusCode
        );
        console.log(`📨 [RESPONSE BODY]`, responseData);

        res.status(proxyRes.statusCode || 500);

        Object.keys(proxyRes.headers).forEach((key) => {
          const value = proxyRes.headers[key];
          if (value && typeof value === "string") {
            res.setHeader(key, value);
          }
        });

        res.send(responseData);

        if (proxyRes.statusCode && proxyRes.statusCode < 500) {
          recordCircuitBreakerSuccess(serviceName);
        }
      });
    });

    proxyReq.on("error", (error) => {
      console.error(`❌ [HTTP PROXY ERROR] ${serviceName}:`, error.message);
      recordCircuitBreakerFailure(serviceName);

      res.status(StatusCodes.SERVICE_UNAVAILABLE).json({
        error: "Service temporarily unavailable",
        correlationId: requestId,
        service: serviceName,
      });
    });

    // Handle request body - FIXED VERSION
    if (req.rawBody) {
      console.log(
        `📦 [SENDING BODY] Using rawBody (${req.rawBody.length} chars)`
      );
      proxyReq.write(req.rawBody);
    } else if (req.body && ["POST", "PUT", "PATCH"].includes(req.method)) {
      const bodyString = JSON.stringify(req.body);
      console.log(
        `📦 [SENDING BODY] Using parsed body (${bodyString.length} chars)`
      );
      proxyReq.write(bodyString);
    } else {
      console.log(`📦 [SENDING BODY] No body to send`);
    }

    proxyReq.end();
  };
};
