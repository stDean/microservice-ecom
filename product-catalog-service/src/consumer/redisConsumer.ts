import { eventSubscriber } from "../redis/subscriber";
import { logger } from "../utils/logger";
import { OrderCancelled, OrderPlaced } from "../redis/types";
import { v4 as uuidv4 } from "uuid";
import { BadRequestError } from "../errors";
import { products } from "../db/schema";
import db from "../db";
import { eq, sql } from "drizzle-orm";

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
      await eventSubscriber.subscribeToEvent("ORDER_PLACED", (event) =>
        this.handleOrderPlaced(event as OrderPlaced)
      );

      await eventSubscriber.subscribeToEvent("ORDER_CANCELLED", (event) =>
        this.handleOrderCancelled(event as OrderCancelled)
      );

      this.isRunning = true;
      logger.info("Redis event consumer started successfully!");
    } catch (error) {
      logger.error("Failed to start Redis event consumer:", error);
      throw error;
    }
  }

  private async handleOrderPlaced(event: OrderPlaced) {
    try {
      logger.info("📦 Received ORDER_PLACED event", {
        orderId: event.data.orderId,
        itemCount: event.data.items.length,
      });

      // Update inventory for each product in the order
      for (const item of event.data.items) {
        try {
          // Decrease product stock (subtract the ordered quantity)
          const result = await db
            .update(products)
            .set({
              stock: sql`${products.stock} - ${item.quantity}`,
            })
            .where(eq(products.id, item.productId))
            .returning();

          if (result.length === 0) {
            logger.warn(
              `Product not found for inventory update: ${item.productId}`,
              {
                productId: item.productId,
                productName: item.productName,
              }
            );
          } else {
            logger.info(
              `✅ Decreased stock for ${item.productName} by ${item.quantity}`,
              {
                productId: item.productId,
                quantity: item.quantity,
                newStock: result[0].stock,
              }
            );
          }
        } catch (productError) {
          logger.error(
            `❌ Failed to update inventory for product: ${item.productId}`,
            {
              error:
                productError instanceof Error
                  ? productError.message
                  : "Unknown error",
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity,
            }
          );
          // Continue with other products even if one fails
        }
      }

      logger.info(`✅ Inventory updated for order ${event.data.orderId}`);
    } catch (error) {
      logger.error("❌ Failed to process ORDER_PLACED event:", {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        orderId: event.data.orderId,
      });
      throw error;
    }
  }

  private async handleOrderCancelled(event: OrderCancelled) {
    try {
      logger.info("🔄 Received ORDER_CANCELLED event", {
        orderId: event.data.orderId,
        itemCount: event.data.items.length,
        previousStatus: event.data.previousStatus,
      });

      // Only restock if the order was previously placed (not already cancelled)
      if (
        event.data.previousStatus !== "CANCELLED" &&
        event.data.previousStatus !== "REFUNDED"
      ) {
        // Update inventory for each product in the cancelled order
        for (const item of event.data.items) {
          try {
            // Increase product stock (add back the cancelled quantity)
            const result = await db
              .update(products)
              .set({
                stock: sql`${products.stock} + ${item.quantity}`,
              })
              .where(eq(products.id, item.productId))
              .returning();

            if (result.length === 0) {
              logger.warn(
                `Product not found for inventory restock: ${item.productId}`,
                {
                  productId: item.productId,
                  productName: item.productName,
                }
              );
            } else {
              logger.info(
                `📦 Restocked ${item.productName} by ${item.quantity}`,
                {
                  productId: item.productId,
                  quantity: item.quantity,
                  newStock: result[0].stock,
                }
              );
            }
          } catch (productError) {
            logger.error(
              `❌ Failed to restock inventory for product: ${item.productId}`,
              {
                error:
                  productError instanceof Error
                    ? productError.message
                    : "Unknown error",
                productId: item.productId,
                productName: item.productName,
                quantity: item.quantity,
              }
            );
            // Continue with other products even if one fails
          }
        }

        logger.info(
          `✅ Inventory restocked for cancelled order ${event.data.orderId}`
        );
      } else {
        logger.info(
          `⏭️  Skipping restock for already cancelled order ${event.data.orderId}`
        );
      }
    } catch (error) {
      logger.error("❌ Failed to process ORDER_CANCELLED event:", {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        orderId: event.data.orderId,
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
