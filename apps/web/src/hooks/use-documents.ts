import { useState } from "react";
import type { DocumentDto } from "@library-chat/shared";
import { api } from "../lib/api.js";
import { usePolling } from "./use-polling.js";

interface UseDocumentsOptions {
  /** Keep polling while a ready document still has its extraction pending. */
  watchExtractions?: boolean;
  /** Called with every fresh snapshot (batch toasts, ready-transition toasts, …). */
  onDocs?: (docs: DocumentDto[]) => void;
}

/**
 * The user's document list with live-status polling: refreshes every 2.5s
 * while anything is still processing (library list + chat source picker).
 */
export function useDocuments({ watchExtractions = false, onDocs }: UseDocumentsOptions = {}) {
  const [documents, setDocuments] = useState<DocumentDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const anyProcessing = documents?.some((d) => d.status === "processing") ?? true;
  const anyAnalyzing =
    watchExtractions &&
    (documents?.some((d) => d.status === "ready" && d.extractionStatus === "pending") ??
      false);

  async function refresh() {
    try {
      const { documents: docs } = await api.get<{ documents: DocumentDto[] }>(
        "/api/v1/documents",
      );
      setDocuments(docs);
      setLoadError(null);
      onDocs?.(docs);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load documents.");
    }
  }

  usePolling(refresh, 2500, documents === null || anyProcessing || anyAnalyzing);

  return { documents, loadError, refresh };
}
