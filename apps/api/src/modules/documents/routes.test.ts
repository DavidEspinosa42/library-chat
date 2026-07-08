import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { sql } from "../../db/client.js";
import { ingestPaste, makeApp, registerUser, waitForStatus } from "../../test-support/harness.js";

let app: FastifyInstance;
let cookie: string;

beforeAll(async () => {
  app = await makeApp();
  cookie = (await registerUser(app)).cookie;
});
afterAll(async () => {
  await app.close();
  await sql.end();
});

/** Hand-built multipart/form-data body — light-my-request needs the raw bytes + boundary. */
function uploadFile(filename: string, content: string, cookieHeader = cookie) {
  const boundary = "----librarychatTestBoundary";
  const body =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: text/plain\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--\r\n`;
  return app.inject({
    method: "POST",
    url: "/api/v1/documents",
    headers: { cookie: cookieHeader, "content-type": `multipart/form-data; boundary=${boundary}` },
    payload: body,
  });
}

describe("documents routes", () => {
  test("pasted text is accepted (202) and reaches ready via the pipeline", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/documents",
      headers: { cookie },
      payload: { text: "The unexamined life is not worth living. Wisdom begins in wonder.", title: "Notes" },
    });
    expect(res.statusCode).toBe(202);
    const doc = res.json().documents[0];
    expect(doc).toMatchObject({ status: "processing", sourceType: "paste", title: "Notes" });

    const status = await waitForStatus(app, cookie, doc.id);
    expect(status).toBe("ready");
  });

  test("paste without a title fails validation", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/documents",
      headers: { cookie },
      payload: { text: "orphan text" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION");
  });

  test("a multipart upload with an accepted format is ingested to ready", async () => {
    const res = await uploadFile("art.txt", "All warfare is based on deception.\n\nSupreme excellence is subduing the enemy without fighting.");
    expect(res.statusCode).toBe(202);
    const doc = res.json().documents[0];
    expect(doc).toMatchObject({ status: "processing", sourceType: "upload", format: "txt" });
    expect(await waitForStatus(app, cookie, doc.id)).toBe("ready");
  });

  test("an unsupported extension is rejected with UNSUPPORTED_FORMAT (415)", async () => {
    const res = await uploadFile("data.xlsx", "junk");
    expect(res.statusCode).toBe(415);
    expect(res.json().error.code).toBe("UNSUPPORTED_FORMAT");
  });

  test("GET /documents lists the caller's documents with an extractionStatus", async () => {
    await ingestPaste(app, cookie, "Some content to profile.", "Listable");
    const res = await app.inject({ method: "GET", url: "/api/v1/documents", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const docs = res.json().documents;
    expect(docs.length).toBeGreaterThan(0);
    expect(docs[0]).toHaveProperty("extractionStatus");
  });

  test("another user's document id is a 404, not a leak", async () => {
    const { id } = await ingestPaste(app, cookie, "private content", "Private");
    const other = (await registerUser(app)).cookie;
    const res = await app.inject({ method: "GET", url: `/api/v1/documents/${id}`, headers: { cookie: other } });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });
});
