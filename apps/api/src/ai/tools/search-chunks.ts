import { and, cosineDistance, eq, inArray } from "drizzle-orm";
import { tool } from "langchain";
import { z } from "zod";
import { env } from "../../config/env.js";
import { db } from "../../db/client.js";
import { chunks, documents } from "../../db/schema.js";
import { getEmbeddings } from "../embeddings/factory.js";
import type { PromptSet, RetrievedEntry } from "../prompt/registry.js";

export interface SearchContext {
  userId: string;
  /** The session's corpus — validated server-side; the model can only narrow it. */
  documentIds: string[];
  /** Per-turn registry: every retrieved chunk, numbered — feeds citation validation. */
  registry: RetrievedEntry[];
  prompts: PromptSet;
  onSearch?: (args: { query: string; documentId?: string }) => void;
}

/**
 * The retrieval tool (docs/02). The corpus filter is enforced here with the
 * request's validated documentIds — a prompt-injected documentId outside the
 * selection is silently clamped back to the corpus.
 */
export function createSearchChunksTool(ctx: SearchContext) {
  return tool(
    async ({ query, documentId }: { query: string; documentId?: string }) => {
      ctx.onSearch?.(documentId ? { query, documentId } : { query });

      const scope =
        documentId && ctx.documentIds.includes(documentId)
          ? [documentId]
          : ctx.documentIds;

      const queryVector = await getEmbeddings().embedQuery(query);

      const rows = await db
        .select({
          chunkId: chunks.id,
          documentId: chunks.documentId,
          content: chunks.content,
          location: chunks.location,
          documentTitle: documents.title,
        })
        .from(chunks)
        .innerJoin(documents, eq(documents.id, chunks.documentId))
        .where(and(eq(chunks.userId, ctx.userId), inArray(chunks.documentId, scope)))
        // Exact cosine scan — no ANN index by design (docs/01).
        .orderBy(cosineDistance(chunks.embedding, queryVector))
        .limit(env.RETRIEVAL_TOP_K);

      const entries: RetrievedEntry[] = rows.map((row, i) => ({
        n: ctx.registry.length + i + 1,
        chunkId: row.chunkId,
        documentId: row.documentId,
        documentTitle: row.documentTitle,
        location: row.location,
        content: row.content,
      }));
      ctx.registry.push(...entries);

      return ctx.prompts.formatSearchResults(entries);
    },
    {
      name: "search_chunks",
      description:
        "Semantic search over the user's selected sources. Returns the most relevant passages, numbered for citation. Optionally narrow to a single source with its documentId.",
      schema: z.object({
        query: z.string().describe("What to look for, phrased as a search query"),
        documentId: z
          .uuid()
          .optional()
          .describe("Restrict the search to one of the selected sources"),
      }),
    },
  );
}
