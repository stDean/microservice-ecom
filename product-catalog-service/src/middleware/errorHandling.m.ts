import { StatusCodes } from "http-status-codes";
import { Request, Response, NextFunction, ErrorRequestHandler } from "express";

// Define custom error interface
interface HttpError extends Error {
  statusCode?: number;
  code?: string;
  message: string;
  detail?: string;
  column?: string;
  table?: string;
  constraint?: string;
}

export const errorHandlerMiddleware: ErrorRequestHandler = (
  err: HttpError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let customError = {
    statusCode: err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR,
    msg: err.message || "Something went wrong. Please try again later",
  };

  // Handle PostgreSQL errors
  if (err.code) {
    switch (err.code) {
      case "23505": // Unique constraint violation
        customError.msg =
          err.detail || "Duplicate entry - resource already exists";
        customError.statusCode = StatusCodes.CONFLICT;
        break;

      case "23503": // Foreign key constraint violation
        customError.msg =
          err.detail || "Invalid relation - referenced resource not found";
        customError.statusCode = StatusCodes.BAD_REQUEST;
        break;

      case "23502": // Not null constraint violation
        customError.msg = `Required field cannot be null: ${err.column}`;
        customError.statusCode = StatusCodes.BAD_REQUEST;
        break;

      case "22001": // String data right truncation (value too long)
        customError.msg = `Value too long for field: ${err.column}`;
        customError.statusCode = StatusCodes.BAD_REQUEST;
        break;

      case "42P01": // Table does not exist
        customError.msg = `Database table not found: ${err.table}`;
        customError.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
        break;

      case "42703": // Column does not exist
        customError.msg = `Database column not found: ${err.column}`;
        customError.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
        break;

      case "22P02": // Invalid text representation (malformed ID/type)
        customError.msg = "Invalid ID or data format";
        customError.statusCode = StatusCodes.BAD_REQUEST;
        break;

      case "23514": // Check constraint violation
        customError.msg = err.detail || "Data validation failed";
        customError.statusCode = StatusCodes.BAD_REQUEST;
        break;

      case "25P02": // Transaction errors
        customError.msg = "Database transaction failed";
        customError.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
        break;

      case "08000": // Connection exceptions
      case "08003": // Connection does not exist
      case "08006": // Connection failure
        customError.msg = "Database connection error";
        customError.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
        break;

      case "57014": // Query timeout
        customError.msg = "Database query timeout";
        customError.statusCode = StatusCodes.REQUEST_TIMEOUT;
        break;

      default:
        // Categorize unknown PostgreSQL errors by class
        if (err.code.startsWith("23")) {
          // Constraint violations
          customError.msg = err.detail || "Database constraint violation";
          customError.statusCode = StatusCodes.BAD_REQUEST;
        } else if (err.code.startsWith("22")) {
          // Data exceptions
          customError.msg = "Invalid data format";
          customError.statusCode = StatusCodes.BAD_REQUEST;
        } else if (err.code.startsWith("42")) {
          // Syntax errors
          customError.msg = "Database syntax error";
          customError.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
        } else if (err.code.startsWith("53")) {
          // Insufficient resources
          customError.msg = "Database system overloaded";
          customError.statusCode = StatusCodes.SERVICE_UNAVAILABLE;
        } else {
          customError.msg = `Database error: ${err.code}`;
          customError.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
        }
        break;
    }
  }

  // Handle connection/timeout errors
  if (err.name?.includes("TimeoutError") || err.message?.includes("timeout")) {
    customError.msg = "Database operation timed out";
    customError.statusCode = StatusCodes.REQUEST_TIMEOUT;
  }

  // Handle connection refused/network errors
  if (
    err.message?.includes("connect") ||
    err.message?.includes("connection") ||
    err.message?.includes("ECONNREFUSED")
  ) {
    customError.msg = "Unable to connect to database";
    customError.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
  }

  // Handle validation errors
  if (err.name === "ValidationError" || err.message?.includes("validation")) {
    customError.msg = "Invalid input data format";
    customError.statusCode = StatusCodes.BAD_REQUEST;
  }

  // Handle not found errors
  if (
    err.message?.includes("not found") ||
    err.message?.includes("Not Found")
  ) {
    customError.msg = "Resource not found";
    customError.statusCode = StatusCodes.NOT_FOUND;
  }

  res.status(customError.statusCode).json({
    message: customError.msg,
    // Include stack trace in development only
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};
