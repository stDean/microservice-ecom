import { sendMail } from "../config/mailer";
import { logger } from "../config/logger";
import { emailTemplates } from "../templates/emailTemplates";

interface RetryConfig {
  maxAttempts: number;
  delayMs: number;
  backoffMultiplier: number;
}

/**
 * @notice Default retry configuration for email operations
 * @dev Uses exponential backoff: 1000ms, 2000ms, 4000ms delays for 3 attempts
 */
const defaultRetryConfig: RetryConfig = {
  maxAttempts: 3,
  delayMs: 1000,
  backoffMultiplier: 2,
};

/**
 * @title Email Service with Retry Mechanism
 * @author Dean
 * @notice A robust email service that handles sending transactional emails with configurable retry logic
 * @dev Implements exponential backoff retry strategy for handling transient email failures
 */
class EmailService {
  /**
   * @notice Retries an asynchronous operation with exponential backoff
   * @dev Implements retry logic with configurable attempts, delay, and backoff multiplier
   * @param operation The async function to retry
   * @param config Retry configuration (uses defaults if not provided)
   * @return Promise<T> The result of the successful operation
   * @throws Error if all retry attempts fail
   * @example
   * await retryOperation(() => apiCall(), { maxAttempts: 5, delayMs: 500, backoffMultiplier: 1.5 })
   */
  private async retryOperation<T>(
    operation: () => Promise<T>,
    config: RetryConfig = defaultRetryConfig
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        logger.warn(`Email send attempt ${attempt} failed:`, {
          error: lastError.message,
          attempt,
          maxAttempts: config.maxAttempts,
        });

        if (attempt === config.maxAttempts) break;

        const delay =
          config.delayMs * Math.pow(config.backoffMultiplier, attempt - 1);
        logger.info(`Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    logger.error("All email send attempts failed", {
      error: lastError!.message,
      attempts: config.maxAttempts,
    });
    throw lastError!;
  }

  /**
   * @notice Wrapper method to send email with retry capability
   * @dev Applies retry logic to the sendMail function
   * @param mailOptions Email configuration object
   * @return Promise<void>
   * @throws Error if email cannot be sent after all retry attempts
   */
  private async sendEmailWithRetry(mailOptions: any): Promise<void> {
    await this.retryOperation(() => sendMail(mailOptions));
  }

  /**
   * @notice Sends account verification email to user
   * @dev Generates verification link and sends using email template
   * @param to Recipient email address
   * @param verificationToken JWT or unique token for email verification
   * @return Promise<void>
   * @throws Error if email fails to send after retries
   * @emits Logs success or failure with detailed context
   */
  async sendVerificationEmail(to: string, verificationToken: string) {
    // 💡 In a real app, use a templating engine (like Handlebars) here
    const verificationLink = `${process.env.FRONTEND_URL}/verify?token=${verificationToken}`;

    const mailOptions = {
      from: `"E-Commerce App" <${
        process.env.MAIL_FROM || "no-reply@ecommerce.com"
      }>`,
      to,
      subject: "Verify Your E-Commerce Account",
      html: emailTemplates.verification({ verificationLink }),
    };

    try {
      await this.sendEmailWithRetry(mailOptions);
      logger.info("Verification email sent successfully", { email: to });
    } catch (error) {
      logger.error("Failed to send verification email after retries", {
        email: to,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * @notice Sends password reset email to user
   * @dev Generates password reset link and sends using email template
   * @param to Recipient email address
   * @param resetToken JWT or unique token for password reset
   * @return Promise<void>
   * @throws Error if email fails to send after retries
   * @emits Logs success or failure with detailed context
   */
  async sendPasswordResetEmail(to: string, resetToken: string) {
    // 💡 In a real app, use a templating engine (like Handlebars) here
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: `"E-Commerce App" <${
        process.env.MAIL_FROM || "no-reply@ecommerce.com"
      }>`,
      to,
      subject: "Reset Your E-Commerce Password",
      html: emailTemplates.passwordReset({ resetLink }),
    };

    try {
      await this.sendEmailWithRetry(mailOptions);
      logger.info("Password reset email sent successfully", { email: to });
    } catch (error) {
      logger.error("Failed to send password reset email after retries", {
        email: to,
        error: (error as Error).message,
      });
      throw error;
    }
  }
}

/**
 * @notice Singleton instance of EmailService
 * @dev Export a single shared instance for use throughout the application
 */
export const emailService = new EmailService();
