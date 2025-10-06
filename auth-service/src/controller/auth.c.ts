import { StatusCodes } from "http-status-codes";
import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { NotFoundError, BadRequestError } from "../errors";
import db from "../db";
import { eq } from "drizzle-orm";
import {
  users,
  verificationTokens,
  sessions,
  passwordResetTokens,
} from "../db/schema";
import {
  generateAuthTokens,
  generateVerificationToken,
} from "../utils/tokenGeneration";
import { isValidEmail } from "../utils/helpers";

export const AuthCtrl = {
  register: async (req: Request, res: Response) => {
    const { email, password, name } = req.body;
    if (!email || !password) {
      throw new BadRequestError("Email and password are required");
    }

    // Validate email format
    if (!isValidEmail(email)) {
      throw new BadRequestError("Invalid email format");
    }

    // Validate password strength
    if (password.length < 8) {
      throw new BadRequestError("Password must be at least 8 characters long");
    }

    // Use transaction to ensure atomicity
    const { newUser, token, expiresAt } = await db.transaction(async (tx) => {
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
          emailVerified: false, // Explicitly set to false
          lastLoginAt: null,
        })
        .returning();

      // Generate and store verification token
      const { token, expiresAt } = generateVerificationToken();
      await tx.insert(verificationTokens).values({
        userId: newUser.id,
        token,
        expiresAt,
      });

      return { newUser, token, expiresAt };
    });

    // Send verification email (in real app)
    console.log(`Verification email would be sent to: ${newUser.email}`);
    console.log(`Verification token: ${token}`);

    res
      .status(StatusCodes.CREATED)
      .json({ message: "Registration successful. Please check your email." });
  },

  verifyEmail: async (req: Request, res: Response) => {
    const verificationToken = req.query.token as string;
    if (!verificationToken) {
      throw new BadRequestError("Verification token is required");
    }

    // Use transaction for atomic operations
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
    });

    res.status(StatusCodes.OK).json({
      message: "Email verified successfully.",
    });
  },

  login: async (req: Request, res: Response) => {
    const { email, password } = req.body;
    if (!email || !password) {
      throw new BadRequestError("Email and password are required");
    }

    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (userResult.length === 0) {
      throw new NotFoundError("User not found");
    }

    const user = userResult[0];
    if (!user.emailVerified) {
      throw new BadRequestError("Please verify your email before logging in");
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      throw new BadRequestError("Invalid credentials");
    }

    const { accessToken, refreshToken, refreshTokenExpiresAt } =
      generateAuthTokens(user.id, user.role, user.email, user.name as string);

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await db.insert(sessions).values({
      userId: user.id,
      refresh_token_hash: refreshTokenHash,
      expiresAt: refreshTokenExpiresAt,
      userAgent: req.headers["user-agent"] || "unknown",
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // Only secure in production
      expires: refreshTokenExpiresAt,
      sameSite: "strict",
    });

    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    // Include access token in response (client will store this in memory/localStorage)
    return res.status(StatusCodes.OK).json({
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

  logout: (req: Request, res: Response) => {
    res
      .status(StatusCodes.OK)
      .json({ message: "User logged out successfully" });
  },

  refreshToken: (req: Request, res: Response) => {
    return res
      .status(StatusCodes.OK)
      .json({ message: "Refresh token successfully obtained." });
  },

  accessToken: (req: Request, res: Response) => {
    return res
      .status(StatusCodes.OK)
      .json({ message: "Access token successfully obtained." });
  },

  forgetPassword: (req: Request, res: Response) => {
    return res
      .status(StatusCodes.OK)
      .json({ message: "Forget password route reached." });
  },

  resetPassword: (req: Request, res: Response) => {
    return res
      .status(StatusCodes.OK)
      .json({ message: "Reset password route reached." });
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
