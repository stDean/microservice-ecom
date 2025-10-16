import { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger";
import { AuthenticatedRequest } from "./serverProxy";
import { StatusCodes } from "http-status-codes";

/**
 * @interface CircuitBreakerState
 * @notice Circuit breaker state for microservices
 * @dev Implements the circuit breaker pattern for fault tolerance
 */
interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
}

/**
 * @constant circuitBreakers
 * @notice Circuit breaker state storage
 * @dev Tracks failure states for each microservice
 */
export const circuitBreakers: { [service: string]: CircuitBreakerState } = {};

/**
 * @function checkCircuitBreaker
 * @notice Circuit breaker pattern implementation
 * @dev Prevents cascading failures when services are down
 * @param serviceName - Name of the microservice
 * @returns boolean indicating if request should proceed
 */
const checkCircuitBreaker = (serviceName: string): boolean => {
  const breaker = circuitBreakers[serviceName] || {
    failures: 0,
    lastFailure: 0,
    state: "CLOSED" as const,
  };

  if (breaker.state === "OPEN") {
    // Check if we should try again (30 second cooldown)
    if (Date.now() - breaker.lastFailure > 30000) {
      breaker.state = "HALF_OPEN";
      circuitBreakers[serviceName] = breaker;
      logger.info(
        `Circuit breaker for ${serviceName} moved to HALF_OPEN`,
        undefined,
        { service: serviceName }
      );
      return true;
    }
    return false;
  }

  return true;
};

/**
 * @function recordCircuitBreakerSuccess
 * @notice Records successful request to reset circuit breaker
 * @param serviceName - Name of the microservice
 */
export const recordCircuitBreakerSuccess = (serviceName: string) => {
  if (circuitBreakers[serviceName]) {
    circuitBreakers[serviceName] = {
      failures: 0,
      lastFailure: 0,
      state: "CLOSED",
    };
  }
};

/**
 * @function recordCircuitBreakerFailure
 * @notice Records failed request to update circuit breaker state
 * @param serviceName - Name of the microservice
 */
export const recordCircuitBreakerFailure = (serviceName: string) => {
  const breaker = circuitBreakers[serviceName] || {
    failures: 0,
    lastFailure: 0,
    state: "CLOSED" as const,
  };

  breaker.failures++;
  breaker.lastFailure = Date.now();

  // Open circuit after 5 consecutive failures
  if (breaker.failures >= 5) {
    breaker.state = "OPEN";
    logger.warn(`Circuit breaker opened for ${serviceName}`, undefined, {
      service: serviceName,
      failures: breaker.failures,
    });
  }

  circuitBreakers[serviceName] = breaker;
};

export const circuitBreakerCheck = (serviceName: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!checkCircuitBreaker(serviceName)) {
      console.log(
        `⛔ [CIRCUIT BREAKER] Blocked request to ${serviceName} - circuit open`
      );
      return res.status(StatusCodes.SERVICE_UNAVAILABLE).json({
        error: "Service unavailable due to circuit breaker",
        correlationId: (req as AuthenticatedRequest).requestId,
        service: serviceName,
      });
    }
    next();
  };
};
