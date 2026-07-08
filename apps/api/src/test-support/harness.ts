import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";

/**
 * Shared helpers for API-layer tests (docs/06): a real app via fastify.inject,
 * cookie-based auth, and a poller for the async ingestion pipeline. TEST_MODE
 * fakes keep every path offline — no network, no keys.
 */
export async function makeApp(): Promise<FastifyInstance> {
  const app = await buildApp();
  await app.ready();
  return app;
}

export function cookieFrom(headers: Record<string, unknown>): string {
  const raw = headers["set-cookie"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return String(value).split(";")[0]!; // "token=…"
}

/** Register a fresh user and return its auth cookie. */
export async function registerUser(
  app: FastifyInstance,
  email = `user-${Date.now()}-${Math.round(performance.now())}@test.dev`,
): Promise<{ cookie: string; email: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email, password: "password123" },
  });
  if (res.statusCode !== 201) {
    throw new Error(`register failed: ${res.statusCode} ${res.body}`);
  }
  return { cookie: cookieFrom(res.headers), email };
}

/** Submit pasted text and poll until it reaches a terminal status. */
export async function ingestPaste(
  app: FastifyInstance,
  cookie: string,
  text: string,
  title: string,
): Promise<{ id: string; status: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/documents",
    headers: { cookie },
    payload: { text, title },
  });
  const id = res.json<{ documents: { id: string }[] }>().documents[0]!.id;
  return { id, status: await waitForStatus(app, cookie, id) };
}

export async function waitForStatus(
  app: FastifyInstance,
  cookie: string,
  id: string,
  timeoutMs = 15_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await app.inject({ method: "GET", url: `/api/v1/documents/${id}`, headers: { cookie } });
    const status = res.json<{ document: { status: string } }>().document.status;
    if (status !== "processing" || Date.now() > deadline) return status;
    await new Promise((r) => setTimeout(r, 50));
  }
}
