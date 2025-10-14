import * as nodemailer from "nodemailer";
import { MailOptions } from "nodemailer/lib/sendmail-transport";
import { logger } from "./logger";

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT) || 587,
  secure: process.env.MAIL_SECURE === "true", // true for 465, false for other ports
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
});

// Verify connection on startup
transporter.verify((error) => {
  if (error) {
    logger.error("❌ Mail transporter verification failed:", error);
  } else {
    logger.info("✅ Mail transporter is ready to send emails", {
      host: process.env.MAIL_HOST,
      port: process.env.MAIL_PORT,
    });
  }
});

export const sendMail = (
  mailOptions: MailOptions
): Promise<nodemailer.SentMessageInfo> => {
  return new Promise((resolve, reject) => {
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        logger.error("Error sending email:", {
          error: error.message,
          to: mailOptions.to,
          subject: mailOptions.subject,
        });
        return reject(error);
      }

      logger.info("Email sent successfully", {
        messageId: info.messageId,
        to: mailOptions.to,
        subject: mailOptions.subject,
        response: info.response,
      });
      resolve(info);
    });
  });
};
