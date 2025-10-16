/**
 * @namespace logger
 * @notice Structured logging utility with correlation ID support
 * @dev Outputs JSON-formatted logs for easy parsing by log aggregators
 */
export const logger = {
  /**
   * @function info
   * @notice Log informational messages
   * @param message - Human readable message
   * @param correlationId - Request correlation ID for tracing
   * @param meta - Additional metadata for context
   */
  info: (message: string, correlationId?: string, meta?: any) => {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "INFO",
        message,
        correlationId,
        ...meta,
      })
    );
  },

  /**
   * @function error
   * @notice Log error messages with stack traces
   * @param message - Human readable error message
   * @param correlationId - Request correlation ID for tracing
   * @param error - Error object with stack trace
   * @param meta - Additional error context
   */
  error: (message: string, correlationId?: string, error?: any, meta?: any) => {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "ERROR",
        message,
        correlationId,
        error: error?.message,
        stack: error?.stack,
        ...meta,
      })
    );
  },

  /**
   * @function warn
   * @notice Log warning messages
   * @param message - Human readable warning message
   * @param correlationId - Request correlation ID for tracing
   * @param meta - Additional warning context
   */
  warn: (message: string, correlationId?: string, meta?: any) => {
    console.warn(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "WARN",
        message,
        correlationId,
        ...meta,
      })
    );
  },
};
