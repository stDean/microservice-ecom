// middleware/admin.m.ts
import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import "../types/express"; // Ensure the extended type is included
import { UnauthenticatedError } from "../errors";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
      };
    }
  }
}

export const adminOnly = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) throw new UnauthenticatedError("Authentication Required.");

  if (req.user.role !== "admin") {
    return res.status(StatusCodes.FORBIDDEN).json({
      message: "Access denied. Admin privileges required.",
    });
  }

  next();
};
