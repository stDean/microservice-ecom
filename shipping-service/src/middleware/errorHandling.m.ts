import { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

interface CustomError {
  statusCode: number;
  msg: string;
}

interface ValidationError extends Error {
  errors: Record<string, { message: string }>;
}

interface DuplicateKeyError extends Error {
  code: number;
  keyValue: Record<string, any>;
  keyPattern?: Record<string, any>;
}

interface CastError extends Error {
  value: any;
  path?: string;
  kind?: string;
}

type AppError = ValidationError | DuplicateKeyError | CastError | Error;

const ErrorHandlerMiddleware = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Default error response
  let customError: CustomError = {
    statusCode: (err as any).statusCode || StatusCodes.INTERNAL_SERVER_ERROR,
    msg: err.message || "Something went wrong try again later",
  };

  // Mongoose Validation Error
  if (err.name === "ValidationError") {
    const validationErr = err as ValidationError;
    customError.msg = Object.values(validationErr.errors)
      .map((item) => item.message)
      .join(", ");
    customError.statusCode = StatusCodes.BAD_REQUEST;
  }

  // MongoDB Duplicate Key Error (code 11000)
  else if ((err as DuplicateKeyError).code === 11000) {
    const duplicateErr = err as DuplicateKeyError;
    const field = Object.keys(duplicateErr.keyValue)[0];
    const value = duplicateErr.keyValue[field];
    customError.msg = `Duplicate value entered for ${field} field: '${value}'. Please choose another value.`;
    customError.statusCode = StatusCodes.BAD_REQUEST;
  }

  // MongoDB Cast Error (invalid ObjectId, etc.)
  else if (err.name === "CastError") {
    const castErr = err as CastError;

    // Handle different types of cast errors
    if (castErr.path === "_id" || castErr.kind === "ObjectId") {
      customError.msg = `No item found with id: ${castErr.value}`;
      customError.statusCode = StatusCodes.NOT_FOUND;
    } else {
      customError.msg = `Invalid data format for ${castErr.path}: ${castErr.value}`;
      customError.statusCode = StatusCodes.BAD_REQUEST;
    }
  }

  // Mongoose BSON Error (invalid ObjectId format)
  else if (err.name === "BSONError" || err.message?.includes("BSON")) {
    customError.msg = "Invalid ID format";
    customError.statusCode = StatusCodes.BAD_REQUEST;
  }

  // Log unexpected errors (important for debugging)
  if (customError.statusCode >= 500) {
    console.error("Server Error:", {
      message: err.message,
      name: err.name,
      stack: err.stack,
      url: req.url,
      method: req.method,
      timestamp: new Date().toISOString(),
    });
  }

  return res.status(customError.statusCode).json({
    msg: customError.msg,
    // Include stack trace in development only
    ...(process.env.NODE_ENV === "development" && {
      stack: err.stack,
      error: err.name,
    }),
  });
};

export default ErrorHandlerMiddleware;
