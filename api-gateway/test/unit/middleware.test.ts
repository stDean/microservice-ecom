import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";

declare module "express" {
  export interface Request {
    requestId?: string;
  }
}
import {
  requestIdMiddleware,
  authenticateToken,
  validateRequest,
  validateAgainstSchema,
} from "../../src";
import jwt from "jsonwebtoken";

describe("Middleware Unit Tests", () => {
  describe("requestIdMiddleware", () => {
    it("should generate request ID when not provided", () => {
      const req = { headers: {} } as Request;
      const res = { setHeader: vi.fn() } as any;
      const next = vi.fn();

      requestIdMiddleware(req, res, next);

      expect(req.requestId).toBeDefined();
      expect(res.setHeader).toHaveBeenCalledWith("X-Request-Id", req.requestId);
      expect(next).toHaveBeenCalled();
    });

    it("should use provided request ID", () => {
      const req = { headers: { "x-request-id": "test-123" } } as any;
      const res = { setHeader: vi.fn() } as any;
      const next = vi.fn();

      requestIdMiddleware(req, res, next);

      expect(req.requestId).toBe("test-123");
      expect(res.setHeader).toHaveBeenCalledWith("X-Request-Id", "test-123");
    });
  });

  describe("authenticateToken", () => {
    let req: any;
    let res: any;
    let next: NextFunction;

    beforeEach(() => {
      req = {
        path: "/api/v1/users",
        headers: {},
        requestId: "test-123",
      };
      res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      next = vi.fn();
    });

    it("should allow public routes without token", () => {
      req.path = "/health";

      authenticateToken(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should return 401 for missing token on protected routes", () => {
      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "Access token required",
        correlationId: "test-123",
      });
    });

    it("should return 403 for invalid token", () => {
      req.headers.authorization = "Bearer invalid-token";
      vi.spyOn(jwt, "verify").mockImplementation(() => {
        throw new Error("Invalid token");
      });

      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid or expired token",
        correlationId: "test-123",
      });
    });

    it("should set user for valid token", () => {
      const mockUser = { id: "123", email: "test@test.com", role: "user" };
      req.headers.authorization = "Bearer valid-token";
      vi.spyOn(jwt, "verify").mockReturnValue(mockUser as any);

      authenticateToken(req, res, next);

      expect(req.user).toEqual(mockUser);
      expect(next).toHaveBeenCalled();
    });
  });

  describe("Validation Middleware", () => {
    let req: any;
    let res: any;
    let next: NextFunction;

    beforeEach(() => {
      req = {
        path: "/api/v1/users",
        method: "POST",
        body: {},
        query: {},
        params: {},
        requestId: "test-123",
      };
      res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      next = vi.fn();
    });

    describe("validateAgainstSchema", () => {
      it("should validate required fields", () => {
        const schema = {
          type: "object",
          properties: {
            name: { type: "string" },
            email: { type: "string", format: "email" },
          },
          required: ["name", "email"],
        };

        const data = { name: "John" }; // Missing email
        const result = validateAgainstSchema(data, schema);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain("email is required");
      });

      it("should validate string types and minLength", () => {
        const schema = {
          type: "object",
          properties: {
            name: { type: "string", minLength: 3 },
            age: { type: "number" },
          },
        };

        const data = { name: "Jo", age: "not-a-number" };
        const result = validateAgainstSchema(data, schema);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain("name must be at least 3 characters");
        expect(result.errors).toContain("age must be a number");
      });

      it("should validate email format", () => {
        const schema = {
          type: "object",
          properties: {
            email: { type: "string", format: "email" },
          },
        };

        const data = { email: "invalid-email" };
        const result = validateAgainstSchema(data, schema);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain("email must be a valid email address");
      });

      it("should return valid for correct data", () => {
        const schema = {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1 },
            email: { type: "string", format: "email" },
            age: { type: "number", minimum: 0 },
          },
          required: ["name", "email"],
        };

        const data = {
          name: "John Doe",
          email: "john@example.com",
          age: 25,
        };
        const result = validateAgainstSchema(data, schema);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    describe("validateRequest", () => {
      it("should call next when no validation rules exist", () => {
        req.path = "/api/v1/nonexistent";

        validateRequest(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      });

      it("should validate request body against rules", () => {
        req.body = { email: "invalid-email" }; // Missing required fields

        validateRequest(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          error: "Validation failed",
          details: expect.arrayContaining([
            expect.stringContaining("email must be a valid email address"),
            expect.stringContaining("name is required"),
            expect.stringContaining("password is required"),
          ]),
          correlationId: "test-123",
        });
      });

      it("should allow valid request body", () => {
        req.body = {
          email: "test@example.com",
          name: "Test User",
          password: "password123",
        };

        validateRequest(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      });

      it("should validate product creation", () => {
        req.path = "/api/v1/products";
        req.method = "POST";
        req.body = { name: "Test Product" }; // Missing price

        validateRequest(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          error: "Validation failed",
          details: expect.arrayContaining([
            expect.stringContaining("price is required"),
          ]),
          correlationId: "test-123",
        });
      });
    });
  });
});
