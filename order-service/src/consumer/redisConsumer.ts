import { and, eq } from "drizzle-orm";
import db from "../db";
import { orders, orderStatusHistory } from "../db/schema";
import { NotFoundError } from "../errors";
import { eventSubscriber } from "../redis/subscriber";
import {
  OrderDeliveredEvent,
  OrderShippedEvent,
  PaymentProcessedEvent,
} from "../redis/types";
import { logger } from "../utils/logger";

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
      await eventSubscriber.subscribeToEvent("PAYMENT_PROCESSED", (event) =>
        this.handlePaymentProcessedEvent(event as PaymentProcessedEvent)
      );

      await eventSubscriber.subscribeToEvent("ORDER_DELIVERED", (event) =>
        this.handleOrderDeliveredEvent(event as OrderDeliveredEvent)
      );

      await eventSubscriber.subscribeToEvent("ORDER_SHIPPED", (event) =>
        this.handleOrderShippedEvent(event as OrderShippedEvent)
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
      logger.info("📧 Received PAYMENT_PROCESSED event", {
        paymentId: event.data.paymentTransactionId,
        orderId: event.data.orderId,
      });

      await db.transaction(async (tx) => {
        const order = await tx
          .select()
          .from(orders)
          .where(
            and(
              eq(orders.id, event.data.orderId),
              eq(orders.userId, event.data.userId)
            )
          )
          .limit(1);

        if (order.length === 0) {
          throw new NotFoundError(
            `Order with ID ${event.data.orderId} not found`
          );
        }

        // update order status to paid
        await tx
          .update(orders)
          .set({
            currentStatus: "PAID",
            awaitingDelivery: true,
            paymentTransactionId: event.data.paymentTransactionId,
          })
          .where(
            and(
              eq(orders.id, event.data.orderId),
              eq(orders.userId, event.data.userId)
            )
          );

        await tx
          .update(orderStatusHistory)
          .set({
            status: "PAID",
            reason: "Payment processed successfully",
          })
          .where(eq(orderStatusHistory.orderId, event.data.orderId));
      });

      logger.info("✅ Payment successful", {
        paymentId: event.data.paymentTransactionId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("❌ Failed to process PAYMENT_PROCESSED event:", {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        eventData: event.data,
      });

      // You might want to implement retry logic or dead letter queue here
      throw error; // Re-throw if you want the subscriber to handle retries
    }
  }

  private async handleOrderShippedEvent(event: OrderShippedEvent) {
    try {
      logger.info("📧 Received ORDER_SHIPPED event", {
        orderId: event.data.orderId,
        trackingNumber: event.data.trackingNumber,
      });

      // Process the ORDER_SHIPPED event (e.g., update order status in DB)
      await db
        .update(orders)
        .set({ currentStatus: "SHIPPED" })
        .where(eq(orders.id, event.data.orderId));

      logger.info("✅ Order marked as shipped", {
        orderId: event.data.orderId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("❌ Failed to process ORDER_SHIPPED event:", {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        eventData: event.data,
      });

      throw error;
    }
  }

  private async handleOrderDeliveredEvent(event: OrderDeliveredEvent) {
    try {
      logger.info("📧 Received ORDER_DELIVERED event", {
        orderId: event.data.orderId,
        trackingNumber: event.data.trackingNumber,
      });

      // Process the ORDER_DELIVERED event (e.g., update order status in DB)
      await db
        .update(orders)
        .set({ currentStatus: "DELIVERED" })
        .where(eq(orders.id, event.data.orderId));

      logger.info("✅ Order marked as delivered", {
        orderId: event.data.orderId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("❌ Failed to process ORDER_DELIVERED event:", {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        eventData: event.data,
      });

      throw error;
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
