// middleware/userFromHeaders.ts
import { NextFunction, Request, Response } from "express";

export const userFromHeaders = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    const userEmail = req.headers["x-user-email"] as string;
    const userRole = req.headers["x-user-role"] as string;

    if (userId && userEmail && userRole) {
      req.user = {
        id: userId,
        email: userEmail,
        role: userRole,
      };
    } else {
      console.warn("Missing user headers:", { userId, userEmail, userRole });
    }

    next();
  } catch (error) {
    console.error("Error parsing user from headers:", error);
    next();
  }
};
