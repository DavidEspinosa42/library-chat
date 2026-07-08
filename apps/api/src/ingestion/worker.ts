import type { DocumentFormat } from "@library-chat/shared";
import { eq } from "drizzle-orm";
import { getEmbeddings } from "../ai/embeddings/factory.js";
import { env } from "../config/env.js";
import { db } from "../db/client.js";
import { chunks as chunksTable, documents } from "../db/schema.js";
import { chunkDocument, type Chunk } from "./chunk.js";
import { parseDocument } from "./parsers/index.js";

export interface IngestionJob {
  documentId: string;
  userId: string;
  buffer: Buffer;
  format: DocumentFormat;
}

const INSERT_BATCH = 500;

/**
 * Ingestion pipeline (docs/01): parse → cap → chunk → embed (grouped) → insert.
 * Idempotent: previous chunks of the document are deleted before re-insert.
 * Any failure marks the document `failed` with a human-readable reason.
 */
const PARSE_TIMEOUT_MS = 60_000;

export async function processDocument(job: IngestionJob): Promise<void> {
  try {
    validateMagicBytes(job.buffer, job.format);
    const parsed = await withTimeout(
      parseDocument(job.buffer, job.format),
      PARSE_TIMEOUT_MS,
      `Parsing timed out after ${PARSE_TIMEOUT_MS / 1000}s — the file may be corrupt.`,
    );
    const chunks = chunkDocument(parsed, {
      chunkTokens: env.CHUNK_TOKENS,
      overlapPct: env.CHUNK_OVERLAP_PCT,
    });
    if (chunks.length === 0) {
      throw new IngestionError("No readable text found in the document.");
    }

    const totalTokens = chunks.reduce((s, c) => s + c.tokenCount, 0);
    if (totalTokens > env.MAX_DOC_TOKENS) {
      throw new IngestionError(
        `Document has ~${totalTokens.toLocaleString()} tokens — the limit is ${env.MAX_DOC_TOKENS.toLocaleString()}.`,
      );
    }

    const groups = buildGroups(chunks);
    const vectorGroups = await getEmbeddings().embedChunkGroups(
      groups.map((g) => g.map((c) => c.content)),
    );

    const rows = groups.flatMap((group, gi) =>
      group.map((chunk, ci) => ({
        documentId: job.documentId,
        userId: job.userId,
        idx: chunk.idx,
        content: chunk.content,
        location: chunk.location,
        tokenCount: chunk.tokenCount,
        // Aligned by construction; embedChunkGroups validates counts per group.
        embedding: vectorGroups[gi]![ci]!,
      })),
    );

    await db.transaction(async (tx) => {
      await tx.delete(chunksTable).where(eq(chunksTable.documentId, job.documentId));
      for (let i = 0; i < rows.length; i += INSERT_BATCH) {
        await tx.insert(chunksTable).values(rows.slice(i, i + INSERT_BATCH));
      }
      await tx
        .update(documents)
        .set({ status: "ready", tokenCount: totalTokens, error: null, updatedAt: new Date() })
        .where(eq(documents.id, job.documentId));
    });
  } catch (err) {
    const message =
      err instanceof IngestionError
        ? err.message
        : `Processing failed: ${err instanceof Error ? err.message.slice(0, 300) : "unknown error"}`;
    await db
      .update(documents)
      .set({ status: "failed", error: message, updatedAt: new Date() })
      .where(eq(documents.id, job.documentId));
    throw err;
  }
}

/**
 * Contiguous groups under the per-request budget of the contextualized
 * endpoint (docs/02): ≤ EMBED_GROUP_MAX_TOKENS tokens and ≤ 1000 chunks.
 */
function buildGroups(chunks: Chunk[]): Chunk[][] {
  const groups: Chunk[][] = [];
  let current: Chunk[] = [];
  let tokens = 0;
  for (const chunk of chunks) {
    if (
      current.length > 0 &&
      (tokens + chunk.tokenCount > env.EMBED_GROUP_MAX_TOKENS || current.length >= 1000)
    ) {
      groups.push(current);
      current = [];
      tokens = 0;
    }
    current.push(chunk);
    tokens += chunk.tokenCount;
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

class IngestionError extends Error {}

/** Cheap signature sniff — catches renamed/corrupt files before parsers hang on them. */
function validateMagicBytes(buffer: Buffer, format: IngestionJob["format"]): void {
  const ok = (() => {
    switch (format) {
      case "pdf":
        return buffer.subarray(0, 5).toString("latin1") === "%PDF-";
      case "epub":
      case "docx": // both are zip containers
        return buffer[0] === 0x50 && buffer[1] === 0x4b; // "PK"
      case "doc": // OLE compound file
        return buffer.length >= 4 && buffer.readUInt32BE(0) === 0xd0cf11e0;
      case "mobi": // PalmDB container
        return buffer.subarray(60, 68).toString("latin1") === "BOOKMOBI";
      default:
        return true; // txt/md/html/srt/vtt: any text goes
    }
  })();
  if (!ok) {
    throw new IngestionError(
      `File content does not look like a valid .${format} file.`,
    );
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new IngestionError(message)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}
