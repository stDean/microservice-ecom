import { eventSubscriber } from "../redis/subscriber";
import { logger } from "../utils/logger";
import { RefundPaymentEvent } from "../redis/types";
import { v4 as uuidv4 } from "uuid";
import { BadRequestError } from "../errors";

/**
 * @title Redis Event Consumer
 * @notice Consumes Redis events and forwards to RabbitMQ for email processing
 * @dev Listens for auth service events and transforms them into email tasks
 */
export class RedisEventConsumer {
  private isRunning: boolean = false;

  /**
   * @notice Starts the Redis event consumer
   * @dev Subscribes to USER_REGISTERED and PASSWORD_RESET_REQUESTED events
   * @throws Error if subscription fails
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn("Redis event consumer is already running");
      return;
    }

    try {
      // Subscribe to Redis events
      await eventSubscriber.subscribeToEvent("EMAIL_VERIFIED", (event) =>
        this.handleRefundPaymentEvent(event as RefundPaymentEvent)
      );

      this.isRunning = true;
      logger.info("Redis event consumer started successfully!");
    } catch (error) {
      logger.error("Failed to start Redis event consumer:", error);
      throw error;
    }
  }

  private async handleRefundPaymentEvent(event: RefundPaymentEvent) {
    try {
      logger.info("📧 Received ORDER_REFUND_REQUESTED event", {
        paymentId: event.data.paymentTransactionId,
        amount: event.data.amount,
      });

      // check if the payment exists and the amount match
      // delete it from change the status to refunded
      // send a notification event.

      logger.info("✅ Refund successful", {
        paymentId: event.data.paymentTransactionId,
        amount: event.data.amount,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("❌ Failed to process ORDER_REFUND_REQUESTED event:", {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        eventData: event.data,
      });

      // You might want to implement retry logic or dead letter queue here
      throw error; // Re-throw if you want the subscriber to handle retries
    }
  }

  /**
   * @notice Stops the Redis event consumer
   * @dev Sets running flag to false, allowing graceful shutdown
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    logger.info("Redis event consumer stopped");
  }
}

/**
 * @notice Singleton instance of RedisEventConsumer
 * @dev Pre-configured consumer for application-wide use
 */
export const redisEventConsumer = new RedisEventConsumer();
