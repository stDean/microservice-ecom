import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  circuitBreakerCheck,
  circuitBreakers,
  recordCircuitBreakerSuccess,
  recordCircuitBreakerFailure,
} from "../../src/middleware/circuitBreaker";
import { StatusCodes } from "http-status-codes";
import { logger } from "../../src/utils/logger";

describe("Circuit Breaker", () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: any;

  beforeEach(() => {
    mockReq = {
      requestId: "test-request-id",
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    mockNext = vi.fn();

    // Reset circuit breakers before each test
    Object.keys(circuitBreakers).forEach((key) => delete circuitBreakers[key]);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("circuitBreakerCheck middleware", () => {
    it("should allow request when circuit is CLOSED", () => {
      const middleware = circuitBreakerCheck("test-service");

      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it("should block request when circuit is OPEN", () => {
      // Force circuit to open
      circuitBreakers["test-service"] = {
        failures: 5,
        lastFailure: Date.now(),
        state: "OPEN",
      };

      const middleware = circuitBreakerCheck("test-service");
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(
        StatusCodes.SERVICE_UNAVAILABLE
      );
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Service unavailable due to circuit breaker",
        correlationId: "test-request-id",
        service: "test-service",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should allow request when circuit is OPEN but cooldown period passed", () => {
      vi.useFakeTimers();

      // Set last failure to 31 seconds ago
      circuitBreakers["test-service"] = {
        failures: 5,
        lastFailure: Date.now() - 31000,
        state: "OPEN",
      };

      const middleware = circuitBreakerCheck("test-service");
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(circuitBreakers["test-service"].state).toBe("HALF_OPEN");
    });
  });

  describe("recordCircuitBreakerSuccess", () => {
    it("should reset circuit breaker on success", () => {
      circuitBreakers["test-service"] = {
        failures: 3,
        lastFailure: Date.now(),
        state: "HALF_OPEN",
      };

      recordCircuitBreakerSuccess("test-service");

      expect(circuitBreakers["test-service"]).toEqual({
        failures: 0,
        lastFailure: 0,
        state: "CLOSED",
      });
    });

    it("should handle success when no circuit breaker exists", () => {
      expect(() => {
        recordCircuitBreakerSuccess("non-existent-service");
      }).not.toThrow();
    });
  });

  describe("recordCircuitBreakerFailure", () => {
    it("should increment failures and update last failure time", () => {
      recordCircuitBreakerFailure("test-service");

      expect(circuitBreakers["test-service"].failures).toBe(1);
      expect(circuitBreakers["test-service"].lastFailure).toBeGreaterThan(0);
      expect(circuitBreakers["test-service"].state).toBe("CLOSED");
    });

    it("should open circuit after 5 failures", () => {
      // Simulate 5 failures
      for (let i = 0; i < 5; i++) {
        recordCircuitBreakerFailure("test-service");
      }

      expect(circuitBreakers["test-service"].failures).toBe(5);
      expect(circuitBreakers["test-service"].state).toBe("OPEN");
      expect(logger.warn).toHaveBeenCalled();
    });

    it("should create new circuit breaker for new service", () => {
      recordCircuitBreakerFailure("new-service");

      expect(circuitBreakers["new-service"]).toBeDefined();
      expect(circuitBreakers["new-service"].failures).toBe(1);
    });
  });
});
