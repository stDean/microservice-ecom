import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import {
  emailVerificationSchema,
  passwordResetSchema,
  type EmailVerificationInput,
  type PasswordResetInput,
} from "../validators/emailValidators";
import { logger } from "../config/logger";
import { rabbitMQService } from "../config/rabbitmq";

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

      logger.info("Queueing verification email", { email });

      const requestId = req.headers["x-request-id"] || `req_${Date.now()}`;
      // Publish to RabbitMQ instead of sending directly
      await rabbitMQService.publishMessage("verification", {
        id: `verification_${Date.now()}_${Math.random()
          .toString(36)
          .substring(2, 11)}`,
        email,
        token: verificationToken,
        timestamp: new Date().toISOString(),
        requestId,
      });

      // await emailService.sendVerificationEmail(email, verificationToken);

      logger.info("Verification email queued successfully", { email });

      // Return 202 Accepted since we've queued the request
      return res.status(StatusCodes.ACCEPTED).json({
        message: "Verification email queued for sending.",
        success: true,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
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

      logger.info("Queueing password reset email", { email });

      const requestId = req.headers["x-request-id"] || `req_${Date.now()}`;
      // Publish to RabbitMQ instead of sending directly
      await rabbitMQService.publishMessage("password_reset", {
        id: `password_reset_${Date.now()}_${Math.random()
          .toString(36)
          .substring(2, 11)}`,
        email,
        token: resetToken,
        timestamp: new Date().toISOString(),
        requestId,
      });

      logger.info("Password reset email queued successfully", { email });

      // Return 202 Accepted since we've queued the request
      return res.status(StatusCodes.ACCEPTED).json({
        message: "Password reset email queued for sending.",
        success: true,
        timestamp: new Date().toISOString(),
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
