import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  RedisEventConsumer,
  redisEventConsumer,
} from "../../src/consumers/redisEventConsumer";
import { eventSubscriber } from "../../src/events/subscriber";
import { rabbitMQService } from "../../src/config/rabbitmq";
import { logger } from "../../src/config/logger";
import type {
  UserRegisteredEvent,
  PasswordResetEvent,
} from "../../src/events/types";

// Mock dependencies
vi.mock("../../src/events/subscriber", () => ({
  eventSubscriber: {
    subscribeToEvent: vi.fn().mockResolvedValue(undefined),
    unsubscribeFromEvent: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../src/config/rabbitmq", () => ({
  rabbitMQService: {
    publishMessage: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../src/config/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("RedisEventConsumer", () => {
  let consumer: RedisEventConsumer;

  beforeEach(() => {
    vi.clearAllMocks();
    consumer = new RedisEventConsumer();
  });

  describe("start", () => {
    it("should start successfully and subscribe to events", async () => {
      await consumer.start();

      expect(eventSubscriber.subscribeToEvent).toHaveBeenCalledWith(
        "USER_REGISTERED",
        expect.any(Function)
      );
      expect(eventSubscriber.subscribeToEvent).toHaveBeenCalledWith(
        "PASSWORD_RESET_REQUESTED",
        expect.any(Function)
      );
      expect(logger.info).toHaveBeenCalledWith(
        "Redis event consumer started successfully!"
      );
    });

    it("should not start if already running", async () => {
      // First start
      await consumer.start();

      // Reset mocks
      vi.clearAllMocks();

      // Try to start again
      await consumer.start();

      expect(logger.warn).toHaveBeenCalledWith(
        "Redis event consumer is already running"
      );
      expect(eventSubscriber.subscribeToEvent).not.toHaveBeenCalled();
    });

    it("should handle startup errors", async () => {
      const subscribeError = new Error("Subscription failed");
      vi.mocked(eventSubscriber.subscribeToEvent).mockRejectedValueOnce(
        subscribeError
      );

      await expect(consumer.start()).rejects.toThrow("Subscription failed");
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to start Redis event consumer:",
        subscribeError
      );
    });
  });

  describe("handleUserRegistered", () => {
    it("should process USER_REGISTERED event successfully", async () => {
      const event: UserRegisteredEvent = {
        type: "USER_REGISTERED",
        source: "auth-service",
        timestamp: new Date(),
        version: "1.0.0",
        data: {
          userId: "123",
          email: "test@example.com",
          name: "Test User",
          verificationToken: "verification-token-123",
        },
      };

      // Access private method via the consumer instance
      await consumer["handleUserRegistered"](event);

      expect(logger.info).toHaveBeenCalledWith(
        "📧 Received USER_REGISTERED event",
        {
          userId: "123",
          email: "test@example.com",
        }
      );

      expect(rabbitMQService.publishMessage).toHaveBeenCalledWith(
        "verification",
        {
          id: expect.stringMatching(/welcome_\d+/),
          email: "test@example.com",
          token: "verification-token-123",
          type: "WELCOME_EMAIL",
          data: {
            userId: "123",
            name: "Test User",
          },
          timestamp: expect.any(String),
          requestId: expect.stringMatching(/redis_\d+/),
        }
      );

      expect(logger.info).toHaveBeenCalledWith(
        "✅ Welcome email queued for user",
        {
          email: "test@example.com",
        }
      );
    });

    it("should handle missing verification token", async () => {
      const event: UserRegisteredEvent = {
        type: "USER_REGISTERED",
        source: "auth-service",
        timestamp: new Date(),
        version: "1.0.0",
        data: {
          userId: "123",
          email: "test@example.com",
          name: "Test User",
          verificationToken: "", // Missing token
        },
      };

      await consumer["handleUserRegistered"](event);

      expect(logger.warn).toHaveBeenCalledWith(
        "Missing verificationToken in USER_REGISTERED event",
        event.data
      );
      expect(rabbitMQService.publishMessage).not.toHaveBeenCalled();
    });

    it("should handle RabbitMQ publish errors", async () => {
      const event: UserRegisteredEvent = {
        type: "USER_REGISTERED",
        source: "auth-service",
        timestamp: new Date(),
        version: "1.0.0",
        data: {
          userId: "123",
          email: "test@example.com",
          name: "Test User",
          verificationToken: "token-123",
        },
      };

      const publishError = new Error("RabbitMQ error");
      vi.mocked(rabbitMQService.publishMessage).mockRejectedValueOnce(
        publishError
      );

      await consumer["handleUserRegistered"](event);

      expect(logger.error).toHaveBeenCalledWith(
        "❌ Failed to process USER_REGISTERED event:",
        publishError
      );
    });
  });

  describe("handlePasswordReset", () => {
    it("should process PASSWORD_RESET_REQUESTED event successfully", async () => {
      const expiresAt = new Date("2023-12-31T23:59:59.000Z");
      const event: PasswordResetEvent = {
        type: "PASSWORD_RESET_REQUESTED",
        source: "auth-service",
        timestamp: new Date(),
        version: "1.0.0",
        data: {
          email: "reset@example.com",
          resetToken: "reset-token-456",
          expiresAt,
        },
      };

      await consumer["handlePasswordReset"](event);

      expect(logger.info).toHaveBeenCalledWith(
        "📧 Received PASSWORD_RESET_REQUESTED event",
        {
          email: "reset@example.com",
        }
      );

      expect(rabbitMQService.publishMessage).toHaveBeenCalledWith(
        "password_reset",
        {
          id: expect.stringMatching(/reset_\d+/),
          email: "reset@example.com",
          token: "reset-token-456",
          type: "PASSWORD_RESET",
          data: {
            expiresAt,
          },
          timestamp: expect.any(String),
          requestId: expect.stringMatching(/redis_\d+/),
        }
      );

      expect(logger.info).toHaveBeenCalledWith(
        "✅ Password reset email queued",
        {
          email: "reset@example.com",
        }
      );
    });

    it("should handle RabbitMQ publish errors for password reset", async () => {
      const event: PasswordResetEvent = {
        type: "PASSWORD_RESET_REQUESTED",
        source: "auth-service",
        timestamp: new Date(),
        version: "1.0.0",
        data: {
          email: "reset@example.com",
          resetToken: "reset-token-456",
          expiresAt: new Date(),
        },
      };

      const publishError = new Error("RabbitMQ error");
      vi.mocked(rabbitMQService.publishMessage).mockRejectedValueOnce(
        publishError
      );

      await consumer["handlePasswordReset"](event);

      expect(logger.error).toHaveBeenCalledWith(
        "Error stopping Redis event consumer:",
        publishError
      );
    });
  });

  describe("stop", () => {
    it("should stop the consumer successfully", async () => {
      await consumer.start(); // First start it
      await consumer.stop();

      expect(logger.info).toHaveBeenCalledWith("Redis event consumer stopped");
    });

    it("should set isRunning to false", async () => {
      await consumer.start();
      expect(consumer["isRunning"]).toBe(true);

      await consumer.stop();
      expect(consumer["isRunning"]).toBe(false);
    });
  });

  describe("singleton instance", () => {
    it("should export a singleton instance", () => {
      expect(redisEventConsumer).toBeInstanceOf(RedisEventConsumer);
    });

    it("should have start and stop methods", () => {
      expect(typeof redisEventConsumer.start).toBe("function");
      expect(typeof redisEventConsumer.stop).toBe("function");
    });
  });
});
