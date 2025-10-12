import { z } from "zod";

export const emailVerificationSchema = z.object({
  email: z.string().email("Invalid email address"),
  verificationToken: z.string().min(1, "Verification token is required"),
});

export const passwordResetSchema = z.object({
  email: z.string().email("Invalid email address"),
  resetToken: z.string().min(1, "Reset token is required"),
});

export type EmailVerificationInput = z.infer<typeof emailVerificationSchema>;
export type PasswordResetInput = z.infer<typeof passwordResetSchema>;
