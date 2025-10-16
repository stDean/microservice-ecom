import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { StatusCodes } from "http-status-codes";
import { validationRules } from "../utils/rules";

export const validateRequest = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const rules = validationRules[req.path]?.[req.method];

  if (!rules) {
    return next();
  }

  try {
    // Validate body
    if (rules.body) {
      rules.body.parse(req.body);
    }

    // Validate query parameters
    if (rules.query) {
      rules.query.parse(req.query);
    }

    // Validate route parameters
    if (rules.params) {
      rules.params.parse(req.params);
    }

    next();
  } catch (error) {
    if (error instanceof ZodError) {
      const errors = error.issues.map((err) => {
        const field = err.path.join(".");
        return `${field}: ${err.message}`;
      });

      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Validation failed",
        details: errors,
        correlationId: (req as any).requestId,
      });
    }

    // Pass other errors to global error handler
    next(error);
  }
};
