import { describe, it, expect, vi, beforeEach, afterEach, Mock } from "vitest";
import { createClient, RedisClientType } from "redis";
import RedisService from "../../src/events/client";

vi.mock("redis", () => {
  const mockClient = {
    on: vi.fn(),
    isOpen: false,
    connect: vi.fn().mockResolvedValue(undefined),
    duplicate: vi.fn(),
    destroy: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue(undefined),
  };

  return {
    createClient: vi.fn(() => mockClient),
  };
});

describe("RedisService", () => {
  let redisService: RedisService;
  let mockClient: any;
  let mockPublisher: any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear the singleton instance between tests
    (RedisService as any).instance = undefined;

    mockClient = {
      on: vi.fn(),
      isOpen: false,
      connect: vi.fn().mockResolvedValue(undefined),
      duplicate: vi.fn(),
      destroy: vi.fn().mockResolvedValue(undefined),
    };

    mockPublisher = {
      on: vi.fn(),
      connect: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
      publish: vi.fn().mockResolvedValue(undefined),
    };

    mockClient.duplicate.mockReturnValue(mockPublisher);
    (createClient as Mock).mockReturnValue(mockClient);

    redisService = RedisService.getInstance();
  });

  afterEach(async () => {
    await redisService.disconnect();
  });

  describe("getInstance", () => {
    it("should return singleton instance", () => {
      const instance1 = RedisService.getInstance();
      const instance2 = RedisService.getInstance();

      expect(instance1).toBe(instance2);
      expect(createClient).toHaveBeenCalledTimes(1);
    });

    it("should create client with default URL when REDIS_URL is not set", () => {
      expect(createClient).toHaveBeenCalledWith({
        url: "redis://localhost:6379",
      });
    });

    it("should create client with REDIS_URL from environment", () => {
      process.env.REDIS_URL = "redis://custom:6380";

      // Clear instance and create new one with new env var
      (RedisService as any).instance = undefined;
      RedisService.getInstance();

      expect(createClient).toHaveBeenCalledWith({
        url: "redis://custom:6380",
      });

      delete process.env.REDIS_URL;
    });
  });

  describe("constructor", () => {
    it("should set up event listeners for client and publisher", () => {
      expect(mockClient.on).toHaveBeenCalledWith("error", expect.any(Function));
      expect(mockPublisher.on).toHaveBeenCalledWith(
        "error",
        expect.any(Function)
      );
    });

    it("should duplicate client for publisher", () => {
      expect(mockClient.duplicate).toHaveBeenCalled();
    });
  });

  describe("connect", () => {
    it("should connect both client and publisher when not open", async () => {
      mockClient.isOpen = false;

      await redisService.connect();

      expect(mockClient.connect).toHaveBeenCalled();
      expect(mockPublisher.connect).toHaveBeenCalled();
    });

    it("should not connect when client is already open", async () => {
      mockClient.isOpen = true;

      await redisService.connect();

      expect(mockClient.connect).not.toHaveBeenCalled();
      expect(mockPublisher.connect).not.toHaveBeenCalled();
    });

    it("should handle connection errors", async () => {
      const connectError = new Error("Connection failed");
      mockClient.connect.mockRejectedValue(connectError);

      await expect(redisService.connect()).rejects.toThrow("Connection failed");
    });
  });

  describe("publish", () => {
    beforeEach(async () => {
      mockClient.isOpen = true;
    });

    it("should publish message to channel as JSON string", async () => {
      const channel = "test-channel";
      const message = { event: "test", data: { id: 1 } };

      await redisService.publish(channel, message);

      expect(mockPublisher.publish).toHaveBeenCalledWith(
        channel,
        JSON.stringify(message)
      );
    });

    it("should handle publish errors", async () => {
      const publishError = new Error("Publish failed");
      mockPublisher.publish.mockRejectedValue(publishError);

      await expect(redisService.publish("test-channel", {})).rejects.toThrow(
        "Publish failed"
      );
    });
  });

  describe("disconnect", () => {
    it("should destroy publisher and client", async () => {
      await redisService.disconnect();

      expect(mockPublisher.destroy).toHaveBeenCalled();
      expect(mockClient.destroy).toHaveBeenCalled();
    });
  });
});
