import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  checkCircuitBreaker,
  recordCircuitBreakerFailure,
  recordCircuitBreakerSuccess,
} from "../../src";

describe("Circuit Breaker", () => {
  beforeEach(() => {
    // Reset circuit breaker state
    vi.resetModules();
  });

  it("should allow requests when circuit is closed", () => {
    const result = checkCircuitBreaker("test-service");
    expect(result).toBe(true);
  });

  it("should open circuit after multiple failures", () => {
    // Simulate 5 failures
    for (let i = 0; i < 5; i++) {
      recordCircuitBreakerFailure("test-service");
    }

    const result = checkCircuitBreaker("test-service");
    expect(result).toBe(false);
  });

  it("should reset circuit after success", () => {
    // Cause circuit to open
    for (let i = 0; i < 5; i++) {
      recordCircuitBreakerFailure("test-service");
    }

    // Reset with success
    recordCircuitBreakerSuccess("test-service");

    const result = checkCircuitBreaker("test-service");
    expect(result).toBe(true);
  });
});
