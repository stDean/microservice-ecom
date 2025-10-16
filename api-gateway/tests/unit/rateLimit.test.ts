import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRateLimit } from "../../src/middleware/rateLimiter";
import request from "supertest";
import express from "express";

describe("Rate Limiter", () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should allow requests within limit", async () => {
    const rateLimit = createRateLimit(1000, 2); // 2 requests per second
    app.use("/test", rateLimit);
    app.get("/test", (req, res) => res.json({ message: "success" }));

    // First request
    await request(app).get("/test").expect(200);
    // Second request
    await request(app).get("/test").expect(200);
  });

  it("should block requests over the limit", async () => {
    vi.useFakeTimers();

    const rateLimit = createRateLimit(1000, 1); // 1 request per second
    app.use("/test", rateLimit);
    app.get("/test", (req, res) => res.json({ message: "success" }));

    // First request - should succeed
    await request(app).get("/test").expect(200);
    // Second request - should be blocked
    const response = await request(app).get("/test").expect(429);

    expect(response.body).toMatchObject({
      error: expect.stringContaining("Too many requests"),
    });
  });

  it("should include retry after information", async () => {
    const rateLimit = createRateLimit(5000, 1); // 1 request per 5 seconds
    app.use("/test", rateLimit);
    app.get("/test", (req, res) => res.json({ message: "success" }));

    // First request
    await request(app).get("/test").expect(200);
    // Second request (over limit)
    const response = await request(app).get("/test").expect(429);

    expect(response.body.retryAfter).toContain("seconds");
  });

  it("should use standard headers", async () => {
    const rateLimit = createRateLimit(1000, 1);
    app.use("/test", rateLimit);
    app.get("/test", (req, res) => res.json({ message: "success" }));

    const response = await request(app).get("/test");

    // Should have rate limit headers
    expect(response.headers["ratelimit-limit"]).toBeDefined();
    expect(response.headers["ratelimit-remaining"]).toBeDefined();
  });
});
