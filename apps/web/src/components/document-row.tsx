import type { DocumentDto } from "@library-chat/shared";
import { StatusBadge } from "./status-badge.js";

/**
 * Shared inner layout of a document row card (library list + chat source picker).
 * `inverted` adapts the muted text for dark (selected) backgrounds.
 */
export function DocumentRowContent({
  doc,
  inverted = false,
}: {
  doc: DocumentDto;
  inverted?: boolean;
}) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{doc.title}</span>
        <span className={`font-mono text-xs ${inverted ? "text-pine-200" : "text-stone-400"}`}>
          {doc.format ?? "pasted text"}
          {doc.error ? ` · ${doc.error}` : ""}
        </span>
      </div>
      <StatusBadge status={doc.status} />
    </>
  );
}
