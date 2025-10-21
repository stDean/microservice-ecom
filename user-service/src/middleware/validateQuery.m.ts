// middleware/queryValidator.ts
import { NextFunction, Request, Response } from "express";

export const validateUserQuery = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Simple parsing without Joi
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(req.query.limit as string) || 10)
  );

  // Basic field validation
  const allowedFields = ["_id", "email", "role", "createdAt"];
  let fields = req.query.fields as string;
  if (fields) {
    fields = fields
      .split(",")
      .map((f) => f.trim())
      .filter((f) => allowedFields.includes(f))
      .join(" ");
  } else {
    fields = "_id email role createdAt"; // Default fields
  }

  req.validatedQuery = {
    page,
    limit,
    skip: (page - 1) * limit,
    fields,
  };

  next();
};
