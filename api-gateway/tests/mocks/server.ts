import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

export const server = setupServer(
  // Only mock microservice endpoints, not the gateway itself
  http.get("http://localhost:3001/health", () => {
    return HttpResponse.json({ status: "OK" });
  }),
  http.get("http://localhost:3002/health", () => {
    return HttpResponse.json({ status: "OK" });
  }),
  http.get("http://localhost:3003/health", () => {
    return HttpResponse.json({ status: "OK" });
  }),

  http.post("http://localhost:3001/auth/login", () => {
    return HttpResponse.json({ token: "mock-jwt-token" });
  }),
  http.post("http://localhost:3001/auth/register", () => {
    return HttpResponse.json({ id: "123", email: "test@example.com" });
  }),

  http.get("http://localhost:3002/users/123", () => {
    return HttpResponse.json({ id: "123", name: "Test User" });
  }),

  http.get("http://localhost:3003/products", () => {
    return HttpResponse.json([{ id: "1", name: "Test Product" }]);
  })
);
