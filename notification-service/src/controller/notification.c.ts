import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { emailService } from "../service/emailService";

export const NotificationCtrl = {
  sendVerificationEmail: async (req: Request, res: Response) => {
    try {
      const { email, verificationToken } = req.body;
      if (!email || !verificationToken) {
        return res
          .status(StatusCodes.BAD_REQUEST)
          .json({ message: "Missing email or verification token." });
      }

      // 💡 You should integrate a message queue (e.g., RabbitMQ) here
      // to handle email sending asynchronously for better performance.
      await emailService.sendVerificationEmail(email, verificationToken);

      return res
        .status(StatusCodes.OK)
        .send({ message: "Verification email sent." });
    } catch (error) {
      console.error("Error sending verification email:", error);
      return res
        .status(StatusCodes.INTERNAL_SERVER_ERROR)
        .send({ message: "Failed to send verification email." });
    }
  },

  sendPasswordResetEmail: async (req: Request, res: Response) => {
    try {
      const { email, resetToken } = req.body;
      if (!email || !resetToken) {
        return res
          .status(StatusCodes.BAD_REQUEST)
          .json({ message: "Missing email or reset token." });
      }

      // 💡 You should integrate a message queue (e.g., RabbitMQ) here
      // to handle email sending asynchronously for better performance.
      await emailService.sendPasswordResetEmail(email, resetToken);

      return res
        .status(StatusCodes.OK)
        .send({ message: "Password reset email sent." });
    } catch (error) {
      console.error("Error sending password reset email:", error);
      return res
        .status(StatusCodes.INTERNAL_SERVER_ERROR)
        .send({ message: "Failed to send password reset email." });
    }
  },
};
