import { logger } from "../config/logger";
import { emailService } from "../service/emailService";
import { rabbitMQService } from "../config/rabbitmq";

/**
 * EmailConsumer - Consumes messages from RabbitMQ queues and sends emails
 * @class EmailConsumer
 * @description Listens to email_verification and password_reset queues,
 * processes messages, and sends appropriate emails via emailService.
 * Handles connection errors with automatic retry and graceful shutdown.
 */
class EmailConsumer {
  private isRunning: boolean = false;
  private starting: boolean = false;

  /**
   * Starts consuming messages from RabbitMQ queues
   * @async
   * @returns {Promise<void>}
   * @throws {Error} If initial connection fails (retries automatically)
   * @description
   * - Connects to RabbitMQ and sets up queue consumers
   * - Processes verification and password reset emails
   * - Implements automatic retry on connection failures
   * - Prevents multiple simultaneous startups
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn("Email consumer is already running");
      return;
    }

    this.starting = true;

    try {
      await rabbitMQService.connect();
      logger.info("✅ Connected to RabbitMQ");

      // Start consuming verification emails
      await rabbitMQService.consumeMessages(
        "email_verification",
        async (message) => {
          logger.info("Processing verification email from queue", {
            email: message.email,
            queue: "email_verification",
            messageId: message.id,
          });

          try {
            await emailService.sendVerificationEmail(
              message.email,
              message.token
            );
            logger.info("✅ Verification email sent successfully", {
              email: message.email,
            });
          } catch (error) {
            logger.error("❌ Failed to send verification email:", error, {
              email: message.email,
            });
          }
        }
      );

      // Start consuming password reset emails
      await rabbitMQService.consumeMessages(
        "password_reset",
        async (message) => {
          logger.info("📨 Processing password reset email from queue", {
            email: message.email,
            queue: "password_reset",
            messageId: message.id,
          });

          try {
            await emailService.sendPasswordResetEmail(
              message.email,
              message.token
            );

            logger.info("✅ Password reset email sent successfully", {
              email: message.email,
            });
          } catch (error) {
            logger.error("❌ Failed to send password reset email:", error, {
              email: message.email,
            });
          }
        }
      );

      // Start consuming order emails
      await rabbitMQService.consumeMessages("order_emails", async (message) => {
        logger.info("📦 Processing order email from queue", {
          email: message.email,
          type: message.type,
          queue: "order_emails",
          messageId: message.id,
        });

        try {
          switch (message.type) {
            case "ORDER_PLACED":
              await emailService.sendOrderConfirmationEmail(
                message.email,
                message.data
              );
              break;
            case "ORDER_CANCELLED":
              await emailService.sendOrderCancellationEmail(
                message.email,
                message.data
              );
              break;
            default:
              logger.warn("Unknown order email type", { type: message.type });
          }

          logger.info("✅ Order email sent successfully", {
            email: message.email,
            type: message.type,
          });
        } catch (error) {
          logger.error("❌ Failed to send order email:", error, {
            email: message.email,
            type: message.type,
          });
        }
      });

      this.isRunning = true;
      this.starting = false;

      logger.info(
        "🚀 Email consumer started successfully and listening for messages"
      );
    } catch (error) {
      logger.error("💥 Failed to start email consumer:", error);
      this.isRunning = false;
      this.starting = false;

      // Retry after 5 seconds
      setTimeout(() => {
        logger.info("Retrying to start email consumer...");
        this.start();
      }, 5000);
    }
  }

  /**
   * Stops the email consumer and closes RabbitMQ connection
   * @async
   * @returns {Promise<void>}
   * @description
   * - Stops message consumption
   * - Closes RabbitMQ connection gracefully
   * - Handles connection close errors silently
   * - Resets internal state flags
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    this.starting = false;

    try {
      await rabbitMQService.close();
      logger.info("Email consumer stopped");
    } catch (error) {
      logger.error("Error closing RabbitMQ connection:", error);
      logger.info("Email consumer stopped (with connection error)");
    }
  }
}

// Singleton instance of EmailConsumer
export const emailConsumer = new EmailConsumer();
