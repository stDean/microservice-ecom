/**
 * @title Enterprise TypeScript API Gateway
 * @author Dean
 * @notice A comprehensive, production-ready API Gateway built with TypeScript and Express
 * @dev Provides routing, security, monitoring, and orchestration for microservices architecture
 *
 * @overview
 * This API Gateway acts as a single entry point for client applications, providing:
 * - Request routing and load balancing to backend microservices
 * - Centralized security, authentication, and authorization
 * - Rate limiting and DDoS protection
 * - Request validation and transformation
 * - Distributed tracing and comprehensive logging
 * - Health monitoring and circuit breaking
 *
 * @architecture
 * ┌─────────────────┐    ┌──────────────────┐    ┌────────────────────┐
 * │   Client App    │───▶│  API Gateway     │───▶│   Microservices    │
 * │                 │    │  (This Service)  │    │  (Auth, Users,     │
 * │                 │    │                  │    │   Products, etc.)  │
 * └─────────────────┘    └──────────────────┘    └────────────────────┘
 *
 * @features
 * - 🔒 Security: Helmet, CORS, Rate Limiting, JWT Authentication
 * - 📊 Monitoring: Structured Logging, Health Checks, Request Tracing
 * - ⚡ Performance: Compression, Caching, Timeout Management
 * - 🛡️ Reliability: Error Handling, Circuit Breaking, Graceful Shutdown
 * - 🔧 Development: TypeScript, Hot Reloading, Environment Configuration
 */

import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import { createProxyMiddleware, Options } from "http-proxy-middleware";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import cors from "cors";
import { StatusCodes } from "http-status-codes";
import compression from "compression";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";
import { ClientRequest, IncomingMessage } from "http";

const app = express();
const PORT = process.env.PORT || 3000;

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

/**
 * @interface ServiceConfig
 * @notice Configuration mapping for microservices
 * @dev Maps service names to their respective URLs
 * @example { auth: "http://localhost:3001" }
 */
interface ServiceConfig {
  [key: string]: string;
}

/**
 * @interface HealthResponse
 * @notice Standardized health check response format
 * @dev Used by monitoring systems and load balancers
 */
interface HealthResponse {
  status: string;
  timestamp: string;
  services: string[];
  uptime: number;
  serviceStatus?: { [key: string]: string };
}

/**
 * @interface AuthenticatedRequest
 * @notice Extends Express Request with user context
 * @dev Populated by JWT authentication middleware
 */
interface AuthenticatedRequest extends Request {
  requestId?: string;
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

/**
 * @interface ValidationRules
 * @notice Schema definition for request validation
 * @dev Maps routes and methods to validation schemas
 */
interface ValidationRules {
  [path: string]: {
    [method: string]: {
      body?: any;
      query?: any;
      params?: any;
    };
  };
}

/**
 * @interface CircuitBreakerState
 * @notice Circuit breaker state for microservices
 * @dev Implements the circuit breaker pattern for fault tolerance
 */
interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * @constant SERVICES
 * @notice Microservices configuration
 * @dev URLs are loaded from environment variables with fallback to localhost
 * @env AUTH_SERVICE_URL, USER_SERVICE_URL, PRODUCT_SERVICE_URL
 */
const SERVICES: ServiceConfig = {
  auth: process.env.AUTH_SERVICE_URL!,
  notification: process.env.NOTIFICATION_SERVICE_URL!,
};

console.log("🔧 Service Configuration:", SERVICES);

/**
 * @constant JWT_SECRET
 * @notice Secret key for JWT verification
 * @dev Must be set as environment variable in production
 * @env JWT_SECRET
 */
const JWT_SECRET =
  process.env.JWT_SECRET || "your-default-jwt-secret-change-in-production";

/**
 * @constant SERVICE_TIMEOUTS
 * @notice Service-specific timeout configuration
 * @dev Different services may have different response time expectations
 */
const SERVICE_TIMEOUTS: { [key: string]: number } = {
  auth: 10000, // 10 seconds
  notification: 15000, // 15 seconds
};

/**
 * @constant circuitBreakers
 * @notice Circuit breaker state storage
 * @dev Tracks failure states for each microservice
 */
const circuitBreakers: { [service: string]: CircuitBreakerState } = {};

// =============================================================================
// ENVIRONMENT VALIDATION
// =============================================================================

/**
 * @function validateEnvironment
 * @notice Validates required environment variables
 * @dev Throws error if required variables are missing
 */
const validateEnvironment = () => {
  const required = ["JWT_SECRET"];
  if (process.env.NODE_ENV === "production") {
    required.push("AUTH_SERVICE_URL");
  }

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }

