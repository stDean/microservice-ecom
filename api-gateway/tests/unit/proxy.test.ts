import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { Request, Response } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

import {
  createServiceProxy,
  SERVICES,
  checkCircuitBreaker,
  recordCircuitBreakerFailure,
  circuitBreakers,
} from "../../src";

// Mock http-proxy-middleware
vi.mock("http-proxy-middleware", () => ({
  createProxyMiddleware: vi.fn(() => vi.fn()),
}));

describe("Proxy Service Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create proxy middleware with correct configuration", () => {
    const serviceUrl = SERVICES.auth;
    const serviceName = "auth";

    createServiceProxy(serviceUrl, serviceName);

    expect(createProxyMiddleware).toHaveBeenCalledWith({
      target: serviceUrl,
      changeOrigin: true,
      pathRewrite: expect.any(Function), // Updated: now a function instead of object
      onProxyReq: expect.any(Function),
      onProxyRes: expect.any(Function),
      onError: expect.any(Function),
    });
  });

  it("should add request ID and user headers in onProxyReq", () => {
    const serviceUrl = SERVICES.auth;
    const serviceName = "auth";

    createServiceProxy(serviceUrl, serviceName);

    const mockCall = (createProxyMiddleware as Mock).mock.calls[0][0];
    const onProxyReq = mockCall.onProxyReq;

    const proxyReq = {
      setHeader: vi.fn(),
    };

    const req = {
      requestId: "test-request-id",
      user: { id: "user-123", role: "admin" },
      path: "/test",
      method: "GET",
    } as unknown as Request;

    onProxyReq(proxyReq, req);

    expect(proxyReq.setHeader).toHaveBeenCalledWith(
      "X-Request-Id",
      "test-request-id"
    );
    expect(proxyReq.setHeader).toHaveBeenCalledWith("X-User-Id", "user-123");
    expect(proxyReq.setHeader).toHaveBeenCalledWith("X-User-Role", "admin");
  });

  it("should handle proxy errors with circuit breaker", () => {
    const serviceUrl = SERVICES.auth;
    const serviceName = "auth";

    createServiceProxy(serviceUrl, serviceName);

    const mockCall = (createProxyMiddleware as Mock).mock.calls[0][0];
    const onError = mockCall.onError;

    const mockError = new Error("Proxy error");
    const req = {
      requestId: "test-request-id",
      path: "/test",
    } as unknown as Request;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;

    // Mock circuit breaker functions using vi.spyOn
    const recordFailureSpy = vi
      .spyOn({ recordCircuitBreakerFailure }, "recordCircuitBreakerFailure")
      .mockImplementation(() => {});
    const checkCircuitSpy = vi
      .spyOn({ checkCircuitBreaker }, "checkCircuitBreaker")
      .mockReturnValue(true);

    onError(mockError, req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: "Service temporarily unavailable",
      correlationId: "test-request-id",
      service: "auth",
    });

    // Clean up
    recordFailureSpy.mockRestore();
    checkCircuitSpy.mockRestore();
  });

  it("should return circuit breaker message when circuit is open", () => {
    const serviceUrl = SERVICES.auth;
    const serviceName = "auth";

    createServiceProxy(serviceUrl, serviceName);

    const mockCall = (createProxyMiddleware as Mock).mock.calls[0][0];
    const onError = mockCall.onError;

    const mockError = new Error("Proxy error");
    const req = {
      requestId: "test-request-id",
      path: "/test",
    } as unknown as Request;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;

    // Mock circuit breaker to return false (circuit open)
    const checkCircuitSpy = vi
      .spyOn({ checkCircuitBreaker }, "checkCircuitBreaker")
      .mockReturnValue(false);

    onError(mockError, req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      correlationId: "test-request-id",
      details: undefined,
      error: "Service temporarily unavailable",
      service: "auth",
    });

    // Clean up
    checkCircuitSpy.mockRestore();
  });

  it("should correctly rewrite paths", () => {
    const serviceUrl = SERVICES.auth;
    const serviceName = "auth";

    createServiceProxy(serviceUrl, serviceName);

    const mockCall = (createProxyMiddleware as Mock).mock.calls[0][0];
    const pathRewrite = mockCall.pathRewrite;

    // Test path rewriting
    const result = pathRewrite("/health", {});
    expect(result).toBe("/api/v1/auth/health");
  });
});
