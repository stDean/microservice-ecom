import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Extend the Request interface to include the requestId and user properties
declare module "express-serve-static-core" {
  interface Request {
    requestId?: string;
    user?: {
      id: string;
      email: string;
      role: string;
    };
  }
}

import {
  authenticateToken,
  checkCircuitBreaker,
  recordCircuitBreakerFailure,
  recordCircuitBreakerSuccess,
  requestIdMiddleware,
  validateAgainstSchema,
  circuitBreakers,
} from "../../src";

describe("Middleware Unit Tests", () => {
  describe("validateAgainstSchema", () => {
    it("should validate required fields correctly", () => {
      const schema = {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
        required: ["name"],
      };

      const validData = { name: "John", age: 30 };
      const invalidData = { age: 30 };

      const validResult = validateAgainstSchema(validData, schema);
      const invalidResult = validateAgainstSchema(invalidData, schema);

      expect(validResult.isValid).toBe(true);
      expect(validResult.errors).toHaveLength(0);

      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors).toContain("name is required");
    });

    it("should validate string constraints", () => {
      const schema = {
        type: "object",
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 6 },
        },
      };

      const data = { email: "invalid-email", password: "123" };
      const result = validateAgainstSchema(data, schema);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("email must be a valid email address");
      expect(result.errors).toContain("password must be at least 6 characters");
    });

    it("should validate number constraints", () => {
      const schema = {
        type: "object",
        properties: {
          price: { type: "number", minimum: 0 },
          quantity: { type: "number" },
        },
      };

      const data = { price: -10, quantity: "not-a-number" };
      const result = validateAgainstSchema(data, schema);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("price must be at least 0");
      expect(result.errors).toContain("quantity must be a number");
    });
  });

  describe("Circuit Breaker", () => {
    beforeEach(() => {
      // Reset circuit breakers before each test
      Object.keys(circuitBreakers).forEach((key) => {
        delete circuitBreakers[key];
      });
    });

    it("should allow requests when circuit is CLOSED", () => {
      const serviceName = "test-service";
      const result = checkCircuitBreaker(serviceName);

      expect(result).toBe(true);
    });

    it("should block requests when circuit is OPEN", () => {
      const serviceName = "test-service";

      // Simulate multiple failures to open the circuit
      for (let i = 0; i < 5; i++) {
        recordCircuitBreakerFailure(serviceName);
      }

      const result = checkCircuitBreaker(serviceName);
      expect(result).toBe(false);
    });

    it("should transition to HALF_OPEN after cooldown period", () => {
      const serviceName = "test-service";

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        recordCircuitBreakerFailure(serviceName);
      }

      // Mock Date to simulate time passing
      const originalDateNow = Date.now;
      Date.now = vi.fn(() => originalDateNow() + 35000); // 35 seconds later

      const result = checkCircuitBreaker(serviceName);
      expect(result).toBe(true);

      Date.now = originalDateNow; // Restore
    });

    it("should reset circuit on success", () => {
      const serviceName = "test-service";

      // Record some failures
      recordCircuitBreakerFailure(serviceName);
      recordCircuitBreakerSuccess(serviceName);

      expect(circuitBreakers[serviceName].failures).toBe(0);
      expect(circuitBreakers[serviceName].state).toBe("CLOSED");
    });
  });

  describe("Request ID Middleware", () => {
    it("should generate request ID if not present", () => {
      const req = { headers: {} } as Request;
      const res = { setHeader: vi.fn() } as unknown as Response;
      const next = vi.fn() as NextFunction;

      requestIdMiddleware(req, res, next);

      expect(req.requestId).toBeDefined();
      expect(res.setHeader).toHaveBeenCalledWith("X-Request-Id", req.requestId);
      expect(next).toHaveBeenCalled();
    });

    it("should use existing request ID from headers", () => {
      const existingId = "existing-request-id";
      const req = {
        headers: { "x-request-id": existingId },
        get: vi.fn(),
        header: vi.fn(),
        accepts: vi.fn(),
        acceptsCharsets: vi.fn(),
        acceptsEncodings: vi.fn(),
        acceptsLanguages: vi.fn(),
        range: vi.fn(),
      } as unknown as Request;
      const res = { setHeader: vi.fn() } as unknown as Response;
      const next = vi.fn() as NextFunction;

      requestIdMiddleware(req, res, next);

      expect(req.requestId).toBe(existingId);
      expect(res.setHeader).toHaveBeenCalledWith("X-Request-Id", existingId);
    });
  });

  describe("Authentication Middleware", () => {
    it("should allow public routes without token", () => {
      const req = {
        path: "/health",
        method: "GET",
        headers: {},
      } as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn() as NextFunction;

      authenticateToken(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("should return 401 for protected routes without token", () => {
      const req = {
        path: "/api/v1/users",
        method: "GET",
        headers: {},
        requestId: "test-request-id",
      } as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn() as NextFunction;

      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "Access token required",
        correlationId: "test-request-id",
      });
    });

    it("should return 403 for invalid token", () => {
      const req = {
        path: "/api/v1/users",
        method: "GET",
        headers: { authorization: "Bearer invalid-token" },
        requestId: "test-request-id",
      } as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn() as NextFunction;

      // Mock jwt.verify to throw error
      vi.spyOn(jwt, "verify").mockImplementation(() => {
        throw new Error("Invalid token");
      });

      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid or expired token",
        correlationId: "test-request-id",
      });

      vi.restoreAllMocks();
    });

    it("should attach user to request for valid token", () => {
      const mockUser = { id: "123", email: "test@example.com", role: "user" };
      const req = {
        path: "/api/v1/users",
        method: "GET",
        headers: { authorization: "Bearer valid-token" },
        requestId: "test-request-id",
      } as Request;
      const res = {} as Response;
      const next = vi.fn() as NextFunction;

      // Mock jwt.verify to return user
      vi.spyOn(jwt, "verify").mockReturnValue(mockUser as any);

      authenticateToken(req, res, next);

      expect(req.user).toEqual(mockUser);
      expect(next).toHaveBeenCalled();

      vi.restoreAllMocks();
    });
  });
});
