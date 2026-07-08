import type { DocumentStatus } from "@library-chat/shared";

const STYLES: Record<DocumentStatus, string> = {
  processing: "bg-amber-100 text-amber-800",
  ready: "bg-pine-100 text-pine-800",
  failed: "bg-red-100 text-red-800",
};

export function StatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <span
      data-testid="status-badge"
      className={`rounded-full px-2 py-0.5 font-mono text-xs font-semibold ${STYLES[status]}`}
    >
      {status === "processing" ? "processing…" : status}
    </span>
  );
}
