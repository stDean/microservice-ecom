import { eventSubscriber } from "../events/subscriber";
import logger from "../utils/logger";
import { UserDeletedEvent } from "../events/types";
import { BadRequestError } from "../errors";
import db from "../db";
import {
  passwordResetTokens,
  sessions,
  users,
  verificationTokens,
} from "../db/schema";
import { and, eq } from "drizzle-orm";

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
      await eventSubscriber.subscribeToEvent("USER_DELETED", (event) =>
        this.handleUserDeletedEvent(event as UserDeletedEvent)
      );

      this.isRunning = true;
      logger.info("Redis event consumer started successfully!");
    } catch (error) {
      logger.error("Failed to start Redis event consumer:", error);
      throw error;
    }
  }

  private async handleUserDeletedEvent(event: UserDeletedEvent) {
    try {
      logger.info("📧 Received USER_DELETED event", {
        userId: event.data.userId,
        email: event.data.email,
      });

      await db.transaction(async (tx) => {
        await tx
          .delete(users)
          .where(
            and(
              eq(users.id, event.data.userId),
              eq(users.email, event.data.email)
            )
          );

        await tx.delete(sessions).where(eq(sessions.userId, event.data.userId));
      });

      logger.info("✅ User deleted successfully");
    } catch (error) {
      logger.error("❌ Failed to process USER_DELETED event:", {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        eventData: event.data,
      });

      // You might want to implement retry logic or dead letter queue here
      throw error; // Re-throw if you want the subscriber to handle retries
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