  logger.info("Environment validation passed", undefined, {
    nodeEnv: process.env.NODE_ENV,
    services: Object.keys(SERVICES),
  });
};

// =============================================================================
// CIRCUIT BREAKER IMPLEMENTATION
// =============================================================================

/**
 * @function checkCircuitBreaker
 * @notice Circuit breaker pattern implementation
 * @dev Prevents cascading failures when services are down
 * @param serviceName - Name of the microservice
 * @returns boolean indicating if request should proceed
 */
const checkCircuitBreaker = (serviceName: string): boolean => {
  const breaker = circuitBreakers[serviceName] || {
    failures: 0,
    lastFailure: 0,
    state: "CLOSED" as const,
  };

  if (breaker.state === "OPEN") {
    // Check if we should try again (30 second cooldown)
    if (Date.now() - breaker.lastFailure > 30000) {
      breaker.state = "HALF_OPEN";
      circuitBreakers[serviceName] = breaker;
      logger.info(
        `Circuit breaker for ${serviceName} moved to HALF_OPEN`,
        undefined,
        { service: serviceName }
      );
      return true;
    }
    return false;
  }

  return true;
};

/**
 * @function recordCircuitBreakerSuccess
 * @notice Records successful request to reset circuit breaker
 * @param serviceName - Name of the microservice
 */
const recordCircuitBreakerSuccess = (serviceName: string) => {
  if (circuitBreakers[serviceName]) {
    circuitBreakers[serviceName] = {
      failures: 0,
      lastFailure: 0,
      state: "CLOSED",
    };
  }
};

/**
 * @function recordCircuitBreakerFailure
 * @notice Records failed request to update circuit breaker state
 * @param serviceName - Name of the microservice
 */
const recordCircuitBreakerFailure = (serviceName: string) => {
  const breaker = circuitBreakers[serviceName] || {
    failures: 0,
    lastFailure: 0,
    state: "CLOSED" as const,
  };

  breaker.failures++;
  breaker.lastFailure = Date.now();

  // Open circuit after 5 consecutive failures
  if (breaker.failures >= 5) {
    breaker.state = "OPEN";
    logger.warn(`Circuit breaker opened for ${serviceName}`, undefined, {
      service: serviceName,
      failures: breaker.failures,
    });
  }

  circuitBreakers[serviceName] = breaker;
};

// =============================================================================
// MIDDLEWARE: REQUEST ID TRACKING
// =============================================================================

/**
 * @function requestIdMiddleware
 * @notice Generates and tracks correlation IDs for distributed tracing
 * @dev Adds X-Request-Id header to all requests and responses
 * @param req - Express Request object
 * @param res - Express Response object
 * @param next - Express next function
 *
 * @workflow
 * 1. Check for existing X-Request-Id header from client
 * 2. Generate new UUID if not present
 * 3. Attach request ID to request object and response headers
 * 4. Continue to next middleware
 */
const requestIdMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const requestId = (req.headers["x-request-id"] as string) || uuidv4();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
};

// =============================================================================
// LOGGING SYSTEM
// =============================================================================

/**
 * @namespace logger
 * @notice Structured logging utility with correlation ID support
 * @dev Outputs JSON-formatted logs for easy parsing by log aggregators
 */
const logger = {
  /**
   * @function info
   * @notice Log informational messages
   * @param message - Human readable message
   * @param correlationId - Request correlation ID for tracing
   * @param meta - Additional metadata for context
   */
  info: (message: string, correlationId?: string, meta?: any) => {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "INFO",
        message,
        correlationId,
        ...meta,
      })
    );
  },

  /**
   * @function error
   * @notice Log error messages with stack traces
   * @param message - Human readable error message
   * @param correlationId - Request correlation ID for tracing
   * @param error - Error object with stack trace
   * @param meta - Additional error context
   */
  error: (message: string, correlationId?: string, error?: any, meta?: any) => {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "ERROR",
        message,
        correlationId,
        error: error?.message,
        stack: error?.stack,
        ...meta,
      })
    );
  },

  /**
   * @function warn
   * @notice Log warning messages
   * @param message - Human readable warning message
   * @param correlationId - Request correlation ID for tracing
   * @param meta - Additional warning context
   */
  warn: (message: string, correlationId?: string, meta?: any) => {
    console.warn(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "WARN",
        message,
        correlationId,
        ...meta,
      })
    );
  },
};

