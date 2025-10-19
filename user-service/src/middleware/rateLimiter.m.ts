// // middleware/rateLimit.ts
// import { Request, Response, NextFunction } from "express";
// import { RateLimiterRedis } from "rate-limiter-flexible";
// import RedisService from "../redis/client";
// import { StatusCodes } from "http-status-codes";

// const redis = RedisService.getInstance();

// // Different rate limits for different endpoints
// const createRateLimiter = (
//   points: number,
//   duration: number,
//   keyPrefix: string
// ) => {
//   return new RateLimiterRedis({
//     storeClient: redis, // Your Redis service instance
//     keyPrefix,
//     points, // Number of requests
//     duration, // Per seconds
//     blockDuration: 60, // Block for 60 seconds if exceeded
//   });
// };

// // Admin endpoints - more generous limits
// export const adminRateLimit = createRateLimiter(100, 900, "admin_rate_limit"); // 100 requests per 15 minutes

// // Public endpoints - stricter limits
// export const publicRateLimit = createRateLimiter(50, 300, "public_rate_limit"); // 50 requests per 5 minutes

// export const rateLimitMiddleware = (limiter: RateLimiterRedis) => {
//   return async (req: Request, res: Response, next: NextFunction) => {
//     try {
//       const key = req.user ? `user:${req.user.id}` : `ip:${req.ip}`;
//       await limiter.consume(key);
//       next();
//     } catch (error: any) {
//       return res.status(StatusCodes.TOO_MANY_REQUESTS).json({
//         message: "Too many requests, please try again later.",
//         retryAfter: error.msBeforeNext
//           ? Math.ceil(error.msBeforeNext / 1000)
//           : 60,
//       });
//     }
//   };
// };
