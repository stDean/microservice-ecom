import { StatusCodes } from "http-status-codes";
import { Request, Response, NextFunction, ErrorRequestHandler } from "express";

// Define custom error interface for Redis errors
interface RedisError extends Error {
  code?: string;
  command?: string;
  args?: any[];
  message: string;
  statusCode?: number;
}

export const redisErrorHandlerMiddleware: ErrorRequestHandler = (
  err: RedisError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let customError = {
    statusCode: err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR,
    msg:
      err.message || "Something went wrong with Redis. Please try again later",
  };

  // Handle Redis connection errors
  if (err.code) {
    switch (err.code) {
      case "ECONNREFUSED":
      case "ENOTFOUND":
        customError.msg = "Unable to connect to Redis server";
        customError.statusCode = StatusCodes.SERVICE_UNAVAILABLE;
        break;

      case "ETIMEDOUT":
      case "ECONNABORTED":
        customError.msg = "Redis connection timeout";
        customError.statusCode = StatusCodes.REQUEST_TIMEOUT;
        break;

      case "EAI_AGAIN":
        customError.msg = "Redis DNS lookup failed";
        customError.statusCode = StatusCodes.SERVICE_UNAVAILABLE;
        break;

      case "NOAUTH":
        customError.msg = "Redis authentication failed";
        customError.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
        break;

      case "NOPERM":
        customError.msg = "Insufficient permissions for Redis operation";
        customError.statusCode = StatusCodes.FORBIDDEN;
        break;

      case "READONLY":
        customError.msg = "Redis is in read-only mode";
        customError.statusCode = StatusCodes.SERVICE_UNAVAILABLE;
        break;

      case "BUSY":
        customError.msg = "Redis is busy loading dataset in memory";
        customError.statusCode = StatusCodes.SERVICE_UNAVAILABLE;
        break;

      case "WRONGPASS":
        customError.msg = "Redis authentication password is invalid";
        customError.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
        break;

      default:
        // Handle other Redis error codes
        if (err.code.startsWith("MOVED") || err.code.startsWith("ASK")) {
          // Redis cluster redirection errors
          customError.msg = "Redis cluster node redirection required";
          customError.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
        } else if (err.code.startsWith("TRYAGAIN")) {
          // Redis cluster busy errors
          customError.msg = "Redis cluster operation conflict, please retry";
          customError.statusCode = StatusCodes.CONFLICT;
        } else if (err.code.startsWith("CLUSTER")) {
          // Redis cluster errors
          customError.msg = "Redis cluster error";
          customError.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
        } else if (err.code.startsWith("LOADING")) {
          // Redis loading dataset
          customError.msg = "Redis is loading the dataset, please try again";
          customError.statusCode = StatusCodes.SERVICE_UNAVAILABLE;
        }
        break;
    }
  }

  // Handle connection errors by message content
  if (
    err.message?.includes("connect") ||
    err.message?.includes("connection") ||
    err.message?.includes("ECONNREFUSED") ||
    err.message?.includes("Socket closed")
  ) {
    customError.msg = "Unable to connect to Redis server";
    customError.statusCode = StatusCodes.SERVICE_UNAVAILABLE;
  }

  // Handle timeout errors
  if (
    err.name?.includes("TimeoutError") ||
    err.message?.includes("timeout") ||
    err.message?.includes("ETIMEDOUT")
  ) {
    customError.msg = "Redis operation timed out";
    customError.statusCode = StatusCodes.REQUEST_TIMEOUT;
  }

  // Handle authentication errors
  if (
    err.message?.includes("auth") ||
    err.message?.includes("password") ||
    err.message?.includes("NOAUTH") ||
    err.message?.includes("WRONGPASS")
  ) {
    customError.msg = "Redis authentication failed";
    customError.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
  }

  // Handle max retries and connection limit errors
  if (
    err.message?.includes("max retries") ||
    err.message?.includes("retry") ||
    err.message?.includes("MaxRetriesPerRequestError")
  ) {
    customError.msg = "Redis operation exceeded maximum retry attempts";
    customError.statusCode = StatusCodes.REQUEST_TIMEOUT;
  }

  // Handle memory and resource errors
  if (
    err.message?.includes("OOM") ||
    err.message?.includes("out of memory") ||
    err.message?.includes("maxmemory")
  ) {
    customError.msg = "Redis server is out of memory";
    customError.statusCode = StatusCodes.INSUFFICIENT_STORAGE;
  }

  // Handle command syntax and argument errors
  if (
    err.message?.includes("syntax") ||
    err.message?.includes("command") ||
    err.message?.includes("argument") ||
    err.message?.includes("WRONGTYPE")
  ) {
    customError.msg = "Invalid Redis command or arguments";
    customError.statusCode = StatusCodes.BAD_REQUEST;
  }

  // Handle key not found errors (specific to cache operations)
  if (
    err.message?.includes("key") &&
    (err.message?.includes("not found") ||
      err.message?.includes("does not exist"))
  ) {
    customError.msg = "Requested resource not found in cache";
    customError.statusCode = StatusCodes.NOT_FOUND;
  }

  // Handle data serialization/deserialization errors
  if (
    err.message?.includes("JSON") ||
    err.message?.includes("parse") ||
    err.message?.includes("stringify") ||
    err.message?.includes("serialize")
  ) {
    customError.msg = "Data serialization error in Redis operation";
    customError.statusCode = StatusCodes.BAD_REQUEST;
  }

  // Handle pub/sub specific errors
  if (
    err.message?.includes("subscribe") ||
    err.message?.includes("publish") ||
    err.message?.includes("channel") ||
    err.message?.includes("PUBSUB")
  ) {
    customError.msg = "Redis Pub/Sub operation failed";
    customError.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
  }

  // Handle transaction errors
  if (
    err.message?.includes("transaction") ||
    err.message?.includes("multi") ||
    err.message?.includes("exec") ||
    err.message?.includes("WATCH")
  ) {
    customError.msg = "Redis transaction failed";
    customError.statusCode = StatusCodes.CONFLICT;
  }

  // Handle Lua script errors
  if (
    err.message?.includes("script") ||
    err.message?.includes("Lua") ||
    err.message?.includes("EVAL")
  ) {
    customError.msg = "Redis script execution error";
    customError.statusCode = StatusCodes.BAD_REQUEST;
  }

  // Handle database selection errors
  if (err.message?.includes("DB") || err.message?.includes("database")) {
    customError.msg = "Redis database selection error";
    customError.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
  }

  res.status(customError.statusCode).json({
    message: customError.msg,
    // Include additional debug info in development
    ...(process.env.NODE_ENV === "development" && {
      stack: err.stack,
      errorCode: err.code,
      command: err.command,
    }),
  });
};