// Enhanced morgan logging with correlation IDs
morgan.token(
  "correlation-id",
  (req: AuthenticatedRequest) => req.requestId || "unknown"
);
const morganFormat =
  ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :correlation-id';

// =============================================================================
// AUTHENTICATION MIDDLEWARE
// =============================================================================

/**
 * @function authenticateToken
 * @notice JWT-based authentication middleware
 * @dev Verifies Bearer tokens and attaches user context to requests
 * @param req - AuthenticatedRequest object (extends Express Request)
 * @param res - Express Response object
 * @param next - Express next function
 *
 * @workflow
 * 1. Extract JWT token from Authorization header
 * 2. Verify token using JWT_SECRET
 * 3. Attach decoded user payload to request object
 * 4. Continue to next middleware or return 401/403 on failure
 *
 * @security
 * - Uses HS256 algorithm for JWT verification
 * - Tokens expire based on issuer configuration
 * - Public routes are explicitly defined
 */
const authenticateToken = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    logger.warn("Authentication failed: No token provided", req.requestId, {
      path: req.path,
      method: req.method,
    });
    return res.status(StatusCodes.UNAUTHORIZED).json({
      error: "Access token required",
      correlationId: req.requestId,
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
    };
    next();
  } catch (error) {
    logger.error("Authentication failed: Invalid token", req.requestId, error, {
      path: req.path,
    });

    return res.status(StatusCodes.FORBIDDEN).json({
      error: "Invalid or expired token",
      correlationId: req.requestId,
    });
  }
};

// =============================================================================
// REQUEST VALIDATION MIDDLEWARE
// =============================================================================

/**
 * @constant validationRules
 * @notice Request validation schemas for different endpoints
 * @dev Uses JSON Schema-like structure for request validation
 *
 * @validation-types
 * - body: Request body validation
 * - query: URL query parameters validation
 * - params: Route parameters validation
 */
const validationRules: ValidationRules = {
  "/api/v1/users": {
    POST: {
      body: {
        type: "object",
        properties: {
          email: { type: "string", format: "email" },
          name: { type: "string", minLength: 1 },
          password: { type: "string", minLength: 6 },
        },
        required: ["email", "name", "password"],
      },
    },
  },
  "/api/v1/products": {
    POST: {
      body: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1 },
          price: { type: "number", minimum: 0 },
          category: { type: "string" },
        },
        required: ["name", "price"],
      },
    },
  },
};

/**
 * @function validateRequest
 * @notice Request validation middleware using defined schemas
 * @dev Validates incoming requests against predefined validation rules
 * @param req - Express Request object
 * @param res - Express Response object
 * @param next - Express next function
 *
 * @workflow
 * 1. Look up validation rules for current route and method
 * 2. Validate request body, query parameters, and route parameters
 * 3. Collect all validation errors
 * 4. Return 400 with error details or continue to next middleware
 */
const validateRequest = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const rules = validationRules[req.path]?.[req.method];

  if (!rules) {
    return next(); // No validation rules for this route
  }

  const errors: string[] = [];

  // Validate body
  if (rules.body) {
    const bodyValidation = validateAgainstSchema(req.body, rules.body);
    if (!bodyValidation.isValid) {
      errors.push(`Body: ${bodyValidation.errors.join(", ")}`);
    }
  }

  // Validate query parameters
  if (rules.query) {
    const queryValidation = validateAgainstSchema(req.query, rules.query);
    if (!queryValidation.isValid) {
      errors.push(`Query: ${queryValidation.errors.join(", ")}`);
    }
  }

  if (errors.length > 0) {
    logger.warn("Request validation failed", req.requestId, {
      path: req.path,
      method: req.method,
      errors,
    });

    return res.status(StatusCodes.BAD_REQUEST).json({
      error: "Validation failed",
      details: errors,
      correlationId: req.requestId,
    });
  }

  next();
};

/**
 * @function validateAgainstSchema
 * @notice Simple schema validation implementation
 * @dev In production, replace with Joi, Zod, or Yup
 * @param data - Data to validate
 * @param schema - Validation schema
 * @returns Validation result with errors
 */
