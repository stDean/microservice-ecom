import bcrypt from "bcrypt";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { CookieOptions, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import db from "../db";
import {
  passwordResetTokens,
  sessions,
  users,
  verificationTokens,
} from "../db/schema";
import { BadRequestError, NotFoundError } from "../errors";
import { eventPublisher } from "../events/publisher";
import logger from "../utils/logger";
import {
  generateAuthTokens,
  generateVerificationToken,
} from "../utils/tokenGeneration";

export const AuthCtrl = {
  /**
   * @notice Register a new user with email verification
   * @dev Creates user account, hashes password, generates verification token
   * @param req.body.email User's email address (validated by gateway)
   * @param req.body.password User's password (validated by gateway)
   * @param req.body.name User's display name (validated by gateway)
   * @param req.body.role User's role (validated by gateway)
   */
  register: async (req: Request, res: Response) => {
    const { email, password, name, role } = req.body;

    // Use transaction to ensure atomicity
    const { newUser, token } = await db.transaction(async (tx) => {
      // Check for existing user within transaction to prevent race conditions
      const existingUser = await tx
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingUser.length > 0) {
        throw new BadRequestError("User already exists");
      }

      // Create user
      const hashedPassword = await bcrypt.hash(password, 10);
      const [newUser] = await tx
        .insert(users)
        .values({
          email,
          password_hash: hashedPassword,
          name,
          emailVerified: false,
          lastLoginAt: null,
          role: role || "customer",
        })
        .returning();

      // Generate and store verification token
      const { token, expiresAt } = generateVerificationToken();
      await tx.insert(verificationTokens).values({
        userId: newUser.id,
        token,
        expiresAt,
      });

      return { newUser, token };
    });

    logger.info("User registered successfully", {
      userId: newUser.id,
      email: newUser.email,
    });

    // Publish event for notification service
    await eventPublisher.publishUserRegistered({
      userId: newUser.id,
      email: newUser.email,
      name: newUser.name!,
      verificationToken: token,
    });

    res.status(StatusCodes.CREATED).json({
      message: "Registration successful. Please check your email.",
    });
  },

  /**
   * @notice Resend email verification link
   * @dev Generates new verification token, invalidates old ones
   * @param req.body.email User's email address (validated by gateway)
   */
  resendVerificationEmail: async (req: Request, res: Response) => {
    const { email } = req.body;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      return res.status(StatusCodes.OK).json({
        message: "If an account is found, a verification link has been sent.",
      });
    }

    if (user.emailVerified) {
      return res.status(StatusCodes.OK).json({
        message: "Email is already verified. You may proceed to log in.",
      });
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(verificationTokens)
        .where(eq(verificationTokens.userId, user.id));

      const { token: verificationToken, expiresAt } =
        generateVerificationToken();

      await tx.insert(verificationTokens).values({
        userId: user.id,
        token: verificationToken,
        expiresAt,
      });

      logger.info("Verification email resent", {
        userId: user.id,
        email: user.email,
      });

      await eventPublisher.publishUserRegistered({
        userId: user.id,
        email: user.email,
        name: user.name!,
        verificationToken: verificationToken,
      });
    });

    res.status(StatusCodes.OK).json({
      message: "A new verification link has been sent to your email.",
    });
  },

  /**
   * @notice Verify user's email using token
   * @dev Validates token, marks email as verified, cleans up used token
   * @param req.query.token Email verification token from link (validated by gateway)
   */
  verifyEmail: async (req: Request, res: Response) => {
    const verificationToken = req.query.token as string;

    await db.transaction(async (tx) => {
      // Get token and user in single query using join
      const tokenWithUser = await tx
        .select({
          token: verificationTokens,
          user: users,
        })
        .from(verificationTokens)
        .where(eq(verificationTokens.token, verificationToken))
        .innerJoin(users, eq(users.id, verificationTokens.userId))
        .limit(1);

      if (tokenWithUser.length === 0) {
        throw new NotFoundError("Invalid or expired verification token");
      }

      const { token, user } = tokenWithUser[0];

      if (token.expiresAt < new Date()) {
        await tx
          .delete(verificationTokens)
          .where(eq(verificationTokens.id, token.id));
        throw new BadRequestError("Verification token has expired");
      }

      if (user.emailVerified) {
        await tx
          .delete(verificationTokens)
          .where(eq(verificationTokens.id, token.id));
        throw new BadRequestError("Email already verified");
      }

      // Update user's emailVerified status
      await tx
        .update(users)
        .set({ emailVerified: true })
        .where(eq(users.id, user.id));

      // Delete the used verification token
      await tx
        .delete(verificationTokens)
        .where(eq(verificationTokens.id, token.id));

      await eventPublisher.publishEvent({
        type: "EMAIL_VERIFIED",
        source: "auth-service",
        timestamp: new Date(),
        version: "1.0.0",
        data: {
          email: user.email,
          userId: user.id,
        },
      });
    });

    logger.info("Email verified successfully", { token: verificationToken });

    res.status(StatusCodes.OK).json({
      message: "Email verified successfully.",
    });
  },

  /**
   * @notice Authenticate user and create session
   * @dev Validates credentials, creates access/refresh tokens, sets HTTP-only cookie
   * @param req.body.email User's email address (validated by gateway)
   * @param req.body.password User's password (validated by gateway)
   */
  login: async (req: Request, res: Response) => {
    const { email, password } = req.body;

    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (userResult.length === 0) {
      logger.warn("Failed login attempt - user not found", { email });
      throw new NotFoundError("User not found");
    }

    const user = userResult[0];
    if (!user.emailVerified) {
      logger.warn("Failed login attempt - email not verified", {
        userId: user.id,
      });
      throw new BadRequestError("Please verify your email before logging in");
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      logger.warn("Failed login attempt", {
        email,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });
      throw new BadRequestError("Invalid credentials");
    }

    const { accessToken, refreshToken, refreshTokenExpiresAt } =
      generateAuthTokens(user.id, user.role, user.email, user.name as string);

    // Use transaction for session creation and lastLogin update
    const sessionId = await db.transaction(async (tx) => {
      const sessionId = crypto.randomUUID();
      const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
      await tx.insert(sessions).values({
        id: sessionId,
        userId: user.id,
        refresh_token_hash: refreshTokenHash,
        expiresAt: refreshTokenExpiresAt,
        userAgent: req.headers["user-agent"] || "unknown",
      });

      await tx
        .update(users)
        .set({ lastLoginAt: new Date() })
        .where(eq(users.id, user.id));

      return sessionId;
    });

    const cookieOptions: CookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      expires: refreshTokenExpiresAt,
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
      path: "/",
      // domain: process.env.COOKIE_DOMAIN,
    };

    res.cookie("refreshToken", refreshToken, cookieOptions);
    res.cookie("sessionId", sessionId, cookieOptions);

    // DEBUG: Check what headers are being set
    console.log("🔍 [RESPONSE HEADERS]", res.getHeaders());

    // DEBUG: Specifically check Set-Cookie headers
    const setCookieHeaders = res.getHeaders()["set-cookie"];
    console.log("🍪 [SET-COOKIE HEADERS]", setCookieHeaders);

    // DEBUG: Check if cookies are actually in the response
    const allHeaders = res.getHeaders();
    console.log("📋 [ALL HEADERS KEYS]", Object.keys(allHeaders));

    res.status(StatusCodes.OK).json({
      message: "Login successful",
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  },

  /**
   * @notice Refresh access token using session ID
   * @dev Validates session by ID, rotates refresh token, updates session with new token and expiration
   * @param req.cookies.sessionId Session identifier for efficient database lookup
   * @param req.cookies.refreshToken Current refresh token for cryptographic validation
   */
  logout: async (req: Request, res: Response) => {
    const sessionId = req.cookies.sessionId;

    if (sessionId) {
      try {
        await db.delete(sessions).where(eq(sessions.id, sessionId));
        logger.info("Session deleted during logout", { sessionId });
      } catch (error) {
        logger.error("Error deleting session during logout", {
          error,
          sessionId,
        });
        // Continue with logout even if session deletion fails
      }
    }

    const clearCookieOptions: CookieOptions = {
      path: "/",
      domain: process.env.COOKIE_DOMAIN,
    };

    res.clearCookie("refreshToken", clearCookieOptions);
    res.clearCookie("sessionId", clearCookieOptions);

    logger.info("User logged out successfully");

    return res.status(StatusCodes.OK).json({
      message: "User logged out successfully",
    });
  },

  /**
   * @notice Refresh access token using session ID
   * @dev Validates session by ID, rotates refresh token
   */
  refreshToken: async (req: Request, res: Response) => {
    const refreshToken = req.cookies.refreshToken;
    const sessionId = req.cookies.sessionId;

    if (!refreshToken || !sessionId) {
      throw new BadRequestError("Refresh token and session ID required");
    }

    const clearCookieOptions: CookieOptions = {
      path: "/",
      domain: process.env.COOKIE_DOMAIN,
    };

    const { accessToken, newRefreshToken, user, refreshTokenExpiresAt } =
      await db.transaction(async (tx) => {
        const sessionResult = await tx
          .select()
          .from(sessions)
          .where(eq(sessions.id, sessionId))
          .limit(1);

        if (sessionResult.length === 0) {
          res.clearCookie("refreshToken", clearCookieOptions);
          res.clearCookie("sessionId", clearCookieOptions);
          throw new BadRequestError("Invalid session");
        }

        const session = sessionResult[0];

        // Validate refresh token
        const isValid = await bcrypt.compare(
          refreshToken,
          session.refresh_token_hash
        );
        if (!isValid) {
          res.clearCookie("refreshToken", clearCookieOptions);
          res.clearCookie("sessionId", clearCookieOptions);
          throw new BadRequestError("Invalid refresh token");
        }

        // Check if refresh token has expired
        if (session.expiresAt < new Date()) {
          await tx.delete(sessions).where(eq(sessions.id, session.id));
          res.clearCookie("refreshToken", clearCookieOptions);
          res.clearCookie("sessionId", clearCookieOptions);
          throw new BadRequestError("Refresh token expired");
        }

        // Get user data
        const userResult = await tx
          .select()
          .from(users)
          .where(eq(users.id, session.userId!))
          .limit(1);

        if (userResult.length === 0) {
          await tx.delete(sessions).where(eq(sessions.id, session.id));
          res.clearCookie("refreshToken", clearCookieOptions);
          res.clearCookie("sessionId", clearCookieOptions);
          throw new NotFoundError("User not found");
        }

        const user = userResult[0];

        // Ensure email is verified
        if (!user.emailVerified) {
          await tx.delete(sessions).where(eq(sessions.id, session.id));
          res.clearCookie("refreshToken", clearCookieOptions);
          res.clearCookie("sessionId", clearCookieOptions);
          throw new BadRequestError("Email not verified");
        }

        // Generate new tokens
        const {
          accessToken,
          refreshToken: newRefreshToken,
          refreshTokenExpiresAt,
        } = generateAuthTokens(
          user.id,
          user.role,
          user.email,
          user.name as string
        );

        // Update session with new refresh token
        const refreshTokenHash = await bcrypt.hash(newRefreshToken, 10);
        await tx
          .update(sessions)
          .set({
            refresh_token_hash: refreshTokenHash,
            expiresAt: refreshTokenExpiresAt,
            userAgent: req.headers["user-agent"] || "unknown",
          })
          .where(eq(sessions.id, session.id));

        return { accessToken, newRefreshToken, refreshTokenExpiresAt, user };
      });

    // Set new refresh token in cookie
    const cookieOptions: CookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      expires: refreshTokenExpiresAt,
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
      path: "/",
      domain: process.env.COOKIE_DOMAIN,
    };

    res.cookie("refreshToken", newRefreshToken, cookieOptions);

    logger.info("Access token refreshed successfully", { userId: user.id });

    res.status(StatusCodes.OK).json({
      message: "Access token refreshed successfully",
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  },

  /**
   * @notice Initiate password reset process
   * @dev Generates reset token, sends email (prevents email enumeration)
   * @param req.body.email User's email address (validated by gateway)
   */
  forgetPassword: async (req: Request, res: Response) => {
    const { email } = req.body;

    await db.transaction(async (tx) => {
      const existingUser = await tx
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingUser.length === 0) {
        logger.warn("Password reset attempted for non-existent email", {
          email,
        });
        return;
      }

      // Clean up existing tokens and create new one
      await tx
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.userId, existingUser[0].id));

      const { token, expiresAt } = generateVerificationToken();
      await tx.insert(passwordResetTokens).values({
        userId: existingUser[0].id,
        token,
        expiresAt,
      });

      logger.info("Password reset token generated", {
        userId: existingUser[0].id,
      });

      await eventPublisher.publishPasswordReset({
        email: email,
        resetToken: token,
        expiresAt: expiresAt,
      });
    });

    // Always return success to prevent email enumeration
    res.status(StatusCodes.OK).json({
      message: "If an account exists, a password reset link has been sent.",
    });
  },

  /**
   * @notice Resend password reset email
   * @dev Generates new reset token, invalidates previous tokens
   * @param req.body.email User's email address (validated by gateway)
   */
  resendResetPasswordEmail: async (req: Request, res: Response) => {
    const { email } = req.body;

    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (userResult.length === 0) {
      // Don't reveal whether email exists
      return res.status(StatusCodes.OK).json({
        message: "If an account is found, a password reset link has been sent.",
      });
    }

    const user = userResult[0];

    await db.transaction(async (tx) => {
      await tx
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.userId, user.id));

      const { token, expiresAt } = generateVerificationToken();

      await tx.insert(passwordResetTokens).values({
        userId: user.id,
        token,
        expiresAt,
      });

      logger.info("Password reset email resent", { userId: user.id });

      await eventPublisher.publishPasswordReset({
        email: email,
        resetToken: token,
        expiresAt: expiresAt,
      });
    });

    res.status(StatusCodes.OK).json({
      message: "A new password reset link has been sent to your email.",
    });
  },

  /**
   * @notice Reset user password using valid token
   * @dev Validates reset token, hashes new password, invalidates all sessions
   * @param req.query.token Password reset token from email (validated by gateway)
   * @param req.body.newPassword New password (validated by gateway)
   */
  resetPassword: async (req: Request, res: Response) => {
    const { token } = req.query;
    const { newPassword } = req.body;

    // ✅ Data already validated by gateway - trust it!

    await db.transaction(async (tx) => {
      const passTokenWithUser = await tx
        .select({
          token: passwordResetTokens,
          user: users,
        })
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.token, token as string))
        .innerJoin(users, eq(users.id, passwordResetTokens.userId))
        .limit(1);

      if (passTokenWithUser.length === 0) {
        throw new NotFoundError("Invalid or expired password reset token.");
      }

      const { token: passToken, user } = passTokenWithUser[0];

      if (passToken.expiresAt < new Date()) {
        await tx
          .delete(passwordResetTokens)
          .where(eq(passwordResetTokens.id, passToken.id));
        throw new BadRequestError("Password reset token has expired.");
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await tx
        .update(users)
        .set({ password_hash: hashedPassword })
        .where(eq(users.id, user.id));

      await tx
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.id, passToken.id));

      // Invalidate all existing sessions for security
      await tx.delete(sessions).where(eq(sessions.userId, user.id));

      logger.info("Password reset successfully", { userId: user.id });
    });

    res.status(StatusCodes.OK).json({
      message: "Password has been reset successfully.",
    });
  },

  // just for testing purpose
  getUsers: async (req: Request, res: Response) => {
    const allUsers = await db.select().from(users);
    res.status(StatusCodes.OK).json(allUsers);
  },

  getSessions: async (req: Request, res: Response) => {
    const allSessions = await db.select().from(sessions);
    res.status(StatusCodes.OK).json(allSessions);
  },

  getVerificationTokens: async (req: Request, res: Response) => {
    const allTokens = await db.select().from(verificationTokens);
    res.status(StatusCodes.OK).json(allTokens);
  },

  getPasswordResetTokens: async (req: Request, res: Response) => {
    const allResetTokens = await db.select().from(passwordResetTokens);
    res.status(StatusCodes.OK).json(allResetTokens);
  },
};
