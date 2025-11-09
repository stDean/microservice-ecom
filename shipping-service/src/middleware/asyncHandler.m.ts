import { Request, Response, NextFunction } from "express";

// Defines the standard type for an async Express route controller
type AsyncController = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<any>;

/**
 * Wraps an asynchronous Express controller to catch any unhandled promise rejection
 * and automatically forwards the error to the main Express error-handling middleware via next(error).
 * * This keeps controller code clean, without repeated try/catch blocks.
 */
export const asyncHandler =
  (fn: AsyncController) =>
  (req: Request, res: Response, next: NextFunction) => {
    // Execute the controller function and explicitly catch any error, then pass it to next()
    Promise.resolve(fn(req, res, next)).catch(next);
  };
