import { and, cosineDistance, eq, inArray } from "drizzle-orm";
import { env } from "../../config/env.js";
import { db } from "../../db/client.js";
import { chunks, documents } from "../../db/schema.js";
import { getEmbeddings } from "../embeddings/factory.js";
import type { RetrievedEntry } from "../prompt/registry.js";

export interface RetrieveParams {
  userId: string;
  /** The session's corpus — the model can only narrow within it, never widen. */
  documentIds: string[];
  query: string;
  /** Optional narrow to one owned+selected source; ignored if outside the corpus. */
  documentId?: string;
  /** Continues per-turn numbering across successive searches (registry length). */
  startN?: number;
  topK?: number;
}

/**
 * Exact cosine retrieval over the selected corpus (docs/01/02). Shared by the
 * agent's search tool and the retrieval-only evals so both exercise the same
 * ranking. The corpus filter is enforced here — a documentId outside the
 * selection is clamped back to the whole corpus.
 */
export async function retrieveChunks(params: RetrieveParams): Promise<RetrievedEntry[]> {
  const scope =
    params.documentId && params.documentIds.includes(params.documentId)
      ? [params.documentId]
      : params.documentIds;

  const queryVector = await getEmbeddings().embedQuery(params.query);

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
    .where(and(eq(chunks.userId, params.userId), inArray(chunks.documentId, scope)))
    .orderBy(cosineDistance(chunks.embedding, queryVector))
    .limit(params.topK ?? env.RETRIEVAL_TOP_K);

  const start = params.startN ?? 0;
  return rows.map((row, i) => ({
    n: start + i + 1,
    chunkId: row.chunkId,
    documentId: row.documentId,
    documentTitle: row.documentTitle,
    location: row.location,
    content: row.content,
  }));
}
