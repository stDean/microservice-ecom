import { describe, it, expect, vi, beforeEach, afterEach, Mock } from "vitest";
import { emailService } from "../../src/service/emailService";
import { sendMail } from "../../src/config/mailer";
import { logger } from "../../src/config/logger";
import { emailTemplates } from "../../src/templates/emailTemplates";

// Mock dependencies - KEEP THESE IN YOUR TEST FILE
vi.mock("../../src/config/mailer", () => ({
  sendMail: vi.fn(),
}));

vi.mock("../../src/config/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../src/templates/emailTemplates", () => ({
  emailTemplates: {
    verification: vi.fn(),
    passwordReset: vi.fn(),
  },
}));

const mockedSendMail = sendMail as Mock;
const mockedLogger = logger as typeof logger & {
  info: Mock;
  warn: Mock;
  error: Mock;
};

describe("EmailService", () => {
  const mockVerificationToken = "test-verification-token";
  const mockResetToken = "test-reset-token";
  const testEmail = "test@example.com";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Setup environment variables
    process.env.FRONTEND_URL = "https://example.com";
    process.env.MAIL_FROM = "test@ecommerce.com";

    // Mock email templates - these will work now because the mocks are properly set up
    (emailTemplates.verification as Mock).mockReturnValue(
      "<div>Verification Template</div>"
    );
    (emailTemplates.passwordReset as Mock).mockReturnValue(
      "<div>Reset Template</div>"
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.FRONTEND_URL;
    delete process.env.MAIL_FROM;
  });

  describe("retry mechanism", () => {
    it("should retry 3 times with exponential backoff when email sending fails", async () => {
      const mockError = new Error("Temporary network error");
      let callCount = 0;
      mockedSendMail.mockImplementation(() => {
        callCount++;
        return Promise.reject(mockError);
      });

      const emailPromise = emailService.sendVerificationEmail(
        testEmail,
        mockVerificationToken
      );

      await vi.runAllTimersAsync();

      await expect(emailPromise).rejects.toThrow("Temporary network error");

      expect(callCount).toBe(3);
      expect(mockedLogger.warn).toHaveBeenCalledTimes(3);
    });

    it("should succeed on second retry attempt", async () => {
      mockedSendMail
        .mockRejectedValueOnce(new Error("First attempt failed"))
        .mockResolvedValueOnce(true);

      const emailPromise = emailService.sendVerificationEmail(
        testEmail,
        mockVerificationToken
      );

      await vi.runAllTimersAsync();

      await expect(emailPromise).resolves.toBeUndefined();

      expect(mockedSendMail).toHaveBeenCalledTimes(2);
    });
  });

  describe("error handling", () => {
    it("should preserve error stack trace when rethrowing", async () => {
      const originalError = new Error("Original error");

      originalError.stack = "Error: Original error\n at test.js:1:1";

      mockedSendMail.mockRejectedValue(originalError);

      const promise = emailService.sendVerificationEmail(
        testEmail,
        mockVerificationToken
      );

      await vi.advanceTimersByTimeAsync(7000); // Advance through all retries

      await expect(promise).rejects.toThrow("Original error");

      await expect(promise).rejects.toHaveProperty(
        "stack",

        "Error: Original error\n at test.js:1:1"
      );
    });

    it("should handle unexpected error types gracefully", async () => {
      mockedSendMail.mockRejectedValue("String error without stack");

      const promise = emailService.sendVerificationEmail(
        testEmail,
        mockVerificationToken
      );

      await vi.advanceTimersByTimeAsync(7000);

      await expect(promise).rejects.toEqual("String error without stack");
    });
  });

  describe("sendVerificationEmail", () => {
    it("should send verification email successfully", async () => {
      mockedSendMail.mockResolvedValueOnce(true);

      await emailService.sendVerificationEmail(
        testEmail,
        mockVerificationToken
      );

      expect(mockedSendMail).toHaveBeenCalledWith({
        from: '"E-Commerce App" <test@ecommerce.com>',
        to: testEmail,
        subject: "Verify Your E-Commerce Account",
        html: "<div>Verification Template</div>",
      });

      expect(mockedLogger.info).toHaveBeenCalledWith(
        "Verification email sent successfully",
        { email: testEmail }
      );
    });

    it("should use default MAIL_FROM when environment variable is not set", async () => {
      delete process.env.MAIL_FROM;
      mockedSendMail.mockResolvedValueOnce(true);

      await emailService.sendVerificationEmail(
        testEmail,
        mockVerificationToken
      );

      expect(mockedSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '"E-Commerce App" <no-reply@ecommerce.com>',
        })
      );
    });

    it("should throw error when verification email fails after retries", async () => {
      const mockError = new Error("SMTP connection failed");
      mockedSendMail.mockRejectedValue(mockError);

      const emailPromise = emailService.sendVerificationEmail(
        testEmail,
        mockVerificationToken
      );

      await vi.runAllTimersAsync();

      await expect(emailPromise).rejects.toThrow("SMTP connection failed");

      expect(mockedLogger.error).toHaveBeenCalledWith(
        "Failed to send verification email after retries",
        {
          email: testEmail,
          error: "SMTP connection failed",
        }
      );
    });
  });

  describe("sendPasswordResetEmail", () => {
    it("should send password reset email successfully", async () => {
      mockedSendMail.mockResolvedValueOnce(true);

      await emailService.sendPasswordResetEmail(testEmail, mockResetToken);

      expect(mockedSendMail).toHaveBeenCalledWith({
        from: '"E-Commerce App" <test@ecommerce.com>',
        to: testEmail,
        subject: "Reset Your E-Commerce Password",
        html: "<div>Reset Template</div>",
      });

      expect(mockedLogger.info).toHaveBeenCalledWith(
        "Password reset email sent successfully",
        { email: testEmail }
      );
    });

    it("should throw error when password reset email fails after retries", async () => {
      const mockError = new Error("Email quota exceeded");
      mockedSendMail.mockRejectedValue(mockError);

      const emailPromise = emailService.sendPasswordResetEmail(
        testEmail,
        mockResetToken
      );

      await vi.runAllTimersAsync();

      await expect(emailPromise).rejects.toThrow("Email quota exceeded");

      expect(mockedLogger.error).toHaveBeenCalledWith(
        "Failed to send password reset email after retries",
        {
          email: testEmail,
          error: "Email quota exceeded",
        }
      );
    });
  });
});
