import { describe, it, expect, vi, beforeEach, afterEach, Mock } from "vitest";
import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { StatusCodes } from "http-status-codes";
import { eq } from "drizzle-orm";
import {
  users,
  verificationTokens,
  passwordResetTokens,
  sessions,
} from "../../src/db/schema";
import { AuthCtrl } from "../../src/controller/auth.c";
import { BadRequestError, NotFoundError } from "../../src/errors";
import { generateVerificationToken } from "../../src/utils/tokenGeneration";
import db from "../../src/db";

// Mock dependencies
vi.mock("../../src/db", () => ({
  default: {
    transaction: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../../src/utils/tokenGeneration", () => ({
  generateVerificationToken: vi.fn(),
}));

vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn(),
  },
}));

vi.mock("../../src/db/schema", () => ({
  users: {},
  verificationTokens: {},
  passwordResetTokens: {},
  sessions: {},
}));

describe("AuthController", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockJson: Mock;
  let mockStatus: Mock;

  beforeEach(() => {
    mockJson = vi.fn().mockReturnThis();
    mockStatus = vi.fn().mockReturnThis();

    mockRes = {
      status: mockStatus,
      json: mockJson,
    };

    vi.clearAllMocks();
  });

  describe("register", () => {
    it("should throw BadRequestError when email or password is missing", async () => {
      mockReq = { body: { email: "", password: "" } };

      await expect(
        AuthCtrl.register(mockReq as Request, mockRes as Response)
      ).rejects.toThrow(BadRequestError);

      mockReq = { body: { email: "test@example.com" } };

      await expect(
        AuthCtrl.register(mockReq as Request, mockRes as Response)
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw BadRequestError for invalid email format", async () => {
      mockReq = {
        body: {
          email: "invalid-email",
          password: "password123",
          name: "Test User",
        },
      };

      await expect(
        AuthCtrl.register(mockReq as Request, mockRes as Response)
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw BadRequestError for short password", async () => {
      mockReq = {
        body: { email: "test@example.com", password: "123", name: "Test User" },
      };

      await expect(
        AuthCtrl.register(mockReq as Request, mockRes as Response)
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw BadRequestError when user already exists", async () => {
      mockReq = {
        body: {
          email: "existing@example.com",
          password: "password123",
          name: "Test User",
        },
      };

      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi
          .fn()
          .mockResolvedValue([{ id: 1, email: "existing@example.com" }]),
      };

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        return await callback(mockTx);
      });

      await expect(
        AuthCtrl.register(mockReq as Request, mockRes as Response)
      ).rejects.toThrow(BadRequestError);

      expect(mockTx.select).toHaveBeenCalled();
    });

    it("should successfully register user and create verification token", async () => {
      mockReq = {
        body: {
          email: "new@example.com",
          password: "password123",
          name: "New User",
        },
      };

      const mockUser = {
        id: 1,
        email: "new@example.com",
        name: "New User",
        emailVerified: false,
      };

      const mockTokenData = {
        token: "verification-token-123",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
      };

      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]), // No existing user
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([mockUser]),
      };

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        return await callback(mockTx);
      });

      vi.mocked(bcrypt.hash).mockResolvedValue("hashed-password-123" as never);
      vi.mocked(generateVerificationToken).mockReturnValue(mockTokenData);

      await AuthCtrl.register(mockReq as Request, mockRes as Response);

      // Verify bcrypt was called
      expect(bcrypt.hash).toHaveBeenCalledWith("password123", 10);

      // Verify user was inserted
      expect(mockTx.insert).toHaveBeenCalledWith(users);
      expect(mockTx.values).toHaveBeenCalledWith({
        email: "new@example.com",
        password_hash: "hashed-password-123",
        name: "New User",
        emailVerified: false,
      });

      // Verify verification token was created
      expect(generateVerificationToken).toHaveBeenCalled();
      expect(mockTx.insert).toHaveBeenCalledWith(verificationTokens);
      expect(mockTx.values).toHaveBeenCalledWith({
        userId: mockUser.id,
        token: mockTokenData.token,
        expiresAt: mockTokenData.expiresAt,
      });

      // Verify response
      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.CREATED);
      expect(mockJson).toHaveBeenCalledWith({
        message: "Registration successful. Please check your email.",
      });
    });

    it("should handle transaction rollback on error", async () => {
      mockReq = {
        body: {
          email: "test@example.com",
          password: "password123",
          name: "Test User",
        },
      };

      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockRejectedValue(new Error("Database error")),
      };

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        return await callback(mockTx);
      });

      await expect(
        AuthCtrl.register(mockReq as Request, mockRes as Response)
      ).rejects.toThrow("Database error");
    });
  });

  describe("verifyEmail", () => {
    it("should throw BadRequestError when verification token is missing", async () => {
      mockReq = { query: {} };

      await expect(
        AuthCtrl.verifyEmail(mockReq as Request, mockRes as Response)
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw NotFoundError for invalid verification token", async () => {
      mockReq = { query: { token: "invalid-token" } };

      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]), // No token found
      };

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        return await callback(mockTx);
      });

      await expect(
        AuthCtrl.verifyEmail(mockReq as Request, mockRes as Response)
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw BadRequestError for expired token and delete it", async () => {
      const expiredToken = "expired-token";
      mockReq = { query: { token: expiredToken } };

      const mockToken = {
        id: 1,
        token: expiredToken,
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
        userId: 1,
      };

      const mockUser = {
        id: 1,
        email: "test@example.com",
        emailVerified: false,
      };

      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        limit: vi
          .fn()
          .mockResolvedValue([{ token: mockToken, user: mockUser }]),
        delete: vi.fn().mockReturnThis(),
      };

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        return await callback(mockTx);
      });

      await expect(
        AuthCtrl.verifyEmail(mockReq as Request, mockRes as Response)
      ).rejects.toThrow(BadRequestError);

      // Verify token was deleted due to expiration
      expect(mockTx.delete).toHaveBeenCalledWith(verificationTokens);
    });

    it("should throw BadRequestError when email is already verified", async () => {
      const token = "valid-token";
      mockReq = { query: { token } };

      const mockToken = {
        id: 1,
        token,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
        userId: 1,
      };

      const mockUser = {
        id: 1,
        email: "test@example.com",
        emailVerified: true, // Already verified
      };

      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        limit: vi
          .fn()
          .mockResolvedValue([{ token: mockToken, user: mockUser }]),
        delete: vi.fn().mockReturnThis(),
      };

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        return await callback(mockTx);
      });

      await expect(
        AuthCtrl.verifyEmail(mockReq as Request, mockRes as Response)
      ).rejects.toThrow(BadRequestError);

      // Verify token was deleted since email was already verified
      expect(mockTx.delete).toHaveBeenCalledWith(verificationTokens);
    });

    it("should successfully verify email and delete token", async () => {
      const token = "valid-token";
      mockReq = { query: { token } };

      const mockToken = {
        id: 1,
        token,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
        userId: 1,
      };

      const mockUser = {
        id: 1,
        email: "test@example.com",
        emailVerified: false,
      };

      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        limit: vi
          .fn()
          .mockResolvedValue([{ token: mockToken, user: mockUser }]),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
      };

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        return await callback(mockTx);
      });

      await AuthCtrl.verifyEmail(mockReq as Request, mockRes as Response);

      // Verify user was updated to verified
      expect(mockTx.update).toHaveBeenCalledWith(users);
      expect(mockTx.set).toHaveBeenCalledWith({ emailVerified: true });

      // Verify token was deleted
      expect(mockTx.delete).toHaveBeenCalledWith(verificationTokens);

      // Verify response
      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        message: "Email verified successfully.",
      });
    });
  });
});
