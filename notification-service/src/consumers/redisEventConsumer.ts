import { logger } from "../config/logger";
import { rabbitMQService } from "../config/rabbitmq";
import { eventSubscriber } from "../events/subscriber";
import {
  PasswordResetEvent,
  UserRegisteredEvent,
  OrderPlacedEvent,
  OrderCancelledEvent,
} from "../events/types";

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
      await eventSubscriber.subscribeToEvent("USER_REGISTERED", (event) =>
        this.handleUserRegistered(event as UserRegisteredEvent)
      );

      await eventSubscriber.subscribeToEvent(
        "PASSWORD_RESET_REQUESTED",
        (event) => this.handlePasswordReset(event as PasswordResetEvent)
      );

      this.isRunning = true;
      logger.info("Redis event consumer started successfully!");
    } catch (error) {
      logger.error("Failed to start Redis event consumer:", error);
      throw error;
    }
  }

  /**
   * @notice Processes user registration events for welcome emails
   * @dev Validates verification token and queues welcome email task
   * @param event User registration event with verification details
   */
  private async handleUserRegistered(event: UserRegisteredEvent) {
    try {
      logger.info("📧 Received USER_REGISTERED event", {
        userId: event.data.userId,
        email: event.data.email,
      });

      // Validate required data
      if (!event.data.verificationToken) {
        logger.warn(
          "Missing verificationToken in USER_REGISTERED event",
          event.data
        );
        return;
      }

      // PUBLISH to RabbitMQ queue
      await rabbitMQService.publishMessage("verification", {
        id: `welcome_${Date.now()}`,
        email: event.data.email,
        token: event.data.verificationToken, // Make sure auth service sends this
        type: "WELCOME_EMAIL",
        data: {
          userId: event.data.userId,
          name: event.data.name,
        },
        timestamp: new Date().toISOString(),
        requestId: `redis_${Date.now()}`,
      });

      logger.info("✅ Welcome email queued for user", {
        email: event.data.email,
      });
    } catch (error) {
      logger.error("❌ Failed to process USER_REGISTERED event:", error);
      // Consider adding retry logic or dead letter queue
    }
  }

  /**
   * @notice Processes password reset events for reset emails
   * @dev Queues password reset email task with token and expiration
   * @param event Password reset event with reset details
   */
  private async handlePasswordReset(event: PasswordResetEvent) {
    try {
      logger.info("📧 Received PASSWORD_RESET_REQUESTED event", {
        email: event.data.email,
      });

      // PUBLISH to RabbitMQ queue
      await rabbitMQService.publishMessage("password_reset", {
        id: `reset_${Date.now()}`,
        email: event.data.email,
        token: event.data.resetToken,
        type: "PASSWORD_RESET",
        data: {
          expiresAt: event.data.expiresAt,
        },
        timestamp: new Date().toISOString(),
        requestId: `redis_${Date.now()}`,
      });

      logger.info("✅ Password reset email queued", {
        email: event.data.email,
      });
    } catch (error) {
      logger.error("Error stopping Redis event consumer:", error);
    }
  }

  /**
   * @notice Processes order placed events for order confirmation emails
   * @dev Queues order confirmation email with order details
   * @param event Order placed event with order details
   */
  private async handleOrderPlaced(event: OrderPlacedEvent) {
    try {
      logger.info("🛒 Received ORDER_PLACED event", {
        orderId: event.data.orderId,
        userId: event.data.userId,
        status: event.data.status,
      });

      // PUBLISH to RabbitMQ queue
      await rabbitMQService.publishMessage("order_emails", {
        id: `order_placed_${Date.now()}`,
        email: event.data.userId, // Assuming userId is the email, adjust if needed
        type: "ORDER_PLACED",
        data: {
          orderId: event.data.orderId,
          status: event.data.status,
          items: event.data.items,
          orderSummary: {
            subtotal: event.data.subtotal,
            shipping: event.data.shippingCost,
            tax: event.data.taxAmount,
            total: event.data.totalAmount,
          },
          userId: event.data.userId,
        },
        timestamp: new Date().toISOString(),
        requestId: `redis_${Date.now()}`,
      });

      logger.info("✅ Order confirmation email queued", {
        orderId: event.data.orderId,
      });
    } catch (error) {
      logger.error("❌ Failed to process ORDER_PLACED event:", error);
    }
  }

  /**
   * @notice Processes order cancelled events for cancellation emails
   * @dev Queues order cancellation email with cancellation details
   * @param event Order cancelled event with cancellation details
   */
  private async handleOrderCancelled(event: OrderCancelledEvent) {
    try {
      logger.info("🔄 Received ORDER_CANCELLED event", {
        orderId: event.data.orderId,
        status: event.data.status,
        requiresRefund: event.data.requiresRefund,
      });

      // PUBLISH to RabbitMQ queue
      await rabbitMQService.publishMessage("order_emails", {
        id: `order_cancelled_${Date.now()}`,
        email: event.data.userId, // Assuming userId is the email, adjust if needed
        type: "ORDER_CANCELLED",
        data: {
          orderId: event.data.orderId,
          status: event.data.status,
          requiresRefund: event.data.requiresRefund,
          previousStatus: event.data.previousStatus,
          items: event.data.items,
          reason: event.data.reason,
          userId: event.data.userId,
        },
        timestamp: new Date().toISOString(),
        requestId: `redis_${Date.now()}`,
      });

      logger.info("✅ Order cancellation email queued", {
        orderId: event.data.orderId,
      });
    } catch (error) {
      logger.error("❌ Failed to process ORDER_CANCELLED event:", error);
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
