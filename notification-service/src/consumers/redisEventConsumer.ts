// notification-service/src/consumers/redisEventConsumer.ts
import { eventSubscriber } from "../../../shared/redis/pubsub";
import { AppEvent } from "../../../shared/events/types";
import { rabbitMQService } from "../config/rabbitmq";
import { logger } from "../config/logger";

export class RedisEventConsumer {
  private isRunning: boolean = false;

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn("Redis event consumer is already running");
      return;
    }

    try {
      // Subscribe to Redis events
      await eventSubscriber.subscribeToEvent(
        "USER_REGISTERED",
        this.handleUserRegistered
      );
      await eventSubscriber.subscribeToEvent(
        "PASSWORD_RESET_REQUESTED",
        this.handlePasswordReset
      );

      this.isRunning = true;
      logger.info("Redis event consumer started successfully");
    } catch (error) {
      logger.error("Failed to start Redis event consumer:", error);
      // Retry logic if needed
    }
  }

  private async handleUserRegistered(event: AppEvent) {
    if (event.type === "USER_REGISTERED") {
      console.log("📧 Received USER_REGISTERED event, queuing welcome email");

      // PUBLISH to RabbitMQ queue
      await rabbitMQService.publishMessage("email_verification", {
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
    }
  }

  private async handlePasswordReset(event: AppEvent) {
    if (event.type === "PASSWORD_RESET_REQUESTED") {
      console.log(
        "📧 Received PASSWORD_RESET_REQUESTED event, queuing reset email"
      );

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
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    logger.info("Redis event consumer stopped");
  }
}

export const redisEventConsumer = new RedisEventConsumer();
