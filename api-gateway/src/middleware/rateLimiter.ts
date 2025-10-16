import rateLimit from "express-rate-limit";

/**
 * @function createRateLimit
 * @notice Creates configured rate limit middleware
 * @dev Different endpoints can have different rate limits
 * @param windowMs - Time window in milliseconds
 * @param max - Maximum number of requests per window
 * @returns Configured rate limit middleware
 */
export const createRateLimit = (windowMs: number, max: number) =>
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
