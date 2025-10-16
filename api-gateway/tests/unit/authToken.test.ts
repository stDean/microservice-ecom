import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { authenticateToken } from "../../src/middleware/authToken";
import { StatusCodes } from "http-status-codes";
import jwt from "jsonwebtoken";
import { logger } from "../../src/utils/logger";

// Mock dependencies
vi.mock("jsonwebtoken");

describe("authenticateToken", () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: any;

  beforeEach(() => {
    mockReq = {
      headers: {},
      path: "/api/users",
      requestId: "test-request-id",
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    mockNext = vi.fn();
    vi.clearAllMocks();
  });

  describe("public routes", () => {
    it("should allow access to health routes without token", () => {
      mockReq.path = "/health";

      authenticateToken(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it("should allow access to nested health routes", () => {
      mockReq.path = "/api/health/status";

      authenticateToken(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe("missing token", () => {
    it("should return 401 when no authorization header", () => {
      authenticateToken(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(StatusCodes.UNAUTHORIZED);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Access token required",
        correlationId: "test-request-id",
      });
      expect(logger.warn).toHaveBeenCalled();
    });

    it("should return 401 when authorization header is malformed", () => {
      mockReq.headers.authorization = "InvalidFormat";

      authenticateToken(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(StatusCodes.UNAUTHORIZED);
    });
  });

  describe("valid token", () => {
    it("should set user data and call next with valid token", () => {
      const mockUser = {
        userId: "123",
        email: "test@example.com",
        role: "user",
      };

      mockReq.headers.authorization = "Bearer valid-token";
      (jwt.verify as Mock).mockReturnValue(mockUser);

      authenticateToken(mockReq, mockRes, mockNext);

      expect(jwt.verify).toHaveBeenCalledWith(
        "valid-token",
        process.env.JWT_SECRET
      );
      expect(mockReq.user).toEqual({
        id: "123",
        email: "test@example.com",
        role: "user",
      });
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe("invalid token", () => {
    it("should return 403 when token is invalid", () => {
      mockReq.headers.authorization = "Bearer invalid-token";
      (jwt.verify as Mock).mockImplementation(() => {
        throw new Error("Invalid token");
      });

      authenticateToken(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(StatusCodes.FORBIDDEN);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Invalid or expired token",
        correlationId: "test-request-id",
      });
      expect(logger.error).toHaveBeenCalled();
    });

    it("should return 403 when token is expired", () => {
      mockReq.headers.authorization = "Bearer expired-token";
      (jwt.verify as Mock).mockImplementation(() => {
        throw new jwt.TokenExpiredError("Token expired", new Date());
      });

      authenticateToken(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(StatusCodes.FORBIDDEN);
    });
  });
});
