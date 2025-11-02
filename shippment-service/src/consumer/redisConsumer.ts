// src/consumer/redisConsumer.ts
import { Shipping, ShippingStatus } from "../db/schema";
import { eventPublisher } from "../redis/publisher";
import { eventSubscriber } from "../redis/subscriber";
import { PaymentProcessedEvent, ShipProductEvent } from "../redis/types";
import { logger } from "../utils/logger";

/**
 * @title Redis Event Consumer
 * @notice Consumes Redis events and handles shipping logic
 */
export class RedisEventConsumer {
  private isRunning: boolean = false;

  /**
   * @notice Starts the Redis event consumer
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn("Redis event consumer is already running");
      return;
    }

    try {
      // Subscribe to Redis events
      await eventSubscriber.subscribeToEvent("PAYMENT_PROCESSED", (event) =>
        this.handlePaymentProcessedEvent(event as PaymentProcessedEvent)
      );

      await eventSubscriber.subscribeToEvent(
        "SHIP_PRODUCT_PAY_ON_DELIVERY",
        (event) => this.handleShipProductEvent(event as ShipProductEvent)
      );

      this.isRunning = true;
      logger.info(
        "✅ Shipping Service Redis event consumer started successfully!"
      );
    } catch (error) {
      logger.error("❌ Failed to start Redis event consumer:", error);
      throw error;
    }
  }

  private async handlePaymentProcessedEvent(event: PaymentProcessedEvent) {
    try {
      logger.info("🚚 Payment Processed Event Received - Creating Shipping", {
        orderId: event.data.orderId,
        userId: event.data.userId,
      });

      await this.createShippingRecord(event.data);
    } catch (error) {
      logger.error("❌ Failed to process PAYMENT_PROCESSED event:", {
        error: error instanceof Error ? error.message : "Unknown error",
        orderId: event.data.orderId,
      });
      throw error;
    }
  }

  private async handleShipProductEvent(event: ShipProductEvent) {
    try {
      logger.info("🚚 Ship Product Event Received - Creating Shipping", {
        orderId: event.data.orderId,
        userId: event.data.userId,
      });

      await this.createShippingRecord(event.data);
    } catch (error) {
      logger.error("❌ Failed to process SHIP_PRODUCT event:", {
        error: error instanceof Error ? error.message : "Unknown error",
        orderId: event.data.orderId,
      });
      throw error;
    }
  }

  private async createShippingRecord(eventData: any) {
    // Generate tracking number
    const trackingNumber = this.generateTrackingNumber();

    // Set estimated delivery to 10 minutes from now for simulation
    const estimatedDelivery = new Date(Date.now() + 10 * 60 * 1000);

    // Create shipping record
    const shipping = new Shipping({
      orderId: eventData.orderId,
      userId: eventData.userId,
      trackingNumber,
      status: ShippingStatus.PENDING,
      shippingAddress: eventData.shippingAddress,
      estimatedDelivery,
      email: eventData.email, // Store email for notifications
    });

    await shipping.save();

    logger.info("📦 Shipping record created for order", {
      orderId: eventData.orderId,
      trackingNumber,
      estimatedDelivery: estimatedDelivery.toISOString(),
    });

    // Immediately ship the order
    await this.shipOrder(eventData.orderId);
  }

  async shipOrder(orderId: string): Promise<void> {
    try {
      const shipping = await Shipping.findOne({ orderId });

      if (!shipping) {
        throw new Error(`Shipping record not found for order ${orderId}`);
      }

      shipping.status = ShippingStatus.SHIPPED;
      await shipping.save();

      // Publish ORDER_SHIPPED event
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
          email: shipping.email,
          status: shipping.status,
          shippingAddress: shipping.shippingAddress,
        },
      });

      logger.info("📤 Order shipped successfully", {
        orderId,
        trackingNumber: shipping.trackingNumber,
      });
    } catch (error) {
      logger.error("❌ Error shipping order:", {
        error: error instanceof Error ? error.message : "Unknown error",
        orderId,
      });
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
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    logger.info("Redis event consumer stopped");
  }
}

export const redisEventConsumer = new RedisEventConsumer();
