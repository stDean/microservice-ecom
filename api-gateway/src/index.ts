/**
 * @title API Gateway
 * @notice Express gateway for microservices architecture
 * @dev Handles routing, security, and monitoring for backend services
 *
 * Routes traffic to:
 * ✅ /auth       - Authentication service
 * ✅ /users      - User management service
 * ✅ /notification - Notification service
 * 🔄 /products   - [Future] Product catalog
 * 🔄 /orders     - [Future] Order processing
 *
 * Features:
 * - JWT authentication and rate limiting
 * - Circuit breaker pattern for fault tolerance
 * - Request validation and structured logging
 * - Health monitoring and graceful shutdown
 */

import compression from "compression";
import cors from "cors";
import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { StatusCodes } from "http-status-codes";
import morgan from "morgan";
import { v4 as uuidv4 } from "uuid";
import cookieParser from "cookie-parser";
import {
  circuitBreakerCheck,
  circuitBreakers,
} from "./middleware/circuitBreaker";
import { createRateLimit } from "./middleware/rateLimiter";
import {
  AuthenticatedRequest,
  createServiceProxy,
} from "./middleware/serverProxy";
import { validateRequest } from "./middleware/validation";
import { logger } from "./utils/logger";
import { authenticateToken } from "./middleware/authToken";

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
  users: process.env.USER_SERVICE_URL!,
  productCatalog: process.env.PRODUCT_SERVICE_URL!,
};

console.log("🔧 Service Configuration:", SERVICES);

/**
 * @constant SERVICE_TIMEOUTS
 * @notice Service-specific timeout configuration
 * @dev Different services may have different response time expectations
 */
const SERVICE_TIMEOUTS: { [key: string]: number } = {
  auth: 10000, // 10 seconds
  notification: 15000, // 15 seconds
  users: 20000,
  productCatalog: 20000,
};

// Enhanced morgan logging with correlation IDs
morgan.token(
  "correlation-id",
  (req: AuthenticatedRequest) => req.requestId || "unknown"
);
const morganFormat =
  ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :correlation-id';

// =============================================================================
// CORE MIDDLEWARE
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

app.use(cookieParser());

// Authenticate Request middleware
app.use(express.json());
app.use(validateRequest);
// =============================================================================
// ROUTE CONFIGURATION
// =============================================================================

app.get("/circuit-status", (req: Request, res: Response) => {
  res.json({
    circuitBreakers,
    services: Object.keys(SERVICES),
  });
});

app.use(
  "/auth",
  // createRateLimit(15 * 60 * 1000, 5),
  circuitBreakerCheck("auth"),
  createServiceProxy(SERVICES.auth, "auth")
);
app.use(
  "/notification",
  createServiceProxy(SERVICES.notification, "notification")
);
app.use(
  "/users",
  authenticateToken,
  createRateLimit(15 * 60 * 1000, 100),
  circuitBreakerCheck("users"),
  createServiceProxy(SERVICES.users, "users")
);

app.use(
  "/productCatalog",
  authenticateToken,
  createRateLimit(15 * 60 * 1000, 100),
  circuitBreakerCheck("productCatalog"),
  createServiceProxy(SERVICES.productCatalog, "productCatalog")
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
    app.listen(PORT, () => {
      logger.info(`API Gateway starting`, undefined, {
        port: PORT,
        environment: process.env.NODE_ENV || "development",
        services: Object.keys(SERVICES),
        timeouts: SERVICE_TIMEOUTS,
      });

      console.log(
        `📊 Health check available at http://localhost:${PORT}/health`
      );

      console.log(`🔧 Proxying services:`, Object.keys(SERVICES));
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

export { requestIdMiddleware, SERVICE_TIMEOUTS, SERVICES, validateRequest };

export default app;
