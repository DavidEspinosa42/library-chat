import type { DocumentDto, ExtractionStatus } from "@library-chat/shared";
import type { documents, extractions } from "../../db/schema.js";

type DocumentRow = typeof documents.$inferSelect;
type ExtractionRow = typeof extractions.$inferSelect;

export function toDocumentDto(
  row: DocumentRow,
  extraction?: Pick<ExtractionRow, "payload" | "error"> | null,
): DocumentDto {
  return {
    id: row.id,
    title: row.title,
    filename: row.filename,
    sourceType: row.sourceType,
    format: row.format,
    status: row.status,
    error: row.error,
    extractionStatus: deriveExtractionStatus(extraction),
    createdAt: row.createdAt.toISOString(),
  };
}

/** No row yet → pending ("analyzing…" in the UI); row with error → failed (docs/03). */
function deriveExtractionStatus(
  extraction?: Pick<ExtractionRow, "payload" | "error"> | null,
): ExtractionStatus {
  if (!extraction) return "pending";
  return extraction.error !== null ? "failed" : "ready";
}
