import { logger } from "../config/logger";
import { rabbitMQService } from "../config/rabbitmq";
import { eventSubscriber } from "../events/subscriber";
import { PasswordResetEvent, UserRegisteredEvent } from "../events/types";

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
