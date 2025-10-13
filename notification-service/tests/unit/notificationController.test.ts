import { describe, it, expect, beforeEach, afterEach, vi, Mock } from "vitest";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { logger } from "../../src/config/logger";
import { rabbitMQService } from "../../src/config/rabbitmq";
import { NotificationCtrl } from "../../src/controller/notification.c";

vi.mock("../../src/config/logger");
vi.mock("../../src/config/rabbitmq");

describe("NotificationCtrl", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let responseObject: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Setup response mock
    responseObject = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    mockResponse = {
      status: vi.fn().mockReturnValue(responseObject),
      json: vi.fn().mockReturnValue(responseObject),
    };

    // Default request setup
    mockRequest = {
      body: {},
      headers: {},
    };

    // Mock RabbitMQ service
    (rabbitMQService.publishMessage as Mock).mockResolvedValue(true);
  });

  describe("sendVerificationEmail", () => {
    it("should return 400 when validation fails", async () => {
      mockRequest.body = {
        email: "invalid-email", // Invalid email
        verificationToken: "", // Missing token
      };

      await NotificationCtrl.sendVerificationEmail(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);
      expect(responseObject.json).toHaveBeenCalledWith({
        message: "Invalid request data",
        errors: expect.arrayContaining([
          expect.objectContaining({
            field: "email",
            message: "Invalid email address",
          }),
          expect.objectContaining({
            field: "verificationToken",
            message: "Verification token is required",
          }),
        ]),
      });
      expect(logger.warn).toHaveBeenCalledWith(
        "Email verification request validation failed",
        {
          issues: expect.any(Array),
          body: mockRequest.body,
        }
      );
    });

    it("should queue verification email and return 202 on success", async () => {
      mockRequest.body = {
        email: "test@example.com",
        verificationToken: "verification-token-123",
      };
      mockRequest.headers = { "x-request-id": "test-request-123" };

      await NotificationCtrl.sendVerificationEmail(
        mockRequest as Request,
        mockResponse as Response
      );

      // Verify RabbitMQ call
      expect(rabbitMQService.publishMessage).toHaveBeenCalledWith(
        "verification",
        expect.objectContaining({
          email: "test@example.com",
          token: "verification-token-123",
          requestId: "test-request-123",
        })
      );

      // Verify logging
      expect(logger.info).toHaveBeenCalledWith("Queueing verification email", {
        email: "test@example.com",
      });
      expect(logger.info).toHaveBeenCalledWith(
        "Verification email queued successfully",
        { email: "test@example.com" }
      );

      // Verify response
      expect(mockResponse.status).toHaveBeenCalledWith(StatusCodes.ACCEPTED);
      expect(responseObject.json).toHaveBeenCalledWith({
        message: "Verification email queued for sending.",
        success: true,
        timestamp: expect.any(String),
      });
    });

    it("should generate requestId if not provided in headers", async () => {
      mockRequest.body = {
        email: "test@example.com",
        verificationToken: "verification-token-123",
      };
      mockRequest.headers = {}; // No x-request-id

      await NotificationCtrl.sendVerificationEmail(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(rabbitMQService.publishMessage).toHaveBeenCalledWith(
        "verification",
        expect.objectContaining({
          email: "test@example.com",
          token: "verification-token-123",
          requestId: expect.stringMatching(/^req_\d+$/),
        })
      );
    });

    it("should return 500 when RabbitMQ publishing fails", async () => {
      mockRequest.body = {
        email: "test@example.com",
        verificationToken: "verification-token-123",
      };

      const publishError = new Error("RabbitMQ connection failed");
      (rabbitMQService.publishMessage as Mock).mockRejectedValue(publishError);

      await NotificationCtrl.sendVerificationEmail(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(logger.error).toHaveBeenCalledWith(
        "Error in sendVerificationEmail controller",
        {
          error: "RabbitMQ connection failed",
          stack: expect.any(String),
          body: mockRequest.body,
        }
      );

      expect(mockResponse.status).toHaveBeenCalledWith(
        StatusCodes.INTERNAL_SERVER_ERROR
      );
      expect(responseObject.json).toHaveBeenCalledWith({
        message: "Failed to send verification email.",
      });
    });
  });

  describe("sendPasswordResetEmail", () => {
    it("should return 400 when validation fails", async () => {
      mockRequest.body = {
        email: "invalid-email",
        resetToken: "",
      };

      await NotificationCtrl.sendPasswordResetEmail(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);
      expect(responseObject.json).toHaveBeenCalledWith({
        message: "Invalid request data",
        errors: expect.arrayContaining([
          expect.objectContaining({
            field: "email",
            message: "Invalid email address",
          }),
          expect.objectContaining({
            field: "resetToken",
            message: "Reset token is required",
          }),
        ]),
      });
      expect(logger.warn).toHaveBeenCalledWith(
        "Password reset request validation failed",
        {
          issues: expect.any(Array),
          body: mockRequest.body,
        }
      );
    });

    it("should queue password reset email and return 202 on success", async () => {
      mockRequest.body = {
        email: "user@example.com",
        resetToken: "reset-token-456",
      };
      mockRequest.headers = { "x-request-id": "test-request-456" };

      await NotificationCtrl.sendPasswordResetEmail(
        mockRequest as Request,
        mockResponse as Response
      );

      // Verify RabbitMQ call
      expect(rabbitMQService.publishMessage).toHaveBeenCalledWith(
        "password_reset",
        expect.objectContaining({
          email: "user@example.com",
          token: "reset-token-456",
          requestId: "test-request-456",
        })
      );

      // Verify logging
      expect(logger.info).toHaveBeenCalledWith(
        "Queueing password reset email",
        {
          email: "user@example.com",
        }
      );
      expect(logger.info).toHaveBeenCalledWith(
        "Password reset email queued successfully",
        { email: "user@example.com" }
      );

      // Verify response
      expect(mockResponse.status).toHaveBeenCalledWith(StatusCodes.ACCEPTED);
      expect(responseObject.json).toHaveBeenCalledWith({
        message: "Password reset email queued for sending.",
        success: true,
        timestamp: expect.any(String),
      });
    });

    it("should generate requestId if not provided in headers for password reset", async () => {
      mockRequest.body = {
        email: "user@example.com",
        resetToken: "reset-token-456",
      };
      mockRequest.headers = {};

      await NotificationCtrl.sendPasswordResetEmail(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(rabbitMQService.publishMessage).toHaveBeenCalledWith(
        "password_reset",
        expect.objectContaining({
          email: "user@example.com",
          token: "reset-token-456",
          requestId: expect.stringMatching(/^req_\d+$/),
        })
      );
    });

    it("should return 500 when RabbitMQ publishing fails for password reset", async () => {
      mockRequest.body = {
        email: "user@example.com",
        resetToken: "reset-token-456",
      };

      const publishError = new Error("RabbitMQ connection failed");
      (rabbitMQService.publishMessage as Mock).mockRejectedValue(publishError);

      await NotificationCtrl.sendPasswordResetEmail(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(logger.error).toHaveBeenCalledWith(
        "Error in sendPasswordResetEmail controller",
        {
          error: "RabbitMQ connection failed",
          stack: expect.any(String),
          body: mockRequest.body,
        }
      );

      expect(mockResponse.status).toHaveBeenCalledWith(
        StatusCodes.INTERNAL_SERVER_ERROR
      );
      expect(responseObject.json).toHaveBeenCalledWith({
        message: "Failed to send password reset email.",
      });
    });
  });

  describe("edge cases", () => {
    it("should handle empty request body", async () => {
      mockRequest.body = {};

      await NotificationCtrl.sendVerificationEmail(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);
      expect(responseObject.json).toHaveBeenCalledWith({
        message: "Invalid request data",
        errors: expect.arrayContaining([
          expect.objectContaining({
            field: "email",
          }),
          expect.objectContaining({
            field: "verificationToken",
          }),
        ]),
      });
    });

    it("should handle null request body", async () => {
      mockRequest.body = null;

      await NotificationCtrl.sendVerificationEmail(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);
    });

    it("should handle malformed JSON in request body", async () => {
      mockRequest.body = {
        email: 12345, // Wrong type
        verificationToken: null, // Wrong type
      };

      await NotificationCtrl.sendVerificationEmail(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);
    });
  });
});
