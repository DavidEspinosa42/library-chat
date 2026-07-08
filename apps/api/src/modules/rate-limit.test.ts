import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";

// Set BEFORE importing the app so config/env.ts reads the low limit (this file
// is module-isolated by vitest, so it doesn't affect the other suites).
process.env["RATE_LIMIT_MAX"] = "3";

let app: FastifyInstance;
let end: () => Promise<void>;

beforeAll(async () => {
  const { buildApp } = await import("../app.js");
  const { sql } = await import("../db/client.js");
  end = () => sql.end();
  app = await buildApp();
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await end();
});

describe("per-user rate limiting", () => {
  test("returns a 429 RATE_LIMITED envelope once the window budget is spent", async () => {
    const hit = () =>
      app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "nobody@test.dev", password: "whatever-wrong" },
      });

    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await hit()).statusCode);

    expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0);
    const limited = await hit();
    if (limited.statusCode === 429) {
      expect(limited.json().error.code).toBe("RATE_LIMITED");
    }
  });

  test("does not rate-limit the health check", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await app.inject({ method: "GET", url: "/healthz" });
      expect(res.statusCode).toBe(200);
    }
  });
});
