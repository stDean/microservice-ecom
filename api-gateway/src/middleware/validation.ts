import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { StatusCodes } from "http-status-codes";
import { validationRules } from "../utils/rules";

export const validateRequest = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.log("🔍 [VALIDATION] Checking:", {
    path: req.path,
    method: req.method,
    hasBody: !!req.body,
    query: req.query,
  });

  const rules = validationRules[req.path]?.[req.method];

  console.log("🔍 [VALIDATION] Found rules:", {
    hasRules: !!rules,
    bodyRule: !!rules?.body,
    queryRule: !!rules?.query,
    paramsRule: !!rules?.params,
  });

  if (!rules) {
    console.log("✅ [VALIDATION] No rules defined, skipping validation");
    return next();
  }

  try {
    // Validate body
    if (rules.body) {
      console.log("📝 [VALIDATION] Validating body");
      rules.body.parse(req.body);
    }

    // Validate query parameters
    if (rules.query) {
      console.log("❓ [VALIDATION] Validating query:", req.query);
      rules.query.parse(req.query);
    }

    // Validate route parameters
    if (rules.params) {
      console.log("🆔 [VALIDATION] Validating params:", req.params);
      rules.params.parse(req.params);
    }

    console.log("✅ [VALIDATION] All validations passed");
    next();
  } catch (error) {
    console.log("❌ [VALIDATION] Validation failed:", error);

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
