import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventSubscriber, eventSubscriber } from "../../src/events/subscriber";
import RedisService from "../../src/events/client";

// Mock RedisService
var mockSubscribe = vi.fn().mockResolvedValue(undefined);
var mockUnsubscribe = vi.fn().mockResolvedValue(undefined);

vi.mock("../../src/events/client", () => ({
  default: {
    getInstance: vi.fn(() => ({
      subscribe: mockSubscribe,
      unsubscribe: mockUnsubscribe,
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
    })),
  },
}));

describe("EventSubscriber", () => {
  let subscriber: EventSubscriber;

  beforeEach(() => {
    vi.clearAllMocks();
    subscriber = new EventSubscriber();
  });

  describe("constructor", () => {
    it("should initialize with RedisService instance", () => {
      expect(subscriber).toBeInstanceOf(EventSubscriber);
      expect(RedisService.getInstance).toHaveBeenCalled();
    });
  });

  describe("subscribeToEvent", () => {
    it("should subscribe to event with handler", async () => {
      const eventType = "USER_REGISTERED";
      const handler = vi.fn();
      const consoleSpy = vi.spyOn(console, "log");

      await subscriber.subscribeToEvent(eventType, handler);

      expect(mockSubscribe).toHaveBeenCalledWith(eventType, handler);
      expect(consoleSpy).toHaveBeenCalledWith(
        `👂 Subscribed to event: ${eventType}`
      );

      consoleSpy.mockRestore();
    });

    it("should handle subscription errors", async () => {
      const subscribeError = new Error("Subscription failed");
      mockSubscribe.mockRejectedValueOnce(subscribeError);

      await expect(
        subscriber.subscribeToEvent("TEST_EVENT", vi.fn())
      ).rejects.toThrow("Subscription failed");
    });
  });

  describe("unsubscribeFromEvent", () => {
    it("should unsubscribe from event", async () => {
      const eventType = "USER_REGISTERED";
      const consoleSpy = vi.spyOn(console, "log");

      await subscriber.unsubscribeFromEvent(eventType);

      expect(mockUnsubscribe).toHaveBeenCalledWith(eventType);
      expect(consoleSpy).toHaveBeenCalledWith(
        `🚫 Unsubscribed from event: ${eventType}`
      );

      consoleSpy.mockRestore();
    });

    it("should handle unsubscribe errors", async () => {
      const unsubscribeError = new Error("Unsubscribe failed");
      mockUnsubscribe.mockRejectedValueOnce(unsubscribeError);

      await expect(
        subscriber.unsubscribeFromEvent("TEST_EVENT")
      ).rejects.toThrow("Unsubscribe failed");
    });
  });

  describe("singleton instance", () => {
    it("should export a singleton instance", () => {
      expect(eventSubscriber).toBeInstanceOf(EventSubscriber);
    });

    it("should have subscribe and unsubscribe methods", () => {
      expect(typeof eventSubscriber.subscribeToEvent).toBe("function");
      expect(typeof eventSubscriber.unsubscribeFromEvent).toBe("function");
    });
  });
});
