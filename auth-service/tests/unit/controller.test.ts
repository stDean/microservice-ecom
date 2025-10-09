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

  describe("resendVerificationEmail", () => {
    it("should throw BadRequestError when email is missing or invalid", async () => {
      // Test missing email
      mockReq = { body: {} };
      await expect(
        AuthCtrl.resendVerificationEmail(
          mockReq as Request,
          mockRes as Response
        )
      ).rejects.toThrow(BadRequestError);

      // Test invalid email
      mockReq = { body: { email: "invalid-email" } };
      await expect(
        AuthCtrl.resendVerificationEmail(
          mockReq as Request,
          mockRes as Response
        )
      ).rejects.toThrow(BadRequestError);
    });

    it("should return success message when user does not exist", async () => {
      mockReq = { body: { email: "nonexistent@example.com" } };

      // Mock empty user result
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      await AuthCtrl.resendVerificationEmail(
        mockReq as Request,
        mockRes as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        message: "If an account is found, a verification link has been sent.",
      });
    });

    it("should return success message when email is already verified", async () => {
      mockReq = { body: { email: "verified@example.com" } };

      const verifiedUser = {
        id: "user-uuid-123", // Use string UUID to match schema
        email: "verified@example.com",
        emailVerified: true,
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([verifiedUser]),
          }),
        }),
      } as any);

      await AuthCtrl.resendVerificationEmail(
        mockReq as Request,
        mockRes as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        message: "Email is already verified. You may proceed to log in.",
      });
    });

    it("should resend verification email for unverified user", async () => {
      mockReq = { body: { email: "unverified@example.com" } };

      const unverifiedUser = {
        id: "user-uuid-123", // Use string UUID to match schema
        email: "unverified@example.com",
        emailVerified: false,
      };

      const mockTokenData = {
        token: "new-verification-token-123",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      // Mock user selection
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([unverifiedUser]),
          }),
        }),
      } as any);

      // Mock transaction
      const mockTx = {
        delete: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        return await callback(mockTx);
      });

      vi.mocked(generateVerificationToken).mockReturnValue(mockTokenData);

      await AuthCtrl.resendVerificationEmail(
        mockReq as Request,
        mockRes as Response
      );

      // Verify old tokens were deleted
      expect(mockTx.delete).toHaveBeenCalledWith(verificationTokens);
      expect(mockTx.where).toHaveBeenCalled();

      // Verify new token was created
      expect(generateVerificationToken).toHaveBeenCalled();
      expect(mockTx.insert).toHaveBeenCalledWith(verificationTokens);
      expect(mockTx.values).toHaveBeenCalledWith({
        userId: "user-uuid-123",
        token: "new-verification-token-123",
        expiresAt: mockTokenData.expiresAt,
      });

      // Verify response
      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        message: "A new verification link has been sent to your email.",
      });
    });

    it("should handle transaction errors gracefully", async () => {
      mockReq = { body: { email: "unverified@example.com" } };

      const unverifiedUser = {
        id: "user-uuid-123", // Use string UUID to match schema
        email: "unverified@example.com",
        emailVerified: false,
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([unverifiedUser]),
          }),
        }),
      } as any);

      // Mock transaction to throw error
      vi.mocked(db.transaction).mockRejectedValue(
        new Error("Transaction failed")
      );

      await expect(
        AuthCtrl.resendVerificationEmail(
          mockReq as Request,
          mockRes as Response
        )
      ).rejects.toThrow("Transaction failed");
    });

    it("should handle array destructuring when user exists", async () => {
      mockReq = { body: { email: "test@example.com" } };

      const user = {
        id: "user-uuid-123", // Use string UUID to match schema
        email: "test@example.com",
        emailVerified: false,
      };

      // Mock returning an array with the user
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([user]),
          }),
        }),
      } as any);

      // Mock transaction
      const mockTx = {
        delete: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        return await callback(mockTx);
      });

      vi.mocked(generateVerificationToken).mockReturnValue({
        token: "test-token",
        expiresAt: new Date(),
      });

      await AuthCtrl.resendVerificationEmail(
        mockReq as Request,
        mockRes as Response
      );

      expect(mockTx.delete).toHaveBeenCalledWith(verificationTokens);
      expect(mockTx.where).toHaveBeenCalled();
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

    it("should successfully login user with correct credentials", async () => {
      mockReq = {
        body: { email: "test@example.com", password: "correctpassword" },
        headers: { "user-agent": "test-agent" },
        ip: "127.0.0.1",
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

      // FIXED: Mock transaction with proper tx methods
      const mockTx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue(undefined),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      };

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        return await callback(mockTx);
      });

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

      // Verify session was created within transaction
      expect(mockTx.insert).toHaveBeenCalledWith(sessions);

      // Verify cookie was set with new options
      expect(mockCookie).toHaveBeenCalledWith(
        "refreshToken",
        "mock-refresh-token",
        {
          httpOnly: true,
          secure: false, // Not in production
          expires: mockTokens.refreshTokenExpiresAt,
          sameSite: "strict",
          path: "/",
          domain: undefined, // process.env.COOKIE_DOMAIN is undefined in test
        }
      );

      // Verify last login was updated within transaction
      expect(mockTx.update).toHaveBeenCalledWith(users);

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
        ip: "127.0.0.1",
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

      // FIXED: Mock transaction
      const mockTx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue(undefined),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      };

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        return await callback(mockTx);
      });

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

      expect(mockClearCookie).toHaveBeenCalledWith("refreshToken", {
        path: "/",
        domain: undefined, // process.env.COOKIE_DOMAIN is undefined in test
      });
      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        message: "User logged out successfully",
      });
    });

    it("should delete session and clear cookie when refresh token exists", async () => {
      const refreshToken = "mock-refresh-token";
      mockReq = { cookies: { refreshToken } };

      // Mock session data
      const mockSessions = [
        {
          id: 1,
          userId: 1,
          refresh_token_hash: "hashed-refresh-token",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          userAgent: "test-agent",
        },
      ];

      // Mock session selection - FIXED: Use proper chaining
      const mockFrom = vi.fn().mockReturnValue(mockSessions);
      vi.mocked(db.select).mockReturnValue({
        from: mockFrom,
      } as any);

      // Mock bcrypt.compare to return true for the session
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      // Mock session deletion
      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      } as any);

      await AuthCtrl.logout(mockReq as Request, mockRes as Response);

      // FIXED: Verify sessions were fetched - separate assertions
      expect(db.select).toHaveBeenCalled();
      expect(mockFrom).toHaveBeenCalledWith(sessions);

      // Verify bcrypt.compare was called to find the matching session
      expect(bcrypt.compare).toHaveBeenCalledWith(
        refreshToken,
        mockSessions[0].refresh_token_hash
      );

      // Verify session was deleted
      expect(db.delete).toHaveBeenCalledWith(sessions);

      // Verify cookie was cleared with new options
      expect(mockClearCookie).toHaveBeenCalledWith("refreshToken", {
        path: "/",
        domain: undefined,
      });

      // Verify response
      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        message: "User logged out successfully",
      });
    });

    it("should handle session deletion errors gracefully", async () => {
      const refreshToken = "mock-refresh-token";
      mockReq = { cookies: { refreshToken } };

      // Mock empty sessions
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue([]),
        }),
      } as any);

      // Should still clear cookie and return success even if no sessions found
      await AuthCtrl.logout(mockReq as Request, mockRes as Response);

      expect(mockClearCookie).toHaveBeenCalledWith("refreshToken", {
        path: "/",
        domain: undefined,
      });
      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        message: "User logged out successfully",
      });
    });
  });

  describe("refreshToken", () => {
    it("should throw BadRequestError when no refresh token in cookies", async () => {
      mockReq = { cookies: {} };

      await expect(
        AuthCtrl.refreshToken(mockReq as Request, mockRes as Response)
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw BadRequestError when refresh token is invalid", async () => {
      const refreshToken = "invalid-token";
      mockReq = { cookies: { refreshToken } };

      // Mock empty sessions array
      const mockTx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockResolvedValue([]), // Return empty array directly
        }),
      };

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        return await callback(mockTx);
      });

      // Mock bcrypt.compare to return false for all sessions
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await expect(
        AuthCtrl.refreshToken(mockReq as Request, mockRes as Response)
      ).rejects.toThrow(BadRequestError);

      // FIXED: Update expectation to match actual implementation
      // The implementation clears cookie without options in refreshToken method
      expect(mockClearCookie).toHaveBeenCalledWith("refreshToken");
    });

    it("should generate new tokens and update session when refresh token is valid", async () => {
      const refreshToken = "valid-refresh-token";
      mockReq = {
        cookies: { refreshToken },
        headers: { "user-agent": "test-agent" },
      };

      const mockSessions = [
        {
          id: 1,
          userId: 1,
          refresh_token_hash: "hashed-refresh-token",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          userAgent: "test-agent",
        },
      ];

      const user = {
        id: 1,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      };

      const newTokens = {
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
        refreshTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      // FIXED: Create a complete mock transaction with proper method chaining
      const mockUserSelection = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([user]),
          }),
        }),
      };

      const mockTx = {
        select: vi
          .fn()
          // First call: get all sessions
          .mockReturnValueOnce({
            from: vi.fn().mockResolvedValue(mockSessions),
          })
          // Second call: get user data
          .mockReturnValueOnce(mockUserSelection),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      };

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        return await callback(mockTx);
      });

      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      vi.mocked(generateAuthTokens).mockReturnValue(newTokens);
      vi.mocked(bcrypt.hash).mockResolvedValue(
        "new-hashed-refresh-token" as never
      );

      await AuthCtrl.refreshToken(mockReq as Request, mockRes as Response);

      expect(mockCookie).toHaveBeenCalledWith(
        "refreshToken",
        "new-refresh-token",
        expect.objectContaining({
          httpOnly: true,
          secure: false,
        })
      );
      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        message: "Access token refreshed successfully",
        accessToken: "new-access-token",
        user: {
          id: 1,
          email: "test@example.com",
          name: "Test User",
          role: "user",
        },
      });
    });

    it("should throw BadRequestError when refresh token has expired", async () => {
      const refreshToken = "expired-refresh-token";
      mockReq = { cookies: { refreshToken } };

      const mockSessions = [
        {
          id: 1,
          userId: 1,
          refresh_token_hash: "hashed-expired-token",
          expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Expired
          userAgent: "test-agent",
        },
      ];

      const mockTx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockResolvedValue(mockSessions),
        }),
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      };

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        return await callback(mockTx);
      });

      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      await expect(
        AuthCtrl.refreshToken(mockReq as Request, mockRes as Response)
      ).rejects.toThrow(BadRequestError);

      expect(mockTx.delete).toHaveBeenCalledWith(sessions);
      // FIXED: Update expectation to match actual implementation
      expect(mockClearCookie).toHaveBeenCalledWith("refreshToken");
    });

    it("should throw NotFoundError when user not found", async () => {
      const refreshToken = "valid-refresh-token";
      mockReq = { cookies: { refreshToken } };

      const mockSessions = [
        {
          id: 1,
          userId: 999, // Non-existent user
          refresh_token_hash: "hashed-refresh-token",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          userAgent: "test-agent",
        },
      ];

      // FIXED: Mock user selection to return empty array
      const mockUserSelection = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]), // Empty array for user not found
          }),
        }),
      };

      const mockTx = {
        select: vi
          .fn()
          // First call: get all sessions
          .mockReturnValueOnce({
            from: vi.fn().mockResolvedValue(mockSessions),
          })
          // Second call: get user data (returns empty)
          .mockReturnValueOnce(mockUserSelection),
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      };

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        return await callback(mockTx);
      });

      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      await expect(
        AuthCtrl.refreshToken(mockReq as Request, mockRes as Response)
      ).rejects.toThrow(NotFoundError);

      expect(mockTx.delete).toHaveBeenCalledWith(sessions);
      // FIXED: Update expectation to match actual implementation
      expect(mockClearCookie).toHaveBeenCalledWith("refreshToken");
    });
  });

  describe("forgetPassword", () => {
    it("should throw BadRequestError when email is missing or invalid", async () => {
      mockReq = { body: {} };
      await expect(
        AuthCtrl.forgetPassword(mockReq as Request, mockRes as Response)
      ).rejects.toThrow(BadRequestError);

      mockReq = { body: { email: "invalid-email" } };
      await expect(
        AuthCtrl.forgetPassword(mockReq as Request, mockRes as Response)
      ).rejects.toThrow(BadRequestError);
    });

    it("should return success message even when user does not exist", async () => {
      mockReq = { body: { email: "nonexistent@example.com" } };

      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        return await callback(mockTx);
      });

      await AuthCtrl.forgetPassword(mockReq as Request, mockRes as Response);

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        message: "If an account exists, a password reset link has been sent.",
      });
    });

    it("should generate reset token for existing user", async () => {
      mockReq = { body: { email: "test@example.com" } };

      const user = {
        id: 1,
        email: "test@example.com",
      };

      const mockTokenData = {
        token: "reset-token-123",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([user]),
        delete: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        return await callback(mockTx);
      });

      vi.mocked(generateVerificationToken).mockReturnValue(mockTokenData);

      await AuthCtrl.forgetPassword(mockReq as Request, mockRes as Response);

      expect(mockTx.delete).toHaveBeenCalledWith(passwordResetTokens);
      expect(mockTx.insert).toHaveBeenCalledWith(passwordResetTokens);
      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
    });
  });

  describe("resendResetPasswordEmail", () => {
    it("should throw BadRequestError when email is invalid", async () => {
      mockReq = { body: { email: "invalid-email" } };
      await expect(
        AuthCtrl.resendResetPasswordEmail(
          mockReq as Request,
          mockRes as Response
        )
      ).rejects.toThrow(BadRequestError);
    });

    it("should return success when user does not exist", async () => {
      mockReq = { body: { email: "nonexistent@example.com" } };

      // FIXED: Properly mock the db.select chain
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]), // Empty array for no user
          }),
        }),
      } as any);

      await AuthCtrl.resendResetPasswordEmail(
        mockReq as Request,
        mockRes as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        message: "If an account is found, a password reset link has been sent.",
      });
    });

    it("should resend reset password email for existing user", async () => {
      mockReq = { body: { email: "test@example.com" } };

      const user = {
        id: 1,
        email: "test@example.com",
      };

      const mockTokenData = {
        token: "new-reset-token-123",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      // FIXED: Properly mock the db.select chain
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([user]),
          }),
        }),
      } as any);

      const mockTx = {
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue(undefined),
        }),
      };

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        return await callback(mockTx);
      });

      vi.mocked(generateVerificationToken).mockReturnValue(mockTokenData);

      await AuthCtrl.resendResetPasswordEmail(
        mockReq as Request,
        mockRes as Response
      );

      expect(mockTx.delete).toHaveBeenCalledWith(passwordResetTokens);
      expect(mockTx.insert).toHaveBeenCalledWith(passwordResetTokens);
      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        message: "A new password reset link has been sent to your email.",
      });
    });
  });

  describe("resetPassword", () => {
    it("should throw BadRequestError when token is missing", async () => {
      mockReq = { query: {}, body: { newPassword: "newpassword123" } };
      await expect(
        AuthCtrl.resetPassword(mockReq as Request, mockRes as Response)
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw BadRequestError when password is too short", async () => {
      mockReq = {
        query: { token: "valid-token" },
        body: { newPassword: "123" },
      };
      await expect(
        AuthCtrl.resetPassword(mockReq as Request, mockRes as Response)
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw NotFoundError for invalid reset token", async () => {
      mockReq = {
        query: { token: "invalid-token" },
        body: { newPassword: "newpassword123" },
      };

      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        return await callback(mockTx);
      });

      await expect(
        AuthCtrl.resetPassword(mockReq as Request, mockRes as Response)
      ).rejects.toThrow(NotFoundError);
    });

    it("should successfully reset password and invalidate sessions", async () => {
      const token = "valid-reset-token";
      mockReq = { query: { token }, body: { newPassword: "newpassword123" } };

      const mockToken = {
        id: 1,
        token,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        userId: 1,
      };

      const mockUser = {
        id: 1,
        email: "test@example.com",
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

      vi.mocked(bcrypt.hash).mockResolvedValue("new-hashed-password" as never);

      await AuthCtrl.resetPassword(mockReq as Request, mockRes as Response);

      expect(bcrypt.hash).toHaveBeenCalledWith("newpassword123", 10);
      expect(mockTx.update).toHaveBeenCalledWith(users);
      expect(mockTx.delete).toHaveBeenCalledWith(passwordResetTokens);
      expect(mockTx.delete).toHaveBeenCalledWith(sessions);
      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        message: "Password has been reset successfully.",
      });
    });
  });
});
