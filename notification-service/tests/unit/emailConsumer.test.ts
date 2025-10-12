import { describe, it, expect, beforeEach, afterEach, vi, Mock } from "vitest";
import { logger } from "../../src/config/logger";
import { emailService } from "../../src/service/emailService";
import { emailConsumer } from "../../src/consumers/emailConsumer";
import { rabbitMQService } from "../../src/config/rabbitmq";

vi.mock("../../src/config/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../src/service/emailService");
vi.mock("../../src/config/rabbitmq");

describe("EmailConsumer", () => {
  beforeEach(() => {
    // Reset the singleton instance state
    (emailConsumer as any).isRunning = false;
    (emailConsumer as any).starting = false;

    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Ensure consumer is stopped after each test
    (emailConsumer as any).isRunning = false;
    (emailConsumer as any).starting = false;
  });

  describe("start", () => {
    it("should start consuming from both queues successfully", async () => {
      // Mock rabbitMQService methods
      (rabbitMQService.connect as Mock).mockResolvedValue(undefined);
      (rabbitMQService.consumeMessages as Mock).mockResolvedValue(undefined);

      await emailConsumer.start();

      expect(rabbitMQService.connect).toHaveBeenCalledOnce();
      expect(rabbitMQService.consumeMessages).toHaveBeenCalledTimes(2);

      // Verify verification email consumption setup
      expect(rabbitMQService.consumeMessages).toHaveBeenCalledWith(
        "email_verification",
        expect.any(Function)
      );

      // Verify password reset email consumption setup
      expect(rabbitMQService.consumeMessages).toHaveBeenCalledWith(
        "password_reset",
        expect.any(Function)
      );

      expect(logger.info).toHaveBeenCalledWith(
        "Email consumer started successfully"
      );
      expect((emailConsumer as any).isRunning).toBe(true);
    });

    it("should not start if already running", async () => {
      (emailConsumer as any).isRunning = true;

      await emailConsumer.start();

      expect(logger.warn).toHaveBeenCalledWith(
        "Email consumer is already running"
      );
      expect(rabbitMQService.connect).not.toHaveBeenCalled();
      expect(rabbitMQService.consumeMessages).not.toHaveBeenCalled();
    });

    it("should handle connection errors and retry", async () => {
      const connectError = new Error("Connection failed");
      (rabbitMQService.connect as Mock).mockRejectedValue(connectError);

      // Mock setTimeout to execute immediately
      vi.useFakeTimers();
      const setTimeoutSpy = vi.spyOn(global, "setTimeout");

      const startPromise = emailConsumer.start();

      // Verify initial error handling
      await startPromise; // Wait for the initial start to complete

      expect(logger.error).toHaveBeenCalledWith(
        "Failed to start email consumer:",
        connectError
      );
      expect((emailConsumer as any).isRunning).toBe(false);

      // Verify retry mechanism was set up
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5000);

      // Manually call the setTimeout callback to simulate the retry
      const retryCallback = setTimeoutSpy.mock.calls[0][0];

      // Mock the retry attempt to also fail (so we don't get into infinite loop)
      (rabbitMQService.connect as Mock).mockRejectedValueOnce(
        new Error("Retry failed")
      );

      await retryCallback(); // Execute the retry callback

      // Now the retry message should be logged
      expect(logger.info).toHaveBeenCalledWith(
        "Retrying to start email consumer..."
      );

      // Clean up
      vi.useRealTimers();
      setTimeoutSpy.mockRestore();
    });

    it("should process verification emails correctly", async () => {
      let verificationCallback: Function;

      (rabbitMQService.connect as Mock).mockResolvedValue(undefined);
      (rabbitMQService.consumeMessages as Mock).mockImplementation(
        (queue, callback) => {
          if (queue === "email_verification") {
            verificationCallback = callback;
          }
        }
      );

      await emailConsumer.start();

      // Test the verification email callback
      const testMessage = {
        email: "test@example.com",
        token: "verification-token-123",
      };

      await verificationCallback!(testMessage);

      expect(logger.info).toHaveBeenCalledWith(
        "Processing verification email from queue",
        {
          email: "test@example.com",
        }
      );
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
        "test@example.com",
        "verification-token-123"
      );
    });

    it("should process password reset emails correctly", async () => {
      let passwordResetCallback: Function;

      (rabbitMQService.connect as Mock).mockResolvedValue(undefined);
      (rabbitMQService.consumeMessages as Mock).mockImplementation(
        (queue, callback) => {
          if (queue === "password_reset") {
            passwordResetCallback = callback;
          }
        }
      );

      await emailConsumer.start();

      // Test the password reset email callback
      const testMessage = {
        email: "user@example.com",
        token: "reset-token-456",
      };

      await passwordResetCallback!(testMessage);

      expect(logger.info).toHaveBeenCalledWith(
        "Processing password reset email from queue",
        {
          email: "user@example.com",
        }
      );
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        "user@example.com",
        "reset-token-456"
      );
    });

    it("should handle email service errors gracefully in verification", async () => {
      let verificationCallback: Function;

      (rabbitMQService.connect as Mock).mockResolvedValue(undefined);
      (rabbitMQService.consumeMessages as Mock).mockImplementation(
        (queue, callback) => {
          if (queue === "email_verification") {
            verificationCallback = callback;
          }
        }
      );

      const emailError = new Error("SMTP connection failed");
      (emailService.sendVerificationEmail as Mock).mockRejectedValue(
        emailError
      );

      await emailConsumer.start();

      const testMessage = {
        email: "test@example.com",
        token: "verification-token-123",
      };

      // Should not throw error - it should be handled internally
      await expect(verificationCallback!(testMessage)).resolves.not.toThrow();

      expect(logger.info).toHaveBeenCalledWith(
        "Processing verification email from queue",
        {
          email: "test@example.com",
        }
      );
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
        "test@example.com",
        "verification-token-123"
      );
    });

    it("should handle email service errors gracefully in password reset", async () => {
      let passwordResetCallback: Function;

      (rabbitMQService.connect as Mock).mockResolvedValue(undefined);
      (rabbitMQService.consumeMessages as Mock).mockImplementation(
        (queue, callback) => {
          if (queue === "password_reset") {
            passwordResetCallback = callback;
          }
        }
      );

      const emailError = new Error("SMTP connection failed");
      (emailService.sendPasswordResetEmail as Mock).mockRejectedValue(
        emailError
      );

      await emailConsumer.start();

      const testMessage = {
        email: "user@example.com",
        token: "reset-token-456",
      };

      // Should not throw error - it should be handled internally
      await expect(passwordResetCallback!(testMessage)).resolves.not.toThrow();

      expect(logger.info).toHaveBeenCalledWith(
        "Processing password reset email from queue",
        {
          email: "user@example.com",
        }
      );
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        "user@example.com",
        "reset-token-456"
      );
    });
  });

  describe("stop", () => {
    it("should stop the consumer and close RabbitMQ connection", async () => {
      (emailConsumer as any).isRunning = true;
      (rabbitMQService.close as Mock).mockResolvedValue(undefined);

      await emailConsumer.stop();

      expect((emailConsumer as any).isRunning).toBe(false);
      expect(rabbitMQService.close).toHaveBeenCalledOnce();
      expect(logger.info).toHaveBeenCalledWith("Email consumer stopped");
    });

    it("should handle stop when already stopped", async () => {
      (emailConsumer as any).isRunning = false;

      await emailConsumer.stop();

      expect((emailConsumer as any).isRunning).toBe(false);
      expect(rabbitMQService.close).toHaveBeenCalledOnce();
    });

    it("should handle RabbitMQ close errors gracefully", async () => {
      (emailConsumer as any).isRunning = true;
      const closeError = new Error("Close failed");

      (rabbitMQService.close as Mock).mockRejectedValue(closeError);

      await emailConsumer.stop();

      expect((emailConsumer as any).isRunning).toBe(false);
      expect(rabbitMQService.close).toHaveBeenCalledOnce();
      expect(logger.error).toHaveBeenCalledWith(
        "Error closing RabbitMQ connection:",
        closeError
      );
      expect(logger.info).toHaveBeenCalledWith(
        "Email consumer stopped (with connection error)"
      );
    });
  });

  describe("edge cases", () => {
    it("should handle multiple start calls gracefully", async () => {
      (rabbitMQService.connect as Mock).mockResolvedValue(undefined);
      (rabbitMQService.consumeMessages as Mock).mockResolvedValue(undefined);

      // Call start sequentially, not concurrently
      await emailConsumer.start();
      await emailConsumer.start(); // Second call
      await emailConsumer.start(); // Third call

      // Should only set up once due to the starting flag
      expect(rabbitMQService.connect).toHaveBeenCalledOnce();
      expect(rabbitMQService.consumeMessages).toHaveBeenCalledTimes(2);

      // Verify warning was logged for subsequent calls
      expect(logger.warn).toHaveBeenCalledWith(
        "Email consumer is already running"
      );
      expect(logger.warn).toHaveBeenCalledTimes(2); // Two warnings for the two duplicate calls
    });

    it("should handle retry mechanism correctly on persistent failures", async () => {
      const connectError = new Error("Persistent connection failure");
      (rabbitMQService.connect as Mock).mockRejectedValue(connectError);

      vi.useFakeTimers();
      const setTimeoutSpy = vi.spyOn(global, "setTimeout");

      await emailConsumer.start();

      // Verify initial failure
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to start email consumer:",
        connectError
      );
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5000);

      // Simulate retry
      const retryCallback = setTimeoutSpy.mock.calls[0][0] as Function;

      // Mock the retry attempt
      (rabbitMQService.connect as Mock).mockRejectedValueOnce(
        new Error("Second attempt failed")
      );

      await retryCallback();

      // Should have attempted to start again
      expect(rabbitMQService.connect).toHaveBeenCalledTimes(2);
      expect(logger.info).toHaveBeenCalledWith(
        "Retrying to start email consumer..."
      );

      vi.useRealTimers();
      setTimeoutSpy.mockRestore();
    });
  });
});
