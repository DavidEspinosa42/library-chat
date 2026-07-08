import {
  documentFormatSchema,
  documentsListResponseSchema,
  pasteBodySchema,
  submitDocumentsResponseSchema,
  type DocumentFormat,
} from "@library-chat/shared";
import { and, asc, desc, eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { env } from "../../config/env.js";
import { db } from "../../db/client.js";
import { documents, extractions } from "../../db/schema.js";
import { enqueueIngestion } from "../../ingestion/queue.js";
import { AppError } from "../../lib/errors.js";
import { toDocumentDto } from "./dto.js";

const ACCEPTED = documentFormatSchema.options.join(", ");

export const documentRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", app.authenticate);

  /**
   * Submit content (assessment 1.1): multipart upload (1..N files) OR pasted
   * text as JSON. The body is validated manually because one endpoint accepts
   * two content types — still Zod at the boundary (docs/06).
   */
  app.route({
    method: "POST",
    url: "/documents",
    schema: { response: { 202: submitDocumentsResponseSchema } },
    handler: async (req, reply) => {
      const userId = req.user.sub;
      const created = req.isMultipart()
        ? await handleUpload(req, userId)
        : await handlePaste(req.body, userId);

      for (const { row, buffer, parseFormat } of created) {
        enqueueIngestion(
          { documentId: row.id, userId, buffer, format: parseFormat },
          req.log,
        );
      }
      return reply
        .status(202)
        .send({ documents: created.map(({ row }) => toDocumentDto(row)) });
    },
  });

  app.route({
    method: "GET",
    url: "/documents",
    schema: { response: { 200: documentsListResponseSchema } },
    handler: async (req) => {
      const rows = await db
        .select()
        .from(documents)
        .leftJoin(extractions, eq(extractions.documentId, documents.id))
        .where(eq(documents.userId, req.user.sub))
        // Batch uploads share a createdAt — title breaks the tie deterministically.
        .orderBy(desc(documents.createdAt), asc(documents.title));
      return {
        documents: rows.map((r) => toDocumentDto(r.documents, r.extractions)),
      };
    },
  });

  app.route({
    method: "GET",
    url: "/documents/:id",
    schema: {
      params: z.object({ id: z.uuid() }),
      response: {
        200: z.object({
          document: documentsListResponseSchema.shape.documents.element,
          extraction: z.unknown().nullable(),
          extractionError: z.string().nullable(),
        }),
      },
    },
    handler: async (req) => {
      const [row] = await db
        .select()
        .from(documents)
        .leftJoin(extractions, eq(extractions.documentId, documents.id))
        .where(and(eq(documents.id, req.params.id), eq(documents.userId, req.user.sub)))
        .limit(1);
      if (!row) throw new AppError("NOT_FOUND", "Document not found.");
      return {
        document: toDocumentDto(row.documents, row.extractions),
        extraction: row.extractions?.payload ?? null,
        extractionError: row.extractions?.error ?? null,
      };
    },
  });
};

interface CreatedDocument {
  row: typeof documents.$inferSelect;
  buffer: Buffer;
  /** Format used by the parser — pasted text goes through the text parser. */
  parseFormat: DocumentFormat;
}

async function handleUpload(
  req: { files: () => AsyncIterableIterator<MultipartFile> },
  userId: string,
): Promise<CreatedDocument[]> {
  const files: { filename: string; format: DocumentFormat; buffer: Buffer }[] = [];
  let rejected: AppError | null = null;

  for await (const part of req.files()) {
    const filename = part.filename ?? "unnamed";
    const ext = filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "";
    const format = documentFormatSchema.safeParse(ext);
    if (rejected || !format.success) {
      // The multipart stream must be drained before replying, or the
      // connection is destroyed and the client never sees the envelope.
      rejected ??= new AppError(
        "UNSUPPORTED_FORMAT",
        `Format '.${ext || "?"}' is not supported (${filename}). Accepted: ${ACCEPTED}.`,
      );
      part.file.resume();
      continue;
    }
    // Throws a 413 (handled by the error envelope) if the file exceeds MAX_FILE_MB.
    files.push({ filename, format: format.data, buffer: await part.toBuffer() });
  }
  if (rejected) throw rejected;

  if (files.length === 0) {
    throw new AppError("VALIDATION", "No files found in the multipart request.");
  }

  const rows = await db
    .insert(documents)
    .values(
      files.map((f) => ({
        userId,
        title: f.filename.replace(/\.[^.]+$/, ""),
        filename: f.filename,
        sourceType: "upload" as const,
        format: f.format,
      })),
    )
    .returning();

  return rows.map((row, i) => ({
    row,
    buffer: files[i]!.buffer,
    parseFormat: files[i]!.format,
  }));
}

async function handlePaste(body: unknown, userId: string): Promise<CreatedDocument[]> {
  const parsed = pasteBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("VALIDATION", "Expected { text, title } or a multipart upload.");
  }
  if (parsed.data.text.length > env.MAX_PASTE_CHARS) {
    throw new AppError(
      "PAYLOAD_TOO_LARGE",
      `Pasted text exceeds ${env.MAX_PASTE_CHARS.toLocaleString()} characters.`,
    );
  }

  const title = parsed.data.title;

  const [row] = await db
    .insert(documents)
    .values({ userId, title, sourceType: "paste" as const })
    .returning();
  if (!row) throw new AppError("INTERNAL", "Failed to store the pasted text.");

  return [{ row, buffer: Buffer.from(parsed.data.text, "utf-8"), parseFormat: "txt" }];
}

interface MultipartFile {
  filename?: string;
  mimetype: string;
  file: { resume: () => void };
  toBuffer: () => Promise<Buffer>;
}
