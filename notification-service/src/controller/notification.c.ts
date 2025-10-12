import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { emailService } from "../service/emailService";
import {
  emailVerificationSchema,
  passwordResetSchema,
  type EmailVerificationInput,
  type PasswordResetInput,
} from "../validators/emailValidators";
import { logger } from "../config/logger";

export const NotificationCtrl = {
  sendVerificationEmail: async (req: Request, res: Response) => {
    try {
      const validationResult = emailVerificationSchema.safeParse(req.body);
      if (!validationResult.success) {
        logger.warn("Email verification request validation failed", {
          issues: validationResult.error.issues,
          body: req.body,
        });

        return res.status(StatusCodes.BAD_REQUEST).json({
          message: "Invalid request data",
          errors: validationResult.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        });
      }

      const { email, verificationToken }: EmailVerificationInput =
        validationResult.data;

      logger.info("Sending verification email", { email });

      await emailService.sendVerificationEmail(email, verificationToken);

      logger.info("Verification email processed successfully", { email });

      return res.status(StatusCodes.OK).json({
        message: "Verification email sent successfully.",
      });
    } catch (error) {
      console.error("Error sending verification email:", error);
      logger.error("Error in sendVerificationEmail controller", {
        error: (error as Error).message,
        stack: (error as Error).stack,
        body: req.body,
      });

      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: "Failed to send verification email.",
      });
    }
  },

  sendPasswordResetEmail: async (req: Request, res: Response) => {
    try {
      const validationResult = passwordResetSchema.safeParse(req.body);
      if (!validationResult.success) {
        logger.warn("Password reset request validation failed", {
          issues: validationResult.error.issues,
          body: req.body,
        });

        return res.status(StatusCodes.BAD_REQUEST).json({
          message: "Invalid request data",
          errors: validationResult.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        });
      }

      const { email, resetToken }: PasswordResetInput = validationResult.data;

      logger.info("Sending password reset email", { email });

      await emailService.sendPasswordResetEmail(email, resetToken);

      logger.info("Password reset email processed successfully", { email });

      return res.status(StatusCodes.OK).json({
        message: "Password reset email sent successfully.",
      });
    } catch (error) {
      logger.error("Error in sendPasswordResetEmail controller", {
        error: (error as Error).message,
        stack: (error as Error).stack,
        body: req.body,
      });

      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: "Failed to send password reset email.",
      });
    }
  },
};
