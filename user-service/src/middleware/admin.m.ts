import { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

export const adminOnly = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res
      .status(StatusCodes.FORBIDDEN)
      .json({ message: "User Not Authenticated" });
  }

  const { role } = req.user;
  if (role === "customer") {
    return res
      .status(StatusCodes.UNAUTHORIZED)
      .json({ message: "User Not Authorized" });
  }

  next();
};
