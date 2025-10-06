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
import {
  generateVerificationToken,
  generateAuthTokens,
} from "../../src/utils/tokenGeneration";
import db from "../../src/db";

// Mock dependencies
vi.mock("../../src/db", () => {
  const mockDb = {
    transaction: vi.fn(),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            innerJoin: vi.fn(() => ({
              limit: vi.fn(),
            })),
          })),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(),
    })),
  };
  return { default: mockDb };
});

vi.mock("../../src/utils/tokenGeneration", () => ({
  generateVerificationToken: vi.fn(),
  generateAuthTokens: vi.fn(),
}));

vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
  hash: vi.fn(),
  compare: vi.fn(),
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
  let mockCookie: Mock;
  let mockClearCookie: Mock;

  beforeEach(() => {
    mockJson = vi.fn().mockReturnThis();
    mockStatus = vi.fn().mockReturnThis();
    mockCookie = vi.fn().mockReturnThis();
    mockClearCookie = vi.fn().mockReturnThis();

    mockRes = {
      status: mockStatus,
      json: mockJson,
      cookie: mockCookie,
      clearCookie: mockClearCookie,
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
        lastLoginAt: null,
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

  describe("login", () => {
    it("should throw BadRequestError when email or password is missing", async () => {
      // Test missing email
      mockReq = { body: { password: "password123" } };
      await expect(
        AuthCtrl.login(mockReq as Request, mockRes as Response)
      ).rejects.toThrow(BadRequestError);

      // Test missing password
      mockReq = { body: { email: "test@example.com" } };
      await expect(
        AuthCtrl.login(mockReq as Request, mockRes as Response)
      ).rejects.toThrow(BadRequestError);

      // Test both missing
      mockReq = { body: {} };
      await expect(
        AuthCtrl.login(mockReq as Request, mockRes as Response)
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw NotFoundError when user does not exist", async () => {
      mockReq = {
        body: { email: "nonexistent@example.com", password: "password123" },
        headers: { "user-agent": "test-agent" },
      };

      // Mock empty user result
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      await expect(
        AuthCtrl.login(mockReq as Request, mockRes as Response)
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw BadRequestError when email is not verified", async () => {
      mockReq = {
        body: { email: "unverified@example.com", password: "password123" },
        headers: { "user-agent": "test-agent" },
      };

      const unverifiedUser = {
        id: 1,
        email: "unverified@example.com",
        password_hash: "hashed_password",
        name: "Unverified User",
        role: "user",
        emailVerified: false,
        lastLoginAt: null,
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([unverifiedUser]),
          }),
        }),
      } as any);

      await expect(
        AuthCtrl.login(mockReq as Request, mockRes as Response)
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw BadRequestError when password is incorrect", async () => {
      mockReq = {
        body: { email: "test@example.com", password: "wrongpassword" },
        headers: { "user-agent": "test-agent" },
      };

      const user = {
        id: 1,
        email: "test@example.com",
        password_hash: "hashed_password",
        name: "Test User",
        role: "user",
        emailVerified: true,
        lastLoginAt: null,
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([user]),
          }),
        }),
      } as any);

      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await expect(
        AuthCtrl.login(mockReq as Request, mockRes as Response)
      ).rejects.toThrow(BadRequestError);

      expect(bcrypt.compare).toHaveBeenCalledWith(
        "wrongpassword",
        "hashed_password"
      );
    });

    // Fixed: Properly mock db.insert and db.update with method chaining
    it("should successfully login user with correct credentials", async () => {
      mockReq = {
        body: { email: "test@example.com", password: "correctpassword" },
        headers: { "user-agent": "test-agent" },
      };

      const user = {
        id: 1,
        email: "test@example.com",
        password_hash: "hashed_password",
        name: "Test User",
        role: "user",
        emailVerified: true,
        lastLoginAt: null,
      };

      const mockTokens = {
        accessToken: "mock-access-token",
        refreshToken: "mock-refresh-token",
        refreshTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      };

      // Mock user selection
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([user]),
          }),
        }),
      } as any);

      // Mock password comparison
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      // Mock token generation
      vi.mocked(generateAuthTokens).mockReturnValue(mockTokens);

      // Mock bcrypt hash for refresh token
      vi.mocked(bcrypt.hash).mockResolvedValue("hashed-refresh-token" as never);

      // Mock session insertion - return a promise directly
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(undefined),
        }),
      } as any);

      // Mock user update for last login - return a promise directly
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as any);

      await AuthCtrl.login(mockReq as Request, mockRes as Response);

      // Verify user was fetched
      expect(db.select).toHaveBeenCalled();

      // Verify password was compared
      expect(bcrypt.compare).toHaveBeenCalledWith(
        "correctpassword",
        "hashed_password"
      );

      // Verify tokens were generated
      expect(generateAuthTokens).toHaveBeenCalledWith(
        1,
        "user",
        "test@example.com",
        "Test User"
      );

      // Verify session was created
      expect(db.insert).toHaveBeenCalledWith(sessions);

      // Verify cookie was set
      expect(mockCookie).toHaveBeenCalledWith(
        "refreshToken",
        "mock-refresh-token",
        {
          httpOnly: true,
          secure: false, // Not in production
          expires: mockTokens.refreshTokenExpiresAt,
          sameSite: "strict",
        }
      );

      // Verify last login was updated
      expect(db.update).toHaveBeenCalledWith(users);

      // Verify response
      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        message: "Login successful",
        accessToken: "mock-access-token",
        user: {
          id: 1,
          email: "test@example.com",
          name: "Test User",
          role: "user",
        },
      });
    });

    it("should use secure cookies in production environment", async () => {
      // Save original NODE_ENV
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      mockReq = {
        body: { email: "test@example.com", password: "correctpassword" },
        headers: { "user-agent": "test-agent" },
      };

      const user = {
        id: 1,
        email: "test@example.com",
        password_hash: "hashed_password",
        name: "Test User",
        role: "user",
        emailVerified: true,
        lastLoginAt: null,
      };

      const mockTokens = {
        accessToken: "mock-access-token",
        refreshToken: "mock-refresh-token",
        refreshTokenExpiresAt: new Date(),
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([user]),
          }),
        }),
      } as any);

      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      vi.mocked(generateAuthTokens).mockReturnValue(mockTokens);
      vi.mocked(bcrypt.hash).mockResolvedValue("hashed-refresh-token" as never);

      // Mock database operations to return proper chainable objects
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(undefined),
        }),
      } as any);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as any);

      await AuthCtrl.login(mockReq as Request, mockRes as Response);

      // Verify secure cookie in production
      expect(mockCookie).toHaveBeenCalledWith(
        "refreshToken",
        "mock-refresh-token",
        expect.objectContaining({
          secure: true,
        })
      );

      // Restore original NODE_ENV
      process.env.NODE_ENV = originalNodeEnv;
    });
  });

  describe("logout", () => {
    it("should clear cookie and return success message when no refresh token in cookies", async () => {
      mockReq = { cookies: {} };

      await AuthCtrl.logout(mockReq as Request, mockRes as Response);

      expect(mockClearCookie).toHaveBeenCalledWith("refreshToken");
      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        message: "User logged out successfully",
      });
    });

    // Fixed: Properly mock db.delete with method chaining
    it("should delete session and clear cookie when refresh token exists", async () => {
      const refreshToken = "mock-refresh-token";
      mockReq = { cookies: { refreshToken } };

      // Mock bcrypt hash
      vi.mocked(bcrypt.hash).mockResolvedValue("hashed-refresh-token" as never);

      // Mock session deletion - return a promise directly
      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      } as any);

      await AuthCtrl.logout(mockReq as Request, mockRes as Response);

      // Verify refresh token was hashed
      expect(bcrypt.hash).toHaveBeenCalledWith(refreshToken, 10);

      // Verify session was deleted
      expect(db.delete).toHaveBeenCalledWith(sessions);

      // Verify cookie was cleared
      expect(mockClearCookie).toHaveBeenCalledWith("refreshToken");

      // Verify response
      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        message: "User logged out successfully",
      });
    });

    it("should handle session deletion errors gracefully", async () => {
      const refreshToken = "mock-refresh-token";
      mockReq = { cookies: { refreshToken } };

      // Mock bcrypt hash
      vi.mocked(bcrypt.hash).mockResolvedValue("hashed-refresh-token" as never);

      // Mock the entire db.delete chain to throw an error
      const mockDeleteImplementation = vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          throw new Error("Database error");
        }),
      });

      vi.mocked(db.delete).mockImplementation(mockDeleteImplementation);

      // Should still clear cookie and return success
      await AuthCtrl.logout(mockReq as Request, mockRes as Response);

      expect(mockClearCookie).toHaveBeenCalledWith("refreshToken");
      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        message: "User logged out successfully",
      });
    });
  });
});
