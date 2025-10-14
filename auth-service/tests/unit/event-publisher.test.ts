import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventPublisher, eventPublisher } from "../../src/events/publisher";

// Define mock functions first
var mockPublish = vi.fn();
var mockConnect = vi.fn();
var mockDisconnect = vi.fn();

// Then mock the RedisService module
vi.mock("../../src/events/client", () => {
  return {
    default: {
      getInstance: vi.fn(() => ({
        publish: mockPublish,
        connect: mockConnect,
        disconnect: mockDisconnect,
      })),
    },
  };
});

// Now import RedisService after the mock is set up
import RedisService from "../../src/events/client";

describe("EventPublisher", () => {
  let eventPublisherInstance: EventPublisher;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset all mock implementations to default success state
    mockPublish.mockResolvedValue(undefined);
    mockConnect.mockResolvedValue(undefined);
    mockDisconnect.mockResolvedValue(undefined);

    eventPublisherInstance = new EventPublisher();
  });

  afterEach(async () => {
    // Access the RedisService instance and call disconnect
    const redisInstance = RedisService.getInstance();
    await redisInstance.disconnect();
  });

  describe("constructor", () => {
    it("should initialize with RedisService instance", () => {
      expect(eventPublisherInstance).toBeInstanceOf(EventPublisher);
      expect(RedisService.getInstance).toHaveBeenCalled();
    });
  });

  describe("publishEvent", () => {
    it("should publish event with correct structure", async () => {
      const testEvent = {
        type: "TEST_EVENT",
        source: "test-service",
        timestamp: new Date("2023-01-01T00:00:00.000Z"),
        version: "1.0.0",
        data: { test: "data" },
      };

      await eventPublisherInstance.publishEvent(testEvent);

      expect(mockPublish).toHaveBeenCalledWith("TEST_EVENT", testEvent);
    });

    it("should log success message on successful publish", async () => {
      const consoleSpy = vi.spyOn(console, "log");
      const testEvent = {
        type: "TEST_EVENT",
        source: "test-service",
        timestamp: new Date(),
        version: "1.0.0",
        data: {},
      };

      await eventPublisherInstance.publishEvent(testEvent);

      expect(consoleSpy).toHaveBeenCalledWith(
        "📢 Published event: TEST_EVENT",
        expect.objectContaining({
          source: "test-service",
          timestamp: expect.any(Date),
        })
      );

      consoleSpy.mockRestore();
    });

    it("should handle publish errors and rethrow", async () => {
      const publishError = new Error("Redis error");
      mockPublish.mockRejectedValueOnce(publishError);
      const consoleSpy = vi.spyOn(console, "error");

      const testEvent = {
        type: "TEST_EVENT",
        source: "test-service",
        timestamp: new Date(),
        version: "1.0.0",
        data: {},
      };

      await expect(
        eventPublisherInstance.publishEvent(testEvent)
      ).rejects.toThrow("Redis error");

      expect(consoleSpy).toHaveBeenCalledWith(
        "❌ Failed to publish event TEST_EVENT:",
        publishError
      );

      consoleSpy.mockRestore();
    });
  });

  describe("publishUserRegistered", () => {
    it("should publish USER_REGISTERED event with correct data", async () => {
      const userData = {
        userId: "123",
        email: "test@example.com",
        name: "Test User",
        verificationToken: "verification-token-123",
      };

      await eventPublisherInstance.publishUserRegistered(userData);

      expect(mockPublish).toHaveBeenCalledWith(
        "USER_REGISTERED",
        expect.objectContaining({
          type: "USER_REGISTERED",
          source: "auth-service",
          version: "1.0.0",
          data: userData,
          timestamp: expect.any(Date),
        })
      );
    });

    it("should handle errors when publishing user registered event", async () => {
      const publishError = new Error("Publish failed");
      mockPublish.mockRejectedValueOnce(publishError);
      const consoleSpy = vi.spyOn(console, "error");

      const userData = {
        userId: "123",
        email: "test@example.com",
        name: "Test User",
        verificationToken: "verification-token-123",
      };

      await expect(
        eventPublisherInstance.publishUserRegistered(userData)
      ).rejects.toThrow("Publish failed");

      expect(consoleSpy).toHaveBeenCalledWith(
        "❌ Failed to publish event USER_REGISTERED:",
        publishError
      );

      consoleSpy.mockRestore();
    });
  });

  describe("publishPasswordReset", () => {
    it("should publish PASSWORD_RESET_REQUESTED event with correct data", async () => {
      const resetData = {
        email: "test@example.com",
        resetToken: "reset-token-123",
        expiresAt: new Date("2023-01-01T00:00:00.000Z"),
      };

      await eventPublisherInstance.publishPasswordReset(resetData);

      expect(mockPublish).toHaveBeenCalledWith(
        "PASSWORD_RESET_REQUESTED",
        expect.objectContaining({
          type: "PASSWORD_RESET_REQUESTED",
          source: "auth-service",
          version: "1.0.0",
          data: resetData,
          timestamp: expect.any(Date),
        })
      );
    });

    it("should handle errors when publishing password reset event", async () => {
      const publishError = new Error("Publish failed");
      mockPublish.mockRejectedValueOnce(publishError);
      const consoleSpy = vi.spyOn(console, "error");

      const resetData = {
        email: "test@example.com",
        resetToken: "reset-token-123",
        expiresAt: new Date("2023-01-01T00:00:00.000Z"),
      };

      await expect(
        eventPublisherInstance.publishPasswordReset(resetData)
      ).rejects.toThrow("Publish failed");

      expect(consoleSpy).toHaveBeenCalledWith(
        "❌ Failed to publish event PASSWORD_RESET_REQUESTED:",
        publishError
      );

      consoleSpy.mockRestore();
    });
  });

  describe("eventPublisher instance", () => {
    it("should export a singleton instance", () => {
      expect(eventPublisher).toBeInstanceOf(EventPublisher);
    });

    it("should have all methods available", () => {
      expect(typeof eventPublisher.publishEvent).toBe("function");
      expect(typeof eventPublisher.publishUserRegistered).toBe("function");
      expect(typeof eventPublisher.publishPasswordReset).toBe("function");
      expect(typeof eventPublisher.publishUserLoggedIn).toBe("function");
    });
  });
});
