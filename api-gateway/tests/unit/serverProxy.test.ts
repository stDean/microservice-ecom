import { describe, it, expect, vi, beforeEach } from "vitest";
import { createServiceProxy } from "../../src/middleware/serverProxy";
import {
  recordCircuitBreakerSuccess,
  recordCircuitBreakerFailure,
} from "../../src/middleware/circuitBreaker";
import http from "http";
import https from "https";
import { StatusCodes } from "http-status-codes";

// Mock dependencies
vi.mock("https");
vi.mock("http");
vi.mock("../../src/middleware/circuitBreaker", () => ({
  recordCircuitBreakerSuccess: vi.fn(),
  recordCircuitBreakerFailure: vi.fn(),
}));

// Properly type the mocks
const mockHttpRequest = vi.mocked(http.request);
const mockHttpsRequest = vi.mocked(https.request);

describe("Server Proxy", () => {
  let mockReq: any;
  let mockRes: any;
  let mockProxyReq: any;
  let mockProxyRes: any;

  beforeEach(() => {
    mockProxyReq = {
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
      setHeader: vi.fn(),
    };

    mockProxyRes = {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
      },
      on: vi.fn(),
    };

    mockReq = {
      method: "GET",
      path: "/test",
      requestId: "test-request-id",
      headers: {
        authorization: "Bearer token",
        cookie: "session=abc123; user=test", // Add cookies for testing
      },
      user: {
        id: "user-123",
        email: "test@example.com",
        role: "user",
      },
      rawBody: '{"test": "data"}',
      query: {},
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      send: vi.fn(),
      setHeader: vi.fn(),
      append: vi.fn(), // Add append method for set-cookie headers
      getHeaders: vi.fn().mockReturnValue({}), // Add getHeaders method
      removeHeader: vi.fn(), // Add removeHeader method
    };

    // Clear mocks
    mockHttpRequest.mockClear();
    mockHttpsRequest.mockClear();
    vi.mocked(recordCircuitBreakerSuccess).mockClear();
    vi.mocked(recordCircuitBreakerFailure).mockClear();

    // Setup mock implementation
    mockHttpRequest.mockImplementation(((_options: any, callback?: any) => {
      if (callback && typeof callback === "function") {
        // Store the callback for later invocation in tests
        (mockHttpRequest as any).lastCallback = callback;
      }
      return mockProxyReq as any;
    }) as typeof http.request);

    mockHttpsRequest.mockImplementation(((_options: any, callback?: any) => {
      if (callback && typeof callback === "function") {
        (mockHttpsRequest as any).lastCallback = callback;
      }
      return mockProxyReq as any;
    }) as typeof https.request);
  });

  describe("request forwarding", () => {
    it("should forward GET request with user headers", () => {
      const proxy = createServiceProxy(
        "http://test-service:3000",
        "test-service"
      );
      proxy(mockReq, mockRes);

      expect(mockHttpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          hostname: "test-service",
          port: 3000,
          path: "/api/v1/test-service/test",
          method: "GET",
          headers: expect.objectContaining({
            "X-User-Id": "user-123",
            "X-User-Email": "test@example.com",
            "X-User-Role": "user",
            "X-Request-Id": "test-request-id",
            Cookie: "session=abc123; user=test", // Should forward cookies
          }),
        }),
        expect.any(Function)
      );
    });

    it("should forward POST request with body", () => {
      mockReq.method = "POST";
      mockReq.rawBody = '{"email": "test@example.com", "password": "secret"}';

      const proxy = createServiceProxy(
        "http://test-service:3000",
        "test-service"
      );
      proxy(mockReq, mockRes);

      expect(mockProxyReq.write).toHaveBeenCalledWith(mockReq.rawBody);
      expect(mockProxyReq.end).toHaveBeenCalled();
    });

    it("should use parsed body when rawBody is missing", () => {
      mockReq.method = "POST";
      mockReq.rawBody = undefined;
      mockReq.body = { email: "test@example.com", password: "secret" };

      const proxy = createServiceProxy(
        "http://test-service:3000",
        "test-service"
      );
      proxy(mockReq, mockRes);

      const expectedBody = JSON.stringify(mockReq.body);
      expect(mockProxyReq.write).toHaveBeenCalledWith(expectedBody);
    });

    it("should forward cookies from client to target service", () => {
      const proxy = createServiceProxy(
        "http://test-service:3000",
        "test-service"
      );
      proxy(mockReq, mockRes);

      expect(mockHttpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            Cookie: "session=abc123; user=test",
          }),
        }),
        expect.any(Function)
      );
    });

    it("should handle requests without cookies", () => {
      mockReq.headers.cookie = undefined;

      const proxy = createServiceProxy(
        "http://test-service:3000",
        "test-service"
      );
      proxy(mockReq, mockRes);

      expect(mockHttpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            Cookie: "",
          }),
        }),
        expect.any(Function)
      );
    });
  });

  describe("response handling", () => {
    it("should forward successful response and record success", () => {
      const proxy = createServiceProxy(
        "http://test-service:3000",
        "test-service"
      );
      proxy(mockReq, mockRes);

      // Get the callback that was passed to http.request
      const callback = (mockHttpRequest as any).lastCallback;
      expect(callback).toBeDefined();

      // Invoke the callback with mock response
      callback(mockProxyRes);

      // Simulate response data events
      const dataCallbacks = mockProxyRes.on.mock.calls
        .filter(([event]: [string]) => event === "data")
        .map(([_event, cb]) => cb);

      const endCallbacks = mockProxyRes.on.mock.calls
        .filter(([event]: [string]) => event === "end")
        .map(([_event, cb]) => cb);

      // Simulate receiving data
      dataCallbacks.forEach((cb: any) => cb('{"message": "success"}'));

      // Simulate response end
      endCallbacks.forEach((cb: any) => cb());

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith('{"message": "success"}');
      expect(recordCircuitBreakerSuccess).toHaveBeenCalledWith("test-service");
    });

    it("should handle set-cookie headers as arrays", () => {
      // Mock response with set-cookie array
      mockProxyRes.headers = {
        "content-type": "application/json",
        "set-cookie": ["session=abc123; Path=/; HttpOnly", "user=test; Path=/"],
      };

      const proxy = createServiceProxy(
        "http://test-service:3000",
        "test-service"
      );
      proxy(mockReq, mockRes);

      const callback = (mockHttpRequest as any).lastCallback;
      callback(mockProxyRes);

      const endCallbacks = mockProxyRes.on.mock.calls
        .filter(([event]: [string]) => event === "end")
        .map(([_event, cb]) => cb);

      // Simulate response end
      endCallbacks.forEach((cb: any) => cb());

      // Should use append for each cookie in the array
      expect(mockRes.append).toHaveBeenCalledWith(
        "set-cookie",
        "session=abc123; Path=/; HttpOnly"
      );
      expect(mockRes.append).toHaveBeenCalledWith(
        "set-cookie",
        "user=test; Path=/"
      );
    });

    it("should handle set-cookie headers as single string", () => {
      // Mock response with single set-cookie string
      mockProxyRes.headers = {
        "content-type": "application/json",
        "set-cookie": "session=abc123; Path=/; HttpOnly",
      };

      const proxy = createServiceProxy(
        "http://test-service:3000",
        "test-service"
      );
      proxy(mockReq, mockRes);

      const callback = (mockHttpRequest as any).lastCallback;
      callback(mockProxyRes);

      const endCallbacks = mockProxyRes.on.mock.calls
        .filter(([event]: [string]) => event === "end")
        .map(([_event, cb]) => cb);

      // Simulate response end
      endCallbacks.forEach((cb: any) => cb());

      // Should set the header directly for single string
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        "set-cookie",
        "session=abc123; Path=/; HttpOnly"
      );
    });

    it("should forward all response headers correctly", () => {
      mockProxyRes.headers = {
        "content-type": "application/json",
        "x-custom-header": "custom-value",
        "cache-control": "no-cache",
      };

      const proxy = createServiceProxy(
        "http://test-service:3000",
        "test-service"
      );
      proxy(mockReq, mockRes);

      const callback = (mockHttpRequest as any).lastCallback;
      callback(mockProxyRes);

      const endCallbacks = mockProxyRes.on.mock.calls
        .filter(([event]: [string]) => event === "end")
        .map(([_event, cb]) => cb);

      endCallbacks.forEach((cb: any) => cb());

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        "content-type",
        "application/json"
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        "x-custom-header",
        "custom-value"
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        "cache-control",
        "no-cache"
      );
    });

    it("should record failure on 5xx response", () => {
      mockProxyRes.statusCode = 503;

      const proxy = createServiceProxy(
        "http://test-service:3000",
        "test-service"
      );
      proxy(mockReq, mockRes);

      const callback = (mockHttpRequest as any).lastCallback;
      callback(mockProxyRes);

      const endCallbacks = mockProxyRes.on.mock.calls
        .filter(([event]: [string]) => event === "end")
        .map(([_event, cb]) => cb);

      endCallbacks.forEach((cb: any) => cb());

      expect(recordCircuitBreakerSuccess).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should handle proxy request errors", () => {
      const proxy = createServiceProxy(
        "http://test-service:3000",
        "test-service"
      );
      proxy(mockReq, mockRes);

      // Get error callback
      const errorCallbacks = mockProxyReq.on.mock.calls
        .filter(([event]: [string]) => event === "error")
        .map(([_event, cb]) => cb);

      // Simulate error
      errorCallbacks.forEach((cb: any) => cb(new Error("Connection failed")));

      expect(mockRes.status).toHaveBeenCalledWith(
        StatusCodes.SERVICE_UNAVAILABLE
      );
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Service temporarily unavailable",
        correlationId: "test-request-id",
        service: "test-service",
      });
      expect(recordCircuitBreakerFailure).toHaveBeenCalledWith("test-service");
    });
  });

  describe("user context", () => {
    it("should handle requests without user context", () => {
      mockReq.user = undefined;

      const proxy = createServiceProxy(
        "http://test-service:3000",
        "test-service"
      );
      proxy(mockReq, mockRes);

      expect(mockHttpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-User-Id": "",
            "X-User-Email": "",
            "X-User-Role": "",
          }),
        }),
        expect.any(Function)
      );
    });
  });

  describe("HTTPS services", () => {
    it("should use https for HTTPS URLs", () => {
      const proxy = createServiceProxy(
        "https://secure-service:3000",
        "secure-service"
      );
      proxy(mockReq, mockRes);

      expect(mockHttpsRequest).toHaveBeenCalled();
      expect(mockHttpRequest).not.toHaveBeenCalled();
    });
  });

  describe("URL construction", () => {
    it("should handle query parameters correctly", () => {
      mockReq.query = { page: "1", limit: "10", search: "test" };

      const proxy = createServiceProxy(
        "http://test-service:3000",
        "test-service"
      );
      proxy(mockReq, mockRes);

      expect(mockHttpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.stringContaining("page=1&limit=10&search=test"),
        }),
        expect.any(Function)
      );
    });

    it("should handle root path correctly", () => {
      mockReq.path = "/";

      const proxy = createServiceProxy(
        "http://test-service:3000",
        "test-service"
      );
      proxy(mockReq, mockRes);

      expect(mockHttpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/api/v1/test-service",
        }),
        expect.any(Function)
      );
    });
  });
});
