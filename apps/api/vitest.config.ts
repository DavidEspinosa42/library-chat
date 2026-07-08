import { defineConfig } from "vitest/config";

/**
 * API test run (docs/06): TEST_MODE fakes (no network, no keys) against the
 * dedicated test database created by docker/db-init. These values are set
 * before any test file imports config/env.ts — real env vars still win.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://librarychat:librarychat@localhost:5432/librarychat_test";

export default defineConfig({
  test: {
    env: {
      NODE_ENV: "test",
      TEST_MODE: "1",
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_SECRET: "test-secret-not-for-production",
      // High enough that suites never trip it; the rate-limit test overrides it.
      RATE_LIMIT_MAX: "10000",
    },
    globalSetup: "./vitest.global-setup.ts",
  },
});
