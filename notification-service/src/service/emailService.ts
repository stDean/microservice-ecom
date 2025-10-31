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

  /**
   * @notice Sends order confirmation email to user
   * @dev Sends order details using email template
   * @param to Recipient email address
   * @param orderData Order details including items and totals
   * @return Promise<void>
   * @throws Error if email fails to send after retries
   */
  async sendOrderConfirmationEmail(to: string, orderData: any) {
    const mailOptions = {
      from: `"E-Commerce App" <${
        process.env.MAIL_FROM || "no-reply@ecommerce.com"
      }>`,
      to,
      subject: `Order Confirmation - #${orderData.orderId}`,
      html: emailTemplates.orderConfirmation(orderData),
    };

    try {
      await this.sendEmailWithRetry(mailOptions);
      logger.info("Order confirmation email sent successfully", {
        email: to,
        orderId: orderData.orderId,
      });
    } catch (error) {
      logger.error("Failed to send order confirmation email after retries", {
        email: to,
        orderId: orderData.orderId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * @notice Sends order cancellation email to user
   * @dev Sends cancellation details using email template
   * @param to Recipient email address
   * @param orderData Cancellation details including reason and refund status
   * @return Promise<void>
   * @throws Error if email fails to send after retries
   */
  async sendOrderCancellationEmail(to: string, orderData: any) {
    const mailOptions = {
      from: `"E-Commerce App" <${
        process.env.MAIL_FROM || "no-reply@ecommerce.com"
      }>`,
      to,
      subject: `Order Cancelled - #${orderData.orderId}`,
      html: emailTemplates.orderCancellation(orderData),
    };

    try {
      await this.sendEmailWithRetry(mailOptions);
      logger.info("Order cancellation email sent successfully", {
        email: to,
        orderId: orderData.orderId,
      });
    } catch (error) {
      logger.error("Failed to send order cancellation email after retries", {
        email: to,
        orderId: orderData.orderId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * @notice Sends payment success confirmation email to user
   * @dev Sends payment confirmation with transaction details
   * @param to Recipient email address
   * @param paymentData Payment details including transaction ID and amount
   * @return Promise<void>
   * @throws Error if email fails to send after retries
   */
  async sendPaymentSuccessEmail(to: string, paymentData: any) {
    const mailOptions = {
      from: `"E-Commerce App" <${
        process.env.MAIL_FROM || "no-reply@ecommerce.com"
      }>`,
      to,
      subject: `Payment Successful - Order #${paymentData.orderId}`,
      html: emailTemplates.paymentSuccess(paymentData),
    };

    try {
      await this.sendEmailWithRetry(mailOptions);
      logger.info("Payment success email sent successfully", {
        email: to,
        orderId: paymentData.orderId,
        transactionId: paymentData.paymentTransactionId,
      });
    } catch (error) {
      logger.error("Failed to send payment success email after retries", {
        email: to,
        orderId: paymentData.orderId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * @notice Sends payment failure notification email to user
   * @dev Informs user about payment failure and provides next steps
   * @param to Recipient email address
   * @param paymentData Payment failure details
   * @return Promise<void>
   * @throws Error if email fails to send after retries
   */
  async sendPaymentFailureEmail(to: string, paymentData: any) {
    const mailOptions = {
      from: `"E-Commerce App" <${
        process.env.MAIL_FROM || "no-reply@ecommerce.com"
      }>`,
      to,
      subject: `Payment Failed - Order #${paymentData.orderId}`,
      html: emailTemplates.paymentFailure(paymentData),
    };

    try {
      await this.sendEmailWithRetry(mailOptions);
      logger.info("Payment failure email sent successfully", {
        email: to,
        orderId: paymentData.orderId,
        paymentId: paymentData.paymentId,
      });
    } catch (error) {
      logger.error("Failed to send payment failure email after retries", {
        email: to,
        orderId: paymentData.orderId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * @notice Sends payment refund confirmation email to user
   * @dev Confirms refund processing with amount and transaction details
   * @param to Recipient email address
   * @param paymentData Refund details including amount and transaction ID
   * @return Promise<void>
   * @throws Error if email fails to send after retries
   */
  async sendPaymentRefundedEmail(to: string, paymentData: any) {
    const mailOptions = {
      from: `"E-Commerce App" <${
        process.env.MAIL_FROM || "no-reply@ecommerce.com"
      }>`,
      to,
      subject: `Refund Processed - Transaction #${paymentData.paymentTransactionId}`,
      html: emailTemplates.paymentRefunded(paymentData),
    };

    try {
      await this.sendEmailWithRetry(mailOptions);
      logger.info("Payment refund email sent successfully", {
        email: to,
        transactionId: paymentData.paymentTransactionId,
        amount: paymentData.amount,
      });
    } catch (error) {
      logger.error("Failed to send payment refund email after retries", {
        email: to,
        transactionId: paymentData.paymentTransactionId,
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
