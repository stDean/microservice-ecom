import { describe, it, expect, vi, beforeEach, afterEach, Mock } from "vitest";
import { createClient, RedisClientType } from "redis";
import RedisService from "../../src/events/client";

// Mock redis
vi.mock("redis", () => {
  const mockClient = {
    on: vi.fn(),
    isOpen: false,
    connect: vi.fn().mockResolvedValue(undefined),
    duplicate: vi.fn(),
    destroy: vi.fn().mockResolvedValue(undefined),
  };

  const mockSubscriber = {
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
  };

  mockClient.duplicate.mockReturnValue(mockSubscriber);

  return {
    createClient: vi.fn(() => mockClient),
  };
});

describe("RedisService", () => {
  let redisService: RedisService;
  let mockClient: any;
  let mockSubscriber: any;

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

    mockSubscriber = {
      on: vi.fn(),
      connect: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
    };

    mockClient.duplicate.mockReturnValue(mockSubscriber);
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
    it("should set up event listeners for client and subscriber", () => {
      expect(mockClient.on).toHaveBeenCalledWith("error", expect.any(Function));
      expect(mockSubscriber.on).toHaveBeenCalledWith(
        "error",
        expect.any(Function)
      );
    });

    it("should duplicate client for subscriber", () => {
      expect(mockClient.duplicate).toHaveBeenCalled();
    });
  });

  describe("connect", () => {
    it("should connect both client and subscriber when not open", async () => {
      mockClient.isOpen = false;

      await redisService.connect();

      expect(mockClient.connect).toHaveBeenCalled();
      expect(mockSubscriber.connect).toHaveBeenCalled();
    });

    it("should not connect when client is already open", async () => {
      mockClient.isOpen = true;

      await redisService.connect();

      expect(mockClient.connect).not.toHaveBeenCalled();
      expect(mockSubscriber.connect).not.toHaveBeenCalled();
    });

    it("should handle connection errors", async () => {
      const connectError = new Error("Connection failed");
      mockClient.connect.mockRejectedValue(connectError);

      await expect(redisService.connect()).rejects.toThrow("Connection failed");
    });
  });

  describe("subscribe", () => {
    beforeEach(async () => {
      mockClient.isOpen = true;
    });

    it("should subscribe to channel with message parsing", async () => {
      const channel = "test-channel";
      const callback = vi.fn();
      const message = JSON.stringify({ event: "test", data: { id: 1 } });

      await redisService.subscribe(channel, callback);

      // Simulate message received
      const subscribeHandler = mockSubscriber.subscribe.mock.calls[0][1];
      subscribeHandler(message);

      expect(mockSubscriber.subscribe).toHaveBeenCalledWith(
        channel,
        expect.any(Function)
      );
      expect(callback).toHaveBeenCalledWith({ event: "test", data: { id: 1 } });
    });

    it("should handle JSON parse errors", async () => {
      const channel = "test-channel";
      const callback = vi.fn();
      const consoleSpy = vi.spyOn(console, "error");

      await redisService.subscribe(channel, callback);

      // Simulate invalid JSON message
      const subscribeHandler = mockSubscriber.subscribe.mock.calls[0][1];
      subscribeHandler("invalid-json");

      expect(consoleSpy).toHaveBeenCalledWith(
        "Error parsing message:",
        expect.any(Error)
      );
      expect(callback).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should handle subscribe errors", async () => {
      const subscribeError = new Error("Subscribe failed");
      mockSubscriber.subscribe.mockRejectedValue(subscribeError);

      await expect(
        redisService.subscribe("test-channel", vi.fn())
      ).rejects.toThrow("Subscribe failed");
    });
  });

  describe("unsubscribe", () => {
    it("should unsubscribe from channel", async () => {
      const channel = "test-channel";

      await redisService.unsubscribe(channel);

      expect(mockSubscriber.unsubscribe).toHaveBeenCalledWith(channel);
    });

    it("should handle unsubscribe errors", async () => {
      const unsubscribeError = new Error("Unsubscribe failed");
      mockSubscriber.unsubscribe.mockRejectedValue(unsubscribeError);

      await expect(redisService.unsubscribe("test-channel")).rejects.toThrow(
        "Unsubscribe failed"
      );
    });
  });

  describe("disconnect", () => {
    it("should destroy subscriber and client", async () => {
      await redisService.disconnect();

      expect(mockSubscriber.destroy).toHaveBeenCalled();
      expect(mockClient.destroy).toHaveBeenCalled();
    });
  });
});
