import { eventSubscriber } from "../redis/subscriber";
import { logger } from "../utils/logger";
import { PaymentProcessedEvent, ShipProductEvent } from "../redis/types";
import { BadRequestError } from "../errors";
import { Shipping, ShippingStatus } from "../db/schema";
import { eventPublisher } from "../redis/publisher";

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
        (event) => this.handlePaymentProcessedEvent(event as ShipProductEvent)
      );

      this.isRunning = true;
      logger.info("Redis event consumer started successfully!");
    } catch (error) {
      logger.error("Failed to start Redis event consumer:", error);
      throw error;
    }
  }

  private async handlePaymentProcessedEvent(
    event: PaymentProcessedEvent | ShipProductEvent
  ) {
    try {
      logger.info("📧 Received EMAIL_VERIFIED event", {
        userId: event.data.userId,
        email: event.data.email,
      });

      // Simulate user creation logic
      // Generate tracking number
      const trackingNumber = this.generateTrackingNumber();

      // Set estimated delivery to 10 minutes from now for simulation
      const estimatedDelivery = new Date(Date.now() + 10 * 60 * 1000);

      // Create shipping record
      const shipping = new Shipping({
        orderId: event.data.orderId,
        userId: event.data.userId,
        trackingNumber,
        status: ShippingStatus.PENDING,
        shippingAddress: event.data.shippingAddress,
        estimatedDelivery,
      });

      await shipping.save();

      logger.info("Shipping record created for order", {
        orderId: event.data.orderId,
      });

      // Immediately ship the order (in real scenario, there might be a processing time)
      await this.shipOrder(event.data.orderId);
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

  async shipOrder(orderId: string): Promise<void> {
    try {
      const shipping = await Shipping.findOne({ orderId });

      if (!shipping) {
        throw new Error(`Shipping record not found for order ${orderId}`);
      }

      shipping.status = ShippingStatus.SHIPPED;
      await shipping.save();

      eventPublisher.publishEvent({
        type: "ORDER_SHIPPED",
        version: "1.0.0",
        timestamp: new Date(),
        source: "shipping-service",
        data: {
          orderId: shipping.orderId,
          userId: shipping.userId,
          trackingNumber: shipping.trackingNumber,
          estimatedDelivery: shipping.estimatedDelivery,
          shippedAt: new Date(),
        },
      });

      // await this.messageService.publishOrderShipped(orderShippedEvent);

      console.log(
        `Order ${orderId} shipped with tracking number ${shipping.trackingNumber}`
      );
    } catch (error) {
      console.error("Error shipping order:", error);
      throw error;
    }
  }

  private generateTrackingNumber(): string {
    const prefix = "TRK";
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}${timestamp}${random}`.toUpperCase();
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
