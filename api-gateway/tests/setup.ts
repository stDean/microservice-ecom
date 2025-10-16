import { vi } from "vitest";

// Mock environment variables
process.env.JWT_SECRET = "test-secret";

// Global mocks
vi.mock("../src/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
