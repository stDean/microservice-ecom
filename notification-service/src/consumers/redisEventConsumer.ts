// notification-service/src/consumers/redisEventConsumer.ts
import { logger } from "../config/logger";
import { rabbitMQService } from "../config/rabbitmq";
import { eventSubscriber } from "../events/subscriber";
import { PasswordResetEvent, UserRegisteredEvent } from "../events/types";

export class RedisEventConsumer {
  private isRunning: boolean = false;

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

  async stop(): Promise<void> {
    this.isRunning = false;
    logger.info("Redis event consumer stopped");
  }
}

export const redisEventConsumer = new RedisEventConsumer();
