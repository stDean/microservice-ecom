import { afterEach, beforeEach, vi } from "vitest";
import nock from "nock";

// Clean all nock interceptors after each test
afterEach(() => {
  nock.cleanAll();
});

// Global test timeout
beforeEach(() => {
  vi.setConfig({ testTimeout: 10000 });
});
