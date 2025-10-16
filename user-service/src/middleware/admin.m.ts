// middleware/admin.m.ts
import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";

export const adminOnly = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(StatusCodes.FORBIDDEN).json({
      message: "Admin access required",
    });
  }
  next();
};
