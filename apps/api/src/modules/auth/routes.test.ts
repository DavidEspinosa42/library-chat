import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { sql } from "../../db/client.js";
import { cookieFrom, makeApp } from "../../test-support/harness.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await makeApp();
});
afterAll(async () => {
  await app.close();
  await sql.end();
});

const email = () => `auth-${Date.now()}-${Math.round(performance.now())}@test.dev`;

describe("auth routes", () => {
  test("registers a user, sets an httpOnly cookie, returns the user", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: email(), password: "password123" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().user).toMatchObject({ email: expect.any(String), id: expect.any(String) });
    const setCookie = String(res.headers["set-cookie"]);
    expect(setCookie).toContain("token=");
    expect(setCookie.toLowerCase()).toContain("httponly");
  });

  test("rejects a duplicate email with EMAIL_TAKEN", async () => {
    const addr = email();
    await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { email: addr, password: "password123" } });
    const res = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { email: addr, password: "password123" } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("EMAIL_TAKEN");
  });

  test("rejects a too-short password with a VALIDATION envelope", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: email(), password: "short" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION");
  });

  test("logs in with the right password and rejects the wrong one", async () => {
    const addr = email();
    await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { email: addr, password: "password123" } });

    const ok = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: addr, password: "password123" } });
    expect(ok.statusCode).toBe(200);

    const bad = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: addr, password: "wrong-password" } });
    expect(bad.statusCode).toBe(401);
    expect(bad.json().error.code).toBe("INVALID_CREDENTIALS");
  });

  test("guards /api/v1/* without a cookie → 401 UNAUTHORIZED", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/documents" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
  });

  test("logout clears the cookie", async () => {
    const reg = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { email: email(), password: "password123" } });
    const res = await app.inject({ method: "POST", url: "/api/v1/auth/logout", headers: { cookie: cookieFrom(reg.headers) } });
    expect(res.statusCode).toBe(204);
    expect(String(res.headers["set-cookie"])).toContain("token=;");
  });
});
