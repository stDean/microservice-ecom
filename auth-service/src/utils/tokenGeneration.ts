import * as jwt from "jsonwebtoken";
import * as crypto from "crypto";
import bcrypt from "bcrypt"; // Added bcrypt import

// --- Configuration ---
// NOTE: In a real application, these should be loaded from environment variables (.env)
const JWT_SECRET = "YOUR_SUPER_SECRET_JWT_KEY";
const ACCESS_TOKEN_EXPIRY = "15m"; // Short-lived
const REFRESH_TOKEN_EXPIRY_MS = 1000 * 60 * 60 * 24 * 7; // 7 days in milliseconds
const VERIFICATION_TOKEN_EXPIRY_MS = 1000 * 60 * 10; // 10 minutes in milliseconds
const SALT_ROUNDS = 10; // Standard salt rounds for bcrypt

// --- Types ---

/** Payload contained within the Access Token (JWT) */
export interface JwtPayload {
  userId: string;
  role: string;
  email: string;
  name?: string;
}

/** The comprehensive object returned after a successful login/refresh */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

/** The comprehensive object returned after registration for email verification */
export interface VerificationToken {
  token: string;
  expiresAt: Date;
}

// --- Hashing Utility ---

/**
 * Helper function to hash a token (like the Refresh Token) before storing it in the DB.
 * Using bcrypt makes the token hash resistant to rainbow table attacks and brute force.
 * @param token The plain string token to hash.
 * @returns The bcrypt hash of the token.
 */
export const hashToken = async (token: string): Promise<string> => {
  // bcrypt is asynchronous, ensuring the server remains non-blocking.
  return bcrypt.hash(token, SALT_ROUNDS);
};

// --- Token Generation Functions ---

/**
 * 1. Generates the short-lived Access Token (JWT).
 * @param payload The user information to include in the JWT.
 * @returns The signed JWT string.
 */
export const generateAccessToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
};

/**
 * 2. Generates the long-lived Refresh Token and its expiration date.
 * The token itself is a long, cryptographically secure random string.
 * @returns The plain Refresh Token and its expiration date.
 */
export const generateRefreshToken = (): { token: string; expiresAt: Date } => {
  // Generate a 32-byte secure random string (64 characters hex)
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);

  return { token, expiresAt };
};

/**
 * 3. Generates the temporary Verification Token for email validation.
 * @returns The plain Verification Token and its expiration date.
 */
export const generateVerificationToken = (): VerificationToken => {
  // Generate a 16-byte secure random string (32 characters hex)
  const token = crypto.randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY_MS);

  return { token, expiresAt };
};

// --- Combined Functions for Authentication Flow ---

/**
 * Generates both the Access and Refresh tokens for a successful login.
 * @param userId The ID of the logged-in user.
 * @param role The role of the logged-in user.
 * @returns An object containing the tokens and refresh expiration.
 */
export const generateAuthTokens = (
  userId: string,
  role: string,
  email: string,
  name?: string
): AuthTokens => {
  const accessToken = generateAccessToken({
    userId,
    role,
    email,
    name,
  });

  const { token: refreshToken, expiresAt: refreshTokenExpiresAt } =
    generateRefreshToken();

  return {
    accessToken,
    refreshToken,
    refreshTokenExpiresAt,
  };
};

/**
 * Example usage in your Login Controller:
 * * const user = await db.getUserByCredentials(email, password);
 * if (!user || !user.emailVerified) { throw new Error("Invalid credentials or unverified email"); }
 * * const { accessToken, refreshToken, refreshTokenExpiresAt } = generateAuthTokens(user.id, user.role);
 * * // 1. Store the HASHED refresh token in the 'sessions' table
 * const refreshTokenHash = await hashToken(refreshToken); // NOTE: Await needed now that hashToken is async
 * await db.insertSession(user.id, refreshTokenHash, refreshTokenExpiresAt, req.headers['user-agent']);
 * * // 2. Set the cookie (HttpOnly, Secure) with the PLAIN refreshToken
 * res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: true, expires: refreshTokenExpiresAt });
 * * // 3. Return the AccessToken to the client (usually in the body/header)
 * return { accessToken };
 */

/**
 * Example usage in your Registration Controller:
 * * // 1. Create the user (emailVerified: false)
 * const newUser = await db.insertUser(email, passwordHash);
 * * // 2. Generate and store the verification token
 * const { token: verificationToken, expiresAt } = generateVerificationToken();
 * await db.insertVerificationToken(newUser.id, verificationToken, expiresAt);
 * * // 3. Send email to user with link containing verificationToken
 * // E.g., sendEmail(user.email, \`/api/auth/verify?token=${verificationToken}\`);
 * * return { message: "Registration successful. Please check your email." };
 */