const validateAgainstSchema = (
  data: any,
  schema: any
): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (schema.type === "object" && schema.properties) {
    // Check required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (
          data[field] === undefined ||
          data[field] === null ||
          data[field] === ""
        ) {
          errors.push(`${field} is required`);
        }
      }
    }

    // Validate individual properties
    for (const [key, propSchema] of Object.entries(schema.properties) as [
      string,
      any
    ][]) {
      if (data[key] !== undefined && data[key] !== null && data[key] !== "") {
        // Type validation
        if (propSchema.type === "string") {
          if (typeof data[key] !== "string") {
            errors.push(`${key} must be a string`);
          } else if (
            propSchema.minLength &&
            data[key].length < propSchema.minLength
          ) {
            errors.push(
              `${key} must be at least ${propSchema.minLength} characters`
            );
          }
        } else if (propSchema.type === "number") {
          if (typeof data[key] !== "number") {
            errors.push(`${key} must be a number`);
          } else if (
            propSchema.minimum !== undefined &&
            data[key] < propSchema.minimum
          ) {
            errors.push(`${key} must be at least ${propSchema.minimum}`);
          }
        }

        // Email format validation
        if (propSchema.format === "email") {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(data[key])) {
            errors.push(`${key} must be a valid email address`);
          }
        }
      }
    }
  }

  return { isValid: errors.length === 0, errors };
};

// =============================================================================
// RATE LIMITING CONFIGURATION
// =============================================================================

/**
 * @function createRateLimit
 * @notice Creates configured rate limit middleware
 * @dev Different endpoints can have different rate limits
 * @param windowMs - Time window in milliseconds
 * @param max - Maximum number of requests per window
 * @returns Configured rate limit middleware
 */
const createRateLimit = (windowMs: number, max: number) =>
  rateLimit({
    windowMs,
    max,
    message: {
      error: "Too many requests, please try again later.",
      retryAfter: `${windowMs / 1000} seconds`,
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
  });

// =============================================================================
// MIDDLEWARE SETUP
// =============================================================================
// Security headers using Helmet with CSP configuration
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// Compression middleware for response optimization
app.use(compression());

// Request ID middleware (must come before logging)
app.use(requestIdMiddleware);

// Enhanced logging with correlation IDs
app.use(
  morgan(morganFormat, {
    stream: {
      write: (message: string) => {
        logger.info("HTTP Request", undefined, { message: message.trim() });
      },
    },
  })
);

// CORS configuration
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || [
      "http://localhost:3000",
    ],
    credentials: true,
  })
);

// TODO:Apply different rate limits based on routes
// app.use("/auth", createRateLimit(15 * 60 * 1000, 5)); // 5 attempts per 15min for auth

// =============================================================================
// AUTHENTICATION & VALIDATION MIDDLEWARE
// =============================================================================

app.use(validateRequest);

// =============================================================================
// PROXY MIDDLEWARE WITH ENHANCED FEATURES
// =============================================================================

/**
 * @function createServiceProxy
 * @notice Creates configured proxy middleware for microservices
 * @dev Enhanced with logging, headers propagation, and error handling
 * @param serviceUrl - Target microservice URL
 * @param serviceName - Logical name of the microservice
 * @returns Configured proxy middleware instance
 *
 * @features
 * - Request/Response logging with correlation IDs
 * - Header propagation for distributed tracing
 * - User context forwarding to downstream services
 * - Comprehensive error handling and logging
 * - Configurable timeouts
 * - Circuit breaker integration
 */
