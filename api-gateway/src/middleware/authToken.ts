import { NextFunction, Response } from "express";
import { StatusCodes } from "http-status-codes";
import jwt from "jsonwebtoken";
import { logger } from "../utils/logger";
import { AuthenticatedRequest } from "./serverProxy";

/**
 * @constant JWT_SECRET
 * @notice Secret key for JWT verification
 * @dev Must be set as environment variable in production
 * @env JWT_SECRET
 */
const JWT_SECRET =
  process.env.JWT_SECRET || "your-default-jwt-secret-change-in-production";

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
 * - make all health routes public
 */
export const authenticateToken = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (req.path.includes("/health")) {
    next();
    return;
  }

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
      id: decoded.userId,
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
