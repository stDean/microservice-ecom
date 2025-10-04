import { beforeAll, afterAll, afterEach } from "vitest";
import { server } from "./mocks/server";

// Start mock server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

// Close mock server after all tests
afterAll(() => server.close());

// Reset handlers after each test
afterEach(() => server.resetHandlers());