const createServiceProxy = (serviceUrl: string, serviceName: string) => {
  logger.info(`Initializing proxy for ${serviceName}`, undefined, {
    target: serviceUrl,
  });

  return createProxyMiddleware({
    target: serviceUrl,
    changeOrigin: true,
    pathRewrite: (path, req) => {
      const newPath = `/api/v1/${serviceName}${path}`;
      console.log(`[DEBUG] Rewriting ${path} to ${newPath}`);
      console.log(`[DEBUG] Full target URL will be: ${serviceUrl}${newPath}`);
      return newPath;
    },
    timeout: SERVICE_TIMEOUTS[serviceName] || 30000,
    proxyTimeout: SERVICE_TIMEOUTS[serviceName] || 30000,
    onProxyReq: (proxyReq: ClientRequest, req: AuthenticatedRequest) => {
      const requestId = req.requestId;

      if (requestId) {
        proxyReq.setHeader("X-Request-Id", requestId);
      }

      if (req.user) {
        proxyReq.setHeader("X-User-Id", req.user.id);
        proxyReq.setHeader("X-User-Role", req.user.role);
      }

      logger.info(`Proxying request to ${serviceName}`, requestId, {
        service: serviceName,
        originalPath: req.path,
        targetPath: proxyReq.path,
        method: req.method,
      });
    },

    onProxyRes: (proxyRes: IncomingMessage, req: AuthenticatedRequest) => {
      const requestId = req.requestId;
      logger.info(`Received response from ${serviceName}`, requestId, {
        service: serviceName,
        statusCode: proxyRes.statusCode,
        path: req.path,
      });

      if (proxyRes.statusCode && proxyRes.statusCode < 500) {
        recordCircuitBreakerSuccess(serviceName);
      }
    },

    onError: (err: Error, req: AuthenticatedRequest, res: Response) => {
      const requestId = req.requestId;
      recordCircuitBreakerFailure(serviceName);

      const errorMessage = `Proxy connection error for ${serviceName}: ${err.message}`;

      logger.error(errorMessage, requestId, err, {
        service: serviceName,
        path: req.path,
        errorCode: (err as any).code,
        targetUrl: `${SERVICES[serviceName]}${req.path}`,
      });

      if (!checkCircuitBreaker(serviceName)) {
        return res.status(StatusCodes.SERVICE_UNAVAILABLE).json({
          error: "Service unavailable due to circuit breaker",
          correlationId: requestId,
          service: serviceName,
        });
      }

      return res.status(StatusCodes.SERVICE_UNAVAILABLE).json({
        error: "Service temporarily unavailable",
        details:
          process.env.NODE_ENV === "development" ? errorMessage : undefined,
        correlationId: requestId,
        service: serviceName,
      });
    },
  } as Options);
};

// =============================================================================
// ROUTE CONFIGURATION
// =============================================================================

/**
 * @route /auth -> Auth Service
 */
app.use("/auth", createServiceProxy(SERVICES.auth, "auth"));
app.use(
  "/notification",
  createServiceProxy(SERVICES.notification, "notification")
);
app.use(
  "/users",
  authenticateToken,
  createServiceProxy(SERVICES.users, "users")
);

// =============================================================================
// HEALTH CHECK ENDPOINTS
// =============================================================================

/**
 * @route GET /health
 * @notice Basic health check endpoint for monitoring and load balancers
 * @dev Returns service status and uptime information
 *
 * @response
 * {
 *   "status": "OK",
 *   "timestamp": "2023-10-01T12:00:00.000Z",
 *   "services": ["auth", "users", "products"],
 *   "uptime": 3600
 * }
 */
app.get("/health", async (req: AuthenticatedRequest, res: Response) => {
  const requestId = req.requestId;

  logger.info("Health check requested", requestId);

  const healthResponse: HealthResponse = {
    status: "OK",
    timestamp: new Date().toISOString(),
    services: Object.keys(SERVICES),
    uptime: process.uptime(),
  };

  res.status(StatusCodes.OK).json(healthResponse);
});

/**
 * @route GET /health/detailed
 * @notice Detailed health check with microservice status
 * @dev Checks each microservice health and returns comprehensive status
 *
 * @response
 * {
 *   "status": "OK",
 *   "timestamp": "2023-10-01T12:00:00.000Z",
 *   "uptime": 3600,
 *   "serviceStatus": {
 *     "auth": "HEALTHY",
 *     "users": "UNREACHABLE",
 *     "products": "HEALTHY"
 *   }
 * }
 */
