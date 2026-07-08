import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { getEmbeddings } from "../embeddings/factory.js";
import { db, sql } from "../../db/client.js";
import { chunks, documents, users } from "../../db/schema.js";
import { getPromptSet, type RetrievedEntry } from "../prompt/registry.js";
import { createSearchChunksTool } from "./search-chunks.js";

/**
 * The retrieval tool over the test DB with the deterministic fake embedder
 * (docs/02 test-mode). Asserts the server-side corpus clamp and per-turn
 * numbering — the two properties citation validation depends on.
 */
const prompts = getPromptSet();
let userId: string;
let docA: string;
let docB: string;

async function seedChunks(documentId: string, uid: string, texts: string[]): Promise<void> {
  const vectors = await getEmbeddings().embedChunkGroups([texts]);
  await db.insert(chunks).values(
    texts.map((content, i) => ({
      documentId,
      userId: uid,
      idx: i,
      content,
      location: `Section ${i}`,
      tokenCount: content.split(" ").length,
      embedding: vectors[0]![i]!,
    })),
  );
}

beforeAll(async () => {
  const [user] = await db
    .insert(users)
    .values({ email: `search-${Date.now()}@test.dev`, passwordHash: "x" })
    .returning();
  userId = user!.id;

  const rows = await db
    .insert(documents)
    .values([
      { userId, title: "The Art of War", sourceType: "paste" as const, status: "ready" as const },
      { userId, title: "Meditations", sourceType: "paste" as const, status: "ready" as const },
    ])
    .returning();
  docA = rows[0]!.id;
  docB = rows[1]!.id;

  await seedChunks(docA, userId, [
    "All warfare is based on deception and strategy.",
    "Supreme excellence is breaking resistance without fighting.",
  ]);
  await seedChunks(docB, userId, [
    "The universe is change; our life is what our thoughts make it.",
    "Waste no more time arguing what a good person should be.",
  ]);
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId));
  await sql.end();
});

describe("search_chunks tool", () => {
  test("returns numbered results wrapped in the low-trust envelope", async () => {
    const registry: RetrievedEntry[] = [];
    const tool = createSearchChunksTool({ userId, documentIds: [docA, docB], registry, prompts });
    const out = (await tool.invoke({ query: "deception in warfare" })) as string;

    expect(out).toContain('<document-content n="1"');
    expect(out).toContain("</document-content>");
    expect(registry.length).toBeGreaterThan(0);
    expect(registry[0]?.n).toBe(1);
  });

  test("continues numbering across successive calls in one turn", async () => {
    const registry: RetrievedEntry[] = [];
    const tool = createSearchChunksTool({ userId, documentIds: [docA, docB], registry, prompts });
    await tool.invoke({ query: "strategy" });
    const firstCount = registry.length;
    await tool.invoke({ query: "thoughts and change" });

    expect(registry.length).toBeGreaterThan(firstCount);
    expect(registry.map((e) => e.n)).toEqual(registry.map((_, i) => i + 1));
  });

  test("clamps a documentId outside the selection back to the corpus", async () => {
    const foreign = "00000000-0000-0000-0000-000000000000";
    const registry: RetrievedEntry[] = [];
    const tool = createSearchChunksTool({ userId, documentIds: [docA], registry, prompts });
    await tool.invoke({ query: "anything", documentId: foreign });

    // The foreign id is ignored; results stay within the selected corpus (docA only).
    expect(registry.length).toBeGreaterThan(0);
    expect(registry.every((e) => e.documentId === docA)).toBe(true);
  });

  test("narrows to a single source when a valid documentId is supplied", async () => {
    const registry: RetrievedEntry[] = [];
    const tool = createSearchChunksTool({ userId, documentIds: [docA, docB], registry, prompts });
    await tool.invoke({ query: "life and thoughts", documentId: docB });

    expect(registry.every((e) => e.documentId === docB)).toBe(true);
  });
});
