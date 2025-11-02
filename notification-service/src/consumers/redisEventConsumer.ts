import { logger } from "../config/logger";
import { rabbitMQService } from "../config/rabbitmq";
import { eventSubscriber } from "../events/subscriber";
import {
  PasswordResetEvent,
  UserRegisteredEvent,
  OrderPlacedEvent,
  OrderCancelledEvent,
  PaymentProcessedEvent,
  PaymentFailedEvent,
  PaymentRefundedEvent,
  OrderShippedEvent,
  OrderDeliveredEvent
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

      // Subscribe to all Redis events
      await eventSubscriber.subscribeToEvent("USER_REGISTERED", (event) =>
        this.handleUserRegistered(event as UserRegisteredEvent)
      );

      await eventSubscriber.subscribeToEvent(
        "PASSWORD_RESET_REQUESTED",
        (event) => this.handlePasswordReset(event as PasswordResetEvent)
      );

      await eventSubscriber.subscribeToEvent("ORDER_PLACED", (event) =>
        this.handleOrderPlaced(event as OrderPlacedEvent)
      );

      await eventSubscriber.subscribeToEvent("ORDER_CANCELLED", (event) =>
        this.handleOrderCancelled(event as OrderCancelledEvent)
      );

      await eventSubscriber.subscribeToEvent("PAYMENT_PROCESSED", (event) =>
        this.handlePaymentProcessed(event as PaymentProcessedEvent)
      );

      await eventSubscriber.subscribeToEvent("PAYMENT_FAILED", (event) =>
        this.handlePaymentFailed(event as PaymentFailedEvent)
      );

      await eventSubscriber.subscribeToEvent("PAYMENT_REFUNDED", (event) =>
        this.handlePaymentRefunded(event as PaymentRefundedEvent)
      );

      await eventSubscriber.subscribeToEvent("ORDER_SHIPPED", (event) =>
        this.handleOrderShipped(event as OrderShippedEvent)
      );

      await eventSubscriber.subscribeToEvent("ORDER_DELIVERED", (event) =>
        this.handleOrderDelivered(event as OrderDeliveredEvent)
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
        email: event.data.email, // Assuming userId is the email, adjust if needed
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
        email: event.data.email, // Assuming userId is the email, adjust if needed
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
   * @notice Processes payment processed events for success emails
   * @dev Queues payment success email with transaction details
   * @param event Payment processed event with transaction details
   */
  private async handlePaymentProcessed(event: PaymentProcessedEvent) {
    try {
      logger.info("💰 Received PAYMENT_PROCESSED event", {
        orderId: event.data.orderId,
        transactionId: event.data.paymentTransactionId,
      });

      // PUBLISH to RabbitMQ queue
      await rabbitMQService.publishMessage("payment_emails", {
        id: `payment_success_${Date.now()}`,
        email: event.data.email,
        type: "PAYMENT_SUCCESS",
        data: {
          orderId: event.data.orderId,
          paymentTransactionId: event.data.paymentTransactionId,
          message: event.data.message,
          userId: event.data.userId,
        },
        timestamp: new Date().toISOString(),
        requestId: `redis_${Date.now()}`,
      });

      logger.info("✅ Payment success email queued", {
        orderId: event.data.orderId,
        transactionId: event.data.paymentTransactionId,
      });
    } catch (error) {
      logger.error("❌ Failed to process PAYMENT_PROCESSED event:", error);
    }
  }

  /**
   * @notice Processes payment failed events for failure emails
   * @dev Queues payment failure email with failure details
   * @param event Payment failed event with failure details
   */
  private async handlePaymentFailed(event: PaymentFailedEvent) {
    try {
      logger.info("❌ Received PAYMENT_FAILED event", {
        orderId: event.data.orderId,
        paymentId: event.data.paymentId,
      });

      // PUBLISH to RabbitMQ queue
      await rabbitMQService.publishMessage("payment_emails", {
        id: `payment_failed_${Date.now()}`,
        email: event.data.email,
        type: "PAYMENT_FAILED",
        data: {
          orderId: event.data.orderId,
          paymentId: event.data.paymentId,
          userId: event.data.userId,
        },
        timestamp: new Date().toISOString(),
        requestId: `redis_${Date.now()}`,
      });

      logger.info("✅ Payment failure email queued", {
        orderId: event.data.orderId,
        paymentId: event.data.paymentId,
      });
    } catch (error) {
      logger.error("❌ Failed to process PAYMENT_FAILED event:", error);
    }
  }

  /**
   * @notice Processes payment refunded events for refund emails
   * @dev Queues payment refund email with refund details
   * @param event Payment refunded event with refund details
   */
  private async handlePaymentRefunded(event: PaymentRefundedEvent) {
    try {
      logger.info("🔄 Received PAYMENT_REFUNDED event", {
        transactionId: event.data.paymentTransactionId,
        amount: event.data.amount,
      });

      // PUBLISH to RabbitMQ queue
      await rabbitMQService.publishMessage("payment_emails", {
        id: `payment_refunded_${Date.now()}`,
        email: event.data.email,
        type: "PAYMENT_REFUNDED",
        data: {
          paymentTransactionId: event.data.paymentTransactionId,
          amount: event.data.amount,
          message: event.data.message,
        },
        timestamp: new Date().toISOString(),
        requestId: `redis_${Date.now()}`,
      });

      logger.info("✅ Payment refund email queued", {
        transactionId: event.data.paymentTransactionId,
        amount: event.data.amount,
      });
    } catch (error) {
      logger.error("❌ Failed to process PAYMENT_REFUNDED event:", error);
    }
  }
  /**
   *  @notice Processes order shipped events for shipping emails
   * @dev Queues order shipping email with shipping details
   * @param event Order shipped event with shipping details
   */
  private async handleOrderShipped(event: OrderShippedEvent) {
    try {
      logger.info("🚚 Received ORDER_SHIPPED event", {
        orderId: event.data.orderId,
        trackingNumber: event.data.trackingNumber,
      });

      // PUBLISH to RabbitMQ queue
      await rabbitMQService.publishMessage("shipping_emails", {
        id: `order_shipped_${Date.now()}`,
        email: event.data.email,
        type: "ORDER_SHIPPED",
        data: {
          orderId: event.data.orderId,
          trackingNumber: event.data.trackingNumber,
          estimatedDelivery: event.data.estimatedDelivery,
          shippedAt: event.data.shippedAt,
          status: event.data.status,
          userId: event.data.userId,
        },
        timestamp: new Date().toISOString(),
        requestId: `redis_${Date.now()}`,
      });

      logger.info("✅ Order shipped email queued", {
        orderId: event.data.orderId,
        trackingNumber: event.data.trackingNumber,
      });
    } catch (error) {
      logger.error("❌ Failed to process ORDER_SHIPPED event:", error);
    }
  }

  /**
   * @notice Processes order delivered events for delivery emails
   * @dev Queues order delivery email with delivery details
   * @param event Order delivered event with delivery details
   */
  private async handleOrderDelivered(event: OrderDeliveredEvent) {
    try {
      logger.info("📦 Received ORDER_DELIVERED event", {
        orderId: event.data.orderId,
        trackingNumber: event.data.trackingNumber,
      });

      // PUBLISH to RabbitMQ queue
      await rabbitMQService.publishMessage("shipping_emails", {
        id: `order_delivered_${Date.now()}`,
        email: event.data.email,
        type: "ORDER_DELIVERED",
        data: {
          orderId: event.data.orderId,
          trackingNumber: event.data.trackingNumber,
          status: event.data.status,
          userId: event.data.userId,
          deliveredAt: event.data.deliveredAt,
        },
        timestamp: new Date().toISOString(),
        requestId: `redis_${Date.now()}`,
      });

      logger.info("✅ Order delivered email queued", {
        orderId: event.data.orderId,
        trackingNumber: event.data.trackingNumber,
      });
    } catch (error) {
      logger.error("❌ Failed to process ORDER_DELIVERED event:", error);
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
