import { z } from "zod";

export const documentFormatSchema = z.enum([
  "pdf",
  "docx",
  "doc",
  "txt",
  "md",
  "html",
  "epub",
  "mobi",
  "srt",
  "vtt",
]);
export type DocumentFormat = z.infer<typeof documentFormatSchema>;

export const documentStatusSchema = z.enum(["processing", "ready", "failed"]);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

/** Derived from the extractions row: none yet → pending (docs/03). */
export const extractionStatusSchema = z.enum(["pending", "ready", "failed"]);
export type ExtractionStatus = z.infer<typeof extractionStatusSchema>;

export const documentDtoSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  filename: z.string().nullable(),
  sourceType: z.enum(["upload", "paste"]),
  format: documentFormatSchema.nullable(),
  status: documentStatusSchema,
  error: z.string().nullable(),
  extractionStatus: extractionStatusSchema,
  createdAt: z.iso.datetime(),
});
export type DocumentDto = z.infer<typeof documentDtoSchema>;

export const pasteBodySchema = z.object({
  text: z.string().min(1),
  title: z.string().trim().min(1).max(200),
});
export type PasteBody = z.infer<typeof pasteBodySchema>;

export const documentsListResponseSchema = z.object({
  documents: z.array(documentDtoSchema),
});

export const submitDocumentsResponseSchema = z.object({
  documents: z.array(documentDtoSchema),
});
