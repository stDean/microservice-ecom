import { describe, it, expect, beforeEach, afterEach, vi, Mock } from "vitest";
import amqp from "amqplib";
import { rabbitMQService } from "../../src/config/rabbitmq";
import { logger } from "../../src/config/logger";

vi.mock("amqplib");
vi.mock("../../src/config/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("RabbitMQService", () => {
  let mockConnection: any;
  let mockChannel: any;

  beforeEach(() => {
    // Reset the singleton instance state
    (rabbitMQService as any).connection = null;
    (rabbitMQService as any).channel = null;
    (rabbitMQService as any).isConnecting = false;

    // Create mock objects
    mockChannel = {
      assertExchange: vi.fn().mockResolvedValue(undefined),
      assertQueue: vi.fn().mockResolvedValue(undefined),
      bindQueue: vi.fn().mockResolvedValue(undefined),
      publish: vi.fn().mockReturnValue(true),
      consume: vi.fn().mockImplementation((queue, callback) => {
        // Simulate message consumption
        setTimeout(() => {
          const mockMsg = {
            content: Buffer.from(
              JSON.stringify({
                id: "123",
                email: "test@example.com",
                token: "abc123",
              })
            ),
          };
          callback(mockMsg);
        }, 10);
      }),
      ack: vi.fn(),
      nack: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };

    mockConnection = {
      createChannel: vi.fn().mockResolvedValue(mockChannel),
      close: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
    };

    (amqp.connect as Mock).mockResolvedValue(mockConnection);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("connect", () => {
    it("should establish connection and set up queues successfully", async () => {
      await rabbitMQService.connect();

      expect(amqp.connect).toHaveBeenCalledWith("amqp://localhost:5672");
      expect(mockConnection.createChannel).toHaveBeenCalled();
      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        "notifications",
        "direct",
        { durable: true }
      );
      expect(mockChannel.assertQueue).toHaveBeenCalledWith(
        "email_verification",
        { durable: true }
      );
      expect(mockChannel.assertQueue).toHaveBeenCalledWith("password_reset", {
        durable: true,
      });
      expect(mockChannel.bindQueue).toHaveBeenCalledWith(
        "email_verification",
        "notifications",
        "verification"
      );
      expect(mockChannel.bindQueue).toHaveBeenCalledWith(
        "password_reset",
        "notifications",
        "password_reset"
      );
      expect(mockConnection.on).toHaveBeenCalledWith(
        "close",
        expect.any(Function)
      );
      expect(mockConnection.on).toHaveBeenCalledWith(
        "error",
        expect.any(Function)
      );
    });

    it("should not connect if already connecting", async () => {
      (rabbitMQService as any).isConnecting = true;

      await rabbitMQService.connect();

      expect(amqp.connect).not.toHaveBeenCalled();
    });

    it("should not connect if already connected", async () => {
      (rabbitMQService as any).connection = mockConnection;
      (rabbitMQService as any).channel = mockChannel;

      await rabbitMQService.connect();

      expect(amqp.connect).not.toHaveBeenCalled();
    });

    it("should handle connection errors", async () => {
      const connectError = new Error("Connection failed");
      (amqp.connect as Mock).mockRejectedValue(connectError);

      await expect(rabbitMQService.connect()).rejects.toThrow(
        "Connection failed"
      );
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to connect to RabbitMQ:",
        connectError
      );
    });

    it("should set up connection event handlers", async () => {
      await rabbitMQService.connect();

      // Get the close handler
      const closeCall = mockConnection.on.mock.calls.find(
        (call: any[]) => call[0] === "close"
      );
      expect(closeCall).toBeDefined();
      const closeHandler = closeCall[1];

      // Test close handler
      closeHandler();
      expect((rabbitMQService as any).connection).toBeNull();
      expect((rabbitMQService as any).channel).toBeNull();
      expect((rabbitMQService as any).isConnecting).toBe(false);

      // Get the error handler
      const errorCall = mockConnection.on.mock.calls.find(
        (call: any[]) => call[0] === "error"
      );
      expect(errorCall).toBeDefined();
      const errorHandler = errorCall[1];

      // Test error handler
      const testError = new Error("Test error");
      errorHandler(testError);
      expect((rabbitMQService as any).connection).toBeNull();
      expect((rabbitMQService as any).channel).toBeNull();
      expect((rabbitMQService as any).isConnecting).toBe(false);
    });
  });

  describe("publishMessage", () => {
    it("should publish message successfully", async () => {
      (rabbitMQService as any).channel = mockChannel;

      const message = {
        id: "123",
        email: "test@example.com",
        token: "abc123",
      };
      const result = await rabbitMQService.publishMessage(
        "verification",
        message
      );

      expect(mockChannel.publish).toHaveBeenCalledWith(
        "notifications",
        "verification",
        Buffer.from(JSON.stringify(message)),
        { persistent: true }
      );
      expect(result).toBe(true);
      expect(logger.debug).toHaveBeenCalledWith(
        "Message published to RabbitMQ",
        {
          routingKey: "verification",
          messageId: "123",
        }
      );
    });

    it("should connect automatically if not connected", async () => {
      const message = {
        id: "123",
        email: "test@example.com",
        token: "abc123",
      };

      await rabbitMQService.publishMessage("verification", message);

      expect(amqp.connect).toHaveBeenCalled();
      expect(mockChannel.publish).toHaveBeenCalled();
    });

    it("should handle backpressure when publish returns false", async () => {
      (rabbitMQService as any).channel = mockChannel;
      mockChannel.publish.mockReturnValue(false); // Simulate backpressure

      const message = {
        id: "123",
        email: "test@example.com",
        token: "abc123",
      };
      const result = await rabbitMQService.publishMessage(
        "verification",
        message
      );

      expect(result).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        "Message not published to RabbitMQ (backpressure)",
        { routingKey: "verification" }
      );
    });

    it("should throw error when channel is not available after connection attempt", async () => {
      const failingMockChannel = {
        assertExchange: vi
          .fn()
          .mockRejectedValue(new Error("Channel setup failed")),
      };

      const tempMockConnection = {
        createChannel: vi.fn().mockResolvedValue(failingMockChannel),
        on: vi.fn(),
      };

      (amqp.connect as Mock).mockResolvedValueOnce(tempMockConnection);

      const message = {
        id: "123",
        email: "test@example.com",
        token: "abc123",
      };

      // This should throw because channel setup failed during connect()
      await expect(
        rabbitMQService.publishMessage("verification", message)
      ).rejects.toThrow();
    });

    it("should handle publish errors gracefully", async () => {
      (rabbitMQService as any).channel = mockChannel;
      const publishError = new Error("Publish failed");
      mockChannel.publish.mockImplementation(() => {
        throw publishError;
      });

      const message = {
        id: "123",
        email: "test@example.com",
        token: "abc123",
      };

      await expect(
        rabbitMQService.publishMessage("verification", message)
      ).rejects.toThrow("Publish failed");

      expect(logger.error).toHaveBeenCalledWith(
        "Error publishing message to RabbitMQ:",
        publishError
      );
    });
  });

  describe("consumeMessages", () => {
    it("should start consuming messages successfully and process them", async () => {
      (rabbitMQService as any).channel = mockChannel;
      const mockCallback = vi.fn().mockResolvedValue(undefined);

      await rabbitMQService.consumeMessages("email_verification", mockCallback);

      expect(mockChannel.consume).toHaveBeenCalledWith(
        "email_verification",
        expect.any(Function)
      );
      expect(logger.info).toHaveBeenCalledWith(
        "Started consuming messages from queue: email_verification"
      );

      // Wait for the mock message to be processed
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(mockCallback).toHaveBeenCalledWith({
        id: "123",
        email: "test@example.com",
        token: "abc123",
      });
      expect(mockChannel.ack).toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        "Message processed successfully",
        {
          queue: "email_verification",
          messageId: "123",
        }
      );
    });

    it("should handle message processing errors with nack", async () => {
      (rabbitMQService as any).channel = mockChannel;
      const processingError = new Error("Processing failed");
      const mockCallback = vi.fn().mockRejectedValue(processingError);

      // Override consume to immediately call callback with error
      mockChannel.consume.mockImplementation(
        (queue: string, callback: Function) => {
          const mockMsg = {
            content: Buffer.from(
              JSON.stringify({
                id: "123",
                email: "test@example.com",
                token: "abc123",
              })
            ),
          };
          callback(mockMsg);
        }
      );

      await rabbitMQService.consumeMessages("email_verification", mockCallback);

      expect(mockChannel.nack).toHaveBeenCalledWith(
        expect.anything(),
        false,
        false
      );
      expect(logger.error).toHaveBeenCalledWith(
        "Error processing message from RabbitMQ:",
        {
          error: "Processing failed",
          queue: "email_verification",
          message: '{"id":"123","email":"test@example.com","token":"abc123"}',
        }
      );
    });

    it("should connect automatically if not connected", async () => {
      const mockCallback = vi.fn().mockResolvedValue(undefined);

      await rabbitMQService.consumeMessages("email_verification", mockCallback);

      expect(amqp.connect).toHaveBeenCalled();
      expect(mockChannel.consume).toHaveBeenCalled();
    });

    it("should handle null messages gracefully", async () => {
      (rabbitMQService as any).channel = mockChannel;
      const mockCallback = vi.fn().mockResolvedValue(undefined);

      // Mock consume with null message
      mockChannel.consume.mockImplementation(
        (queue: string, callback: Function) => {
          callback(null); // null message
        }
      );

      await rabbitMQService.consumeMessages("email_verification", mockCallback);

      expect(mockCallback).not.toHaveBeenCalled();
      expect(mockChannel.ack).not.toHaveBeenCalled();
      expect(mockChannel.nack).not.toHaveBeenCalled();
    });

    it("should handle JSON parse errors in messages", async () => {
      (rabbitMQService as any).channel = mockChannel;
      const mockCallback = vi.fn().mockResolvedValue(undefined);

      mockChannel.consume.mockImplementation(
        (queue: string, callback: Function) => {
          const mockMsg = {
            content: Buffer.from("invalid json"), // Invalid JSON
          };
          callback(mockMsg);
        }
      );

      await rabbitMQService.consumeMessages("email_verification", mockCallback);

      expect(mockChannel.nack).toHaveBeenCalledWith(
        expect.anything(),
        false,
        false
      );
      expect(logger.error).toHaveBeenCalledWith(
        "Error processing message from RabbitMQ:",
        expect.any(Object)
      );
    });
  });

  describe("close", () => {
    it("should close connection and channel successfully", async () => {
      (rabbitMQService as any).connection = mockConnection;
      (rabbitMQService as any).channel = mockChannel;

      await rabbitMQService.close();

      expect(mockChannel.close).toHaveBeenCalled();
      expect(mockConnection.close).toHaveBeenCalled();
      expect((rabbitMQService as any).connection).toBeNull();
      expect((rabbitMQService as any).channel).toBeNull();
      expect((rabbitMQService as any).isConnecting).toBe(false);
    });

    it("should handle close when connection is null", async () => {
      (rabbitMQService as any).connection = null;
      (rabbitMQService as any).channel = mockChannel;

      await rabbitMQService.close();

      expect(mockChannel.close).toHaveBeenCalled();
      expect(mockConnection.close).not.toHaveBeenCalled();
    });

    it("should handle close when channel is null", async () => {
      (rabbitMQService as any).connection = mockConnection;
      (rabbitMQService as any).channel = null;

      await rabbitMQService.close();

      expect(mockChannel.close).not.toHaveBeenCalled();
      expect(mockConnection.close).toHaveBeenCalled();
    });

    it("should handle close errors gracefully", async () => {
      (rabbitMQService as any).connection = mockConnection;
      (rabbitMQService as any).channel = mockChannel;

      const closeError = new Error("Close failed");
      mockChannel.close.mockRejectedValue(closeError);

      // Should not throw, just log error
      await rabbitMQService.close();

      expect(logger.error).toHaveBeenCalledWith(
        "Error closing RabbitMQ connection:",
        closeError
      );
    });
  });

  describe("status methods", () => {
    it("isConnected should return correct status", () => {
      // Test when connected
      (rabbitMQService as any).connection = mockConnection;
      (rabbitMQService as any).channel = mockChannel;
      expect(rabbitMQService.isConnected()).toBe(true);

      // Test when channel is null
      (rabbitMQService as any).channel = null;
      expect(rabbitMQService.isConnected()).toBe(false);

      // Test when connection is null
      (rabbitMQService as any).connection = null;
      (rabbitMQService as any).channel = mockChannel;
      expect(rabbitMQService.isConnected()).toBe(false);
    });

    it("getStatus should return complete status information", () => {
      // Test all true
      (rabbitMQService as any).connection = mockConnection;
      (rabbitMQService as any).channel = mockChannel;
      (rabbitMQService as any).isConnecting = false;

      let status = rabbitMQService.getStatus();
      expect(status).toEqual({
        connected: true,
        connecting: false,
        hasConnection: true,
        hasChannel: true,
      });

      // Test all false
      (rabbitMQService as any).connection = null;
      (rabbitMQService as any).channel = null;
      (rabbitMQService as any).isConnecting = true;

      status = rabbitMQService.getStatus();
      expect(status).toEqual({
        connected: false,
        connecting: true,
        hasConnection: false,
        hasChannel: false,
      });
    });
  });

  describe("edge cases", () => {
    it("should handle multiple connection attempts gracefully", async () => {
      const connectPromises = [
        rabbitMQService.connect(),
        rabbitMQService.connect(),
        rabbitMQService.connect(),
      ];

      await Promise.all(connectPromises);

      // Should only connect once
      expect(amqp.connect).toHaveBeenCalledTimes(1);
    });

    it("should recover from connection loss and reconnect on next operation", async () => {
      // First connection
      await rabbitMQService.connect();
      expect(amqp.connect).toHaveBeenCalledTimes(1);

      // Simulate connection loss by manually calling cleanup
      (rabbitMQService as any).cleanup();

      // Set up the second connection mock
      const secondMockChannel = {
        ...mockChannel,
        publish: vi.fn().mockReturnValue(true),
      };
      const secondMockConnection = {
        createChannel: vi.fn().mockResolvedValue(secondMockChannel),
        on: vi.fn(),
      };

      // Mock the second connection attempt
      (amqp.connect as Mock).mockResolvedValueOnce(secondMockConnection);

      // Next operation should reconnect successfully
      await expect(
        rabbitMQService.publishMessage("verification", { id: "123" })
      ).resolves.toBe(true);

      expect(amqp.connect).toHaveBeenCalledTimes(2);
    });

    it("should handle reconnection failure gracefully", async () => {
      // First connection
      await rabbitMQService.connect();
      expect(amqp.connect).toHaveBeenCalledTimes(1);

      // Simulate connection loss
      (rabbitMQService as any).cleanup();

      // Mock reconnection failure
      (amqp.connect as Mock).mockRejectedValueOnce(
        new Error("Reconnection failed")
      );

      // Next operation should throw
      await expect(
        rabbitMQService.publishMessage("verification", { id: "123" })
      ).rejects.toThrow("Reconnection failed");
    });
  });
});
