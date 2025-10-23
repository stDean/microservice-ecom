import { eventSubscriber } from "../redis/subscriber";
import {
  ProductDeleted,
  ProductStatusChange,
  ProductPriceChange,
  OrderCompleted,
} from "../redis/types";
import { logger } from "../utils/logger";
import { CartCache } from "../utils/cartCache";
import RedisService from "../redis/client";

/**
 * @title Redis Event Consumer for Product Events
 * @notice Handles product events to maintain cart cache consistency
 * @dev Listens for product changes and updates cart cache accordingly
 */
export class RedisEventConsumer {
  private isRunning: boolean = false;
  private redisService: RedisService;

  constructor() {
    this.redisService = RedisService.getInstance();
  }

  /**
   * @notice Starts the Redis event consumer
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn("Redis event consumer is already running");
      return;
    }

    try {
      await eventSubscriber.subscribeToEvent(
        "PRODUCT_STATUS_CHANGED",
        (event) => this.handleProductStatusChange(event as ProductStatusChange)
      );

      await eventSubscriber.subscribeToEvent("PRODUCT_DELETED", (event) =>
        this.handleProductDeleted(event as ProductDeleted)
      );

      await eventSubscriber.subscribeToEvent("PRODUCT_PRICE_CHANGE", (event) =>
        this.handleProductPriceChange(event as ProductPriceChange)
      );

      await eventSubscriber.subscribeToEvent("ORDER_COMPLETED", (event) =>
        this.handleOrderCompleted(event as OrderCompleted)
      );

      this.isRunning = true;
      logger.info("Redis event consumer started successfully");
    } catch (error) {
      logger.error("Failed to start Redis event consumer:", error);
      throw error;
    }
  }

  /**
   * @notice Handles order completion events
   * @dev Clears the user's cart when their order is completed
   */
  private async handleOrderCompleted(event: OrderCompleted) {
    try {
      logger.info("Processing ORDER_COMPLETED event", {
        orderId: event.data.orderId,
        userId: event.data.userId,
      });

      await this.clearUserCart(event.data.userId);

      logger.info("Cleared user cart after order completion", {
        userId: event.data.userId,
        orderId: event.data.orderId,
      });
    } catch (error) {
      logger.error("Failed to process ORDER_COMPLETED event:", {
        userId: event.data.userId,
        orderId: event.data.orderId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * @notice Clears a user's cart after order completion
   */
  private async clearUserCart(userId: string): Promise<void> {
    const cartKey = `cart:${userId}`;

    // Clear the cart hash
    await this.redisService.del(cartKey);

    // Clear all cart-related caches
    await CartCache.invalidateAllUserCartCache(userId);
  }

  /**
   * @notice Handles product status changes (active/inactive)
   * @dev Removes inactive products from all carts
   */
  private async handleProductStatusChange(event: ProductStatusChange) {
    try {
      logger.info("Processing PRODUCT_STATUS_CHANGED event", {
        productId: event.data.productId,
        newStatus: event.data.newStatus,
      });

      // If product becomes inactive, remove it from all carts
      if (event.data.newStatus === false) {
        await this.removeProductFromAllCarts(event.data.productId);
        logger.info("Removed inactive product from all carts", {
          productId: event.data.productId,
        });
      }
    } catch (error) {
      logger.error("Failed to process PRODUCT_STATUS_CHANGED event:", {
        productId: event.data.productId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * @notice Handles product deletion
   * @dev Removes deleted products from all carts
   */
  private async handleProductDeleted(event: ProductDeleted) {
    try {
      logger.info("Processing PRODUCT_DELETED event", {
        productId: event.data.productId,
      });

      await this.removeProductFromAllCarts(event.data.productId);

      logger.info("Removed deleted product from all carts", {
        productId: event.data.productId,
      });
    } catch (error) {
      logger.error("Failed to process PRODUCT_DELETED event:", {
        productId: event.data.productId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * @notice Handles product price changes
   * @dev Invalidates cart cache for carts containing the product
   */
  private async handleProductPriceChange(event: ProductPriceChange) {
    try {
      logger.info("Processing PRODUCT_PRICE_CHANGE event", {
        productId: event.data.productId,
      });

      await this.invalidateCartsWithProduct(event.data.productId);
      logger.info("Invalidated cache for product price change", {
        productId: event.data.productId,
      });
    } catch (error) {
      logger.error("Failed to process PRODUCT_PRICE_CHANGE event:", {
        productId: event.data.productId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * @notice Removes a product from all user carts
   */
  private async removeProductFromAllCarts(productId: string): Promise<void> {
    const cartKeys = await this.redisService.getKeys("cart:*");

    for (const cartKey of cartKeys) {
      const userId = cartKey.replace("cart:", "");

      // Check if cart contains the product
      const productExists = await this.redisService.hGet(cartKey, productId);
      if (productExists) {
        // Remove product from cart
        await this.redisService.hDel(cartKey, [productId]);
        // Invalidate user's cart cache
        await CartCache.invalidateAllUserCartCache(userId);
      }
    }
  }

  /**
   * @notice Invalidates cache for carts containing a specific product
   */
  private async invalidateCartsWithProduct(productId: string): Promise<void> {
    const cartKeys = await this.redisService.getKeys("cart:*");

    for (const cartKey of cartKeys) {
      const userId = cartKey.replace("cart:", "");

      // Check if cart contains the product
      const productExists = await this.redisService.hGet(cartKey, productId);
      if (productExists) {
        await CartCache.invalidateAllUserCartCache(userId);
      }
    }
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
