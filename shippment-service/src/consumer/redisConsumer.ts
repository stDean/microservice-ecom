import { eventSubscriber } from "../redis/subscriber";
import { logger } from "../utils/logger";
import { PaymentProcessedEvent, ShipProductEvent } from "../redis/types";
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
        this.handlePaymentProcessedEvent(event as PaymentProcessedEvent)
      );

      await eventSubscriber.subscribeToEvent(
        "SHIP_PRODUCT_PAY_ON_DELIVERY",
        (event) => this.handleShipPayOnDelivery(event as ShipProductEvent)
      );

      this.isRunning = true;
      logger.info("Redis event consumer started successfully!");
    } catch (error) {
      logger.error("Failed to start Redis event consumer:", error);
      throw error;
    }
  }

  private async handlePaymentProcessedEvent(event: PaymentProcessedEvent) {
    try {
      logger.info("📧 Received EMAIL_VERIFIED event", {
        userId: event.data.userId,
        email: event.data.email,
      });

      logger.info("✅ User created successfully", {
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("❌ Failed to process EMAIL_VERIFIED event:", {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        eventData: event.data,
      });

      // You might want to implement retry logic or dead letter queue here
      throw error; // Re-throw if you want the subscriber to handle retries
    }
  }

  private async handleShipPayOnDelivery(event: ShipProductEvent) {
    try {
      logger.info("📧 Received SHIP_PRODUCT_PAY_ON_DELIVERY event", {
        userId: event.data.userId,
        email: event.data.email,
      });

      logger.info("✅ User created successfully", {
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("❌ Failed to process SHIP_PRODUCT_PAY_ON_DELIVERY event:", {
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