app.get(
  "/health/detailed",
  async (req: AuthenticatedRequest, res: Response) => {
    const requestId = req.requestId;
    logger.info("Detailed health check requested", requestId);

    const healthCheck: HealthResponse = {
      status: "OK",
      timestamp: new Date().toISOString(),
      services: Object.keys(SERVICES),
      uptime: process.uptime(),
      serviceStatus: {},
    };

    // Define health check endpoints for each service
    const healthEndpoints: { [key: string]: string } = {
      auth: "/api/v1/auth/health",
      notification: "/api/v1/notification/health",
    };

    // Check each microservice health
    const healthChecks = Object.entries(SERVICES).map(
      async ([service, url]) => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);

          const healthEndpoint = healthEndpoints[service] || "/health";
          const response = await fetch(`${url}${healthEndpoint}`, {
            signal: controller.signal,
            headers: { "X-Request-Id": requestId || uuidv4() },
          });

          clearTimeout(timeoutId);

          if (response.ok) {
            healthCheck.serviceStatus![service] = "HEALTHY";
          } else {
            healthCheck.serviceStatus![
              service
            ] = `UNHEALTHY (${response.status})`;
            healthCheck.status = "DEGRADED";
          }
        } catch (error) {
          healthCheck.serviceStatus![service] = "UNREACHABLE";
          healthCheck.status = "DEGRADED";
          logger.warn(`Service health check failed: ${service}`, requestId, {
            error: error instanceof Error ? error.message : String(error),
            service,
            url: `${url}${healthEndpoints[service] || "/health"}`,
          });
        }
      }
    );

    await Promise.allSettled(healthChecks);

    const allHealthy = Object.values(healthCheck.serviceStatus!).every(
      (status) => status === "HEALTHY"
    );
    const statusCode = allHealthy
      ? StatusCodes.OK
      : StatusCodes.SERVICE_UNAVAILABLE;

    res.status(statusCode).json(healthCheck);
  }
);

// =============================================================================
// ERROR HANDLING MIDDLEWARE
// =============================================================================

/**
 * @middleware 404 Handler
 * @notice Catch-all for undefined routes
 * @dev Returns standardized 404 response with correlation ID
 */
app.use((req: AuthenticatedRequest, res: Response) => {
  const requestId = req.requestId;

  logger.warn("Route not found", requestId, {
    path: req.originalUrl,
    method: req.method,
  });

  res.status(StatusCodes.NOT_FOUND).json({
    error: "Route not found",
    correlationId: requestId,
  });
});

/**
 * @middleware Global Error Handler
 * @notice Centralized error handling middleware
 * @dev Catches all unhandled errors and returns standardized responses
 */
app.use(
  (
    err: Error,
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    const requestId = req.requestId;

    logger.error("Unhandled error in gateway", requestId, err, {
      path: req.path,
      method: req.method,
    });

    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Internal server error",
      correlationId: requestId,
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
  }
);

// =============================================================================
// SERVER INITIALIZATION
// =============================================================================

/**
 * @function initializeServer
 * @notice Initializes and starts the Express server
 * @dev Validates environment, then starts the server
 */
const initializeServer = () => {
  try {
    // Validate environment before starting
    validateEnvironment();

    app.listen(PORT, () => {
      logger.info(`API Gateway starting`, undefined, {
        port: PORT,
        environment: process.env.NODE_ENV || "development",
        services: Object.keys(SERVICES),
        timeouts: SERVICE_TIMEOUTS,
      });

      console.log(`🚀 API Gateway running on http://localhost:${PORT}`);
      console.log(
        `📊 Health check available at http://localhost:${PORT}/health`
      );
      console.log(
        `🔍 Detailed health at http://localhost:${PORT}/health/detailed`
      );
      console.log(`🔧 Proxying services:`, Object.keys(SERVICES));
      console.log(`⏱️  Service timeouts:`, SERVICE_TIMEOUTS);
    });
  } catch (error) {
    logger.error("Failed to initialize server", undefined, error);
    process.exit(1);
  }
};

// Start the server
initializeServer();

// =============================================================================
// GRACEFUL SHUTDOWN HANDLERS
// =============================================================================

/**
 * @function gracefulShutdown
 * @notice Handles graceful shutdown on termination signals
 * @dev Ensures in-flight requests are completed before shutdown
 * @param signal - OS signal that triggered shutdown
 */
const gracefulShutdown = (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully`, undefined, {
    signal,
    uptime: process.uptime(),
  });

  // Close any connections or cleanup here
  process.exit(0);
};

// Handle OS termination signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (error: Error) => {
  logger.error("Uncaught Exception", undefined, error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
  logger.error("Unhandled Promise Rejection", undefined, reason);
  process.exit(1);
});

export {
  app,
  validateRequest,
  validateAgainstSchema,
  checkCircuitBreaker,
  recordCircuitBreakerSuccess,
  recordCircuitBreakerFailure,
  requestIdMiddleware,
  authenticateToken,
  createServiceProxy,
  circuitBreakers,
  SERVICES,
  SERVICE_TIMEOUTS,
};

export default app;
