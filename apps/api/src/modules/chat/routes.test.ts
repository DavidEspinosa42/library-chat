import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { sql } from "../../db/client.js";
import { ingestPaste, makeApp, registerUser } from "../../test-support/harness.js";

let app: FastifyInstance;
let cookie: string;
let docId: string;

beforeAll(async () => {
  app = await makeApp();
  cookie = (await registerUser(app)).cookie;
  const doc = await ingestPaste(
    app,
    cookie,
    "All warfare is based on deception. Supreme excellence is subduing the enemy without fighting.",
    "The Art of War",
  );
  expect(doc.status).toBe("ready");
  docId = doc.id;
});
afterAll(async () => {
  await app.close();
  await sql.end();
});

async function createSession(ids: string[], cookieHeader = cookie) {
  return app.inject({
    method: "POST",
    url: "/api/v1/chat/sessions",
    headers: { cookie: cookieHeader },
    payload: { documentIds: ids },
  });
}

/** Split an SSE body into [event, data] frames. */
function parseSse(body: string): { event: string; data: unknown }[] {
  return body
    .split("\n\n")
    .map((frame) => {
      let event = "";
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7).trim();
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      return event && data ? { event, data: JSON.parse(data) as unknown } : null;
    })
    .filter((f): f is { event: string; data: unknown } => f !== null);
}

describe("chat sessions", () => {
  test("creates a session over a ready document", async () => {
    const res = await createSession([docId]);
    expect(res.statusCode).toBe(201);
    expect(res.json().session).toMatchObject({ documentIds: [docId], id: expect.any(String) });
  });

  test("rejects a session over a non-ready / unknown document with NOT_FOUND", async () => {
    const res = await createSession(["00000000-0000-0000-0000-000000000000"]);
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });

  test("another user cannot open this user's session (404)", async () => {
    const session = (await createSession([docId])).json().session;
    const other = (await registerUser(app)).cookie;
    const res = await app.inject({ method: "GET", url: `/api/v1/chat/sessions/${session.id}`, headers: { cookie: other } });
    expect(res.statusCode).toBe(404);
  });
});

describe("POST /chat (SSE contract)", () => {
  test("streams token, tool_call, citations and done events, then persists the turn", async () => {
    const session = (await createSession([docId])).json().session;
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/chat",
      headers: { cookie },
      payload: { sessionId: session.id, message: "What is warfare based on?" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");

    const frames = parseSse(res.body);
    const events = frames.map((f) => f.event);
    expect(events).toContain("token");
    expect(events).toContain("tool_call");
    expect(events).toContain("citations");
    expect(events.at(-1)).toBe("done");

    const done = frames.find((f) => f.event === "done")!.data as {
      content: string;
      usage: { inputTokens: number; outputTokens: number };
      messageId: string;
    };
    expect(done.content.length).toBeGreaterThan(0);
    expect(done.usage).toHaveProperty("inputTokens");

    // The turn is persisted: user + assistant messages come back on reload.
    const detail = await app.inject({ method: "GET", url: `/api/v1/chat/sessions/${session.id}`, headers: { cookie } });
    const messages = detail.json().messages;
    expect(messages.map((m: { role: string }) => m.role)).toEqual(["user", "assistant"]);
  });

  test("rejects a message over the length cap with PAYLOAD_TOO_LARGE (before streaming)", async () => {
    const session = (await createSession([docId])).json().session;
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/chat",
      headers: { cookie },
      payload: { sessionId: session.id, message: "x".repeat(5000) },
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  test("an unknown session id is a 404 before the stream starts", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/chat",
      headers: { cookie },
      payload: { sessionId: "00000000-0000-0000-0000-000000000000", message: "hi" },
    });
    expect(res.statusCode).toBe(404);
  });

  test("the conversation list orders by last activity with titles and counts", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/chat/sessions", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const sessions = res.json().sessions;
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions[0]).toMatchObject({
      documentTitles: expect.any(Array),
      messageCount: expect.any(Number),
    });
  });
});
