import { useRef, useState } from "react";
import type { DocumentCard, DocumentDto } from "@library-chat/shared";
import { ErrorAlert } from "../components/alert.js";
import { PrimaryButton } from "../components/button.js";
import { DocumentRowContent } from "../components/document-row.js";
import { StarterQuestion } from "../components/starter-question.js";
import { useToast } from "../components/toast.js";
import { useDocuments } from "../hooks/use-documents.js";
import { useStartChat } from "../hooks/use-start-chat.js";
import { api, ApiRequestError } from "../lib/api.js";

interface DocumentDetail {
  document: DocumentDto;
  extraction: DocumentCard | null;
  extractionError: string | null;
}

export function LibraryPage() {
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteText, setPasteText] = useState("");
  const batchRef = useRef<Set<string>>(new Set());
  const fileInput = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();
  const startChatNav = useStartChat();

  const { documents, loadError, refresh } = useDocuments({
    watchExtractions: true,
    onDocs: trackBatch,
  });

  /** Non-blocking upload UX: toast with CTA once the whole batch is ready (docs/05 P4). */
  function trackBatch(docs: DocumentDto[]) {
    const batch = batchRef.current;
    if (batch.size === 0) return;
    const rows = docs.filter((d) => batch.has(d.id));
    if (rows.some((d) => d.status === "processing")) return;

    const ready = rows.filter((d) => d.status === "ready").map((d) => d.id);
    batchRef.current = new Set();
    if (ready.length === 0) return;
    showToast(
      ready.length === 1
        ? "Your document is ready to chat"
        : `Your ${ready.length} documents are ready to chat`,
      {
        label: "Start chat →",
        onClick: () => void startChat(ready),
      },
    );
  }

  async function startChat(documentIds: string[], ask?: string) {
    try {
      await startChatNav(documentIds, ask);
    } catch (err) {
      showToast(err instanceof ApiRequestError ? err.message : "Could not start the chat.");
    }
  }

  async function submitFiles(files: File[]) {
    setUploadError(null);
    setUploading(true);
    try {
      const { documents: created } = await api.upload<{ documents: DocumentDto[] }>(
        "/api/v1/documents",
        files,
      );
      for (const d of created) batchRef.current.add(d.id);
      await refresh();
    } catch (err) {
      setUploadError(
        err instanceof ApiRequestError ? err.message : "Upload failed. Please retry.",
      );
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function submitPaste() {
    setUploadError(null);
    setUploading(true);
    try {
      const { documents: created } = await api.post<{ documents: DocumentDto[] }>(
        "/api/v1/documents",
        { text: pasteText, title: pasteTitle.trim() },
      );
      for (const d of created) batchRef.current.add(d.id);
      setPasteTitle("");
      setPasteText("");
      setPasteOpen(false);
      await refresh();
    } catch (err) {
      setUploadError(
        err instanceof ApiRequestError ? err.message : "Submit failed. Please retry.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function openDetail(id: string) {
    setDetail(null);
    try {
      setDetail(await api.get<DocumentDetail>(`/api/v1/documents/${id}`));
    } catch {
      // row click is best-effort; list already shows status
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
      <section>
        {/* Submit content: files or pasted text (assessment 1.1) */}
        <div className="mb-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInput}
              type="file"
              multiple
              accept=".pdf,.docx,.doc,.txt,.md,.html,.epub,.mobi,.srt,.vtt"
              className="hidden"
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                if (files.length > 0) void submitFiles(files);
              }}
            />
            <PrimaryButton
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 px-4 py-2"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                <path d="M8 1.75 3.75 6.5h2.5V11h3.5V6.5h2.5L8 1.75ZM3 12.5h10V14H3v-1.5Z" />
              </svg>
              {uploading ? "Uploading…" : "Upload documents"}
            </PrimaryButton>
            <button
              onClick={() => setPasteOpen((v) => !v)}
              className="ml-auto text-xs font-semibold text-pine-700 hover:text-pine-900 hover:underline"
            >
              {pasteOpen ? "Cancel paste" : "or paste text"}
            </button>
          </div>
          <p className="mt-2 font-mono text-xs text-stone-400">
            pdf · docx · txt · md · html · epub · mobi · srt
          </p>

          {pasteOpen && (
            <div className="mt-3">
              <input
                type="text"
                value={pasteTitle}
                onChange={(e) => setPasteTitle(e.target.value)}
                required
                maxLength={200}
                placeholder="Title for this document (required)"
                className="mb-2 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm focus:border-pine-600 focus:outline-none focus:ring-1 focus:ring-pine-600"
              />
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={5}
                placeholder="Paste any text"
                className="w-full rounded-lg border border-stone-300 p-2 text-sm focus:border-pine-600 focus:outline-none focus:ring-1 focus:ring-pine-600"
              />
              <PrimaryButton
                onClick={() => void submitPaste()}
                disabled={
                  uploading ||
                  pasteTitle.trim().length === 0 ||
                  pasteText.trim().length === 0
                }
                className="mt-2 px-3 py-1.5"
              >
                Submit text
              </PrimaryButton>
            </div>
          )}
          {uploadError && <ErrorAlert className="mt-3">{uploadError}</ErrorAlert>}
        </div>

        {/* Document list: loading / error / empty / rows */}
        {documents === null && !loadError && (
          <p className="text-sm text-stone-500">Loading your library…</p>
        )}
        {loadError && <ErrorAlert>{loadError}</ErrorAlert>}
        {documents?.length === 0 && (
          <p className="rounded-xl border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
            Your library is empty. Upload a document to get started.
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {documents?.map((doc) => {
            const isOpen = detail?.document.id === doc.id;
            return (
              <li
                key={doc.id}
                onClick={() => void openDetail(doc.id)}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border bg-white px-3 py-2.5 transition-colors ${
                  isOpen
                    ? "border-stone-500"
                    : "border-stone-200 hover:border-stone-300 hover:bg-stone-50"
                }`}
              >
                <DocumentRowContent doc={doc} />
              </li>
            );
          })}
        </ul>
      </section>

      {/* Document card panel (assessment 1.1: structured outputs) */}
      <aside>
        {detail ? (
          <DocumentCardPanel
            detail={detail}
            onStartChat={(id, ask) => void startChat([id], ask)}
          />
        ) : (
          <p className="rounded-xl border border-stone-200 bg-white p-6 text-sm text-stone-400">
            Click a document to see its card. To chat with several documents at once, head
            to the Chat tab.
          </p>
        )}
      </aside>
    </div>
  );
}

function DocumentCardPanel({
  detail,
  onStartChat,
}: {
  detail: DocumentDetail;
  onStartChat: (documentId: string, ask?: string) => void;
}) {
  const { document: doc, extraction, extractionError } = detail;
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold leading-tight tracking-tight">
            {doc.title}
          </h2>
          <p className="mt-1 font-mono text-xs text-stone-400">
            {doc.format ?? "pasted text"} · {new Date(doc.createdAt).toLocaleDateString()}
          </p>
        </div>
        {doc.status === "ready" && (
          <PrimaryButton onClick={() => onStartChat(doc.id)} className="px-4 py-2">
            Chat with this document →
          </PrimaryButton>
        )}
      </div>

      {doc.status !== "ready" ? (
        <p className="text-sm text-stone-500">
          {doc.status === "processing" ? "Still processing…" : `Failed: ${doc.error}`}
        </p>
      ) : extractionError ? (
        <ErrorAlert>Analysis failed: {extractionError}</ErrorAlert>
      ) : !extraction ? (
        <p className="animate-pulse text-sm text-stone-500">Analyzing document…</p>
      ) : (
        <div className="flex flex-col gap-5 text-sm">
          <div className="flex flex-wrap gap-1.5 font-mono text-xs">
            <span className="rounded bg-stone-100 px-2 py-0.5 text-stone-700">
              {extraction.docType}
            </span>
            <span className="rounded bg-stone-100 px-2 py-0.5 text-stone-700">
              {extraction.language}
            </span>
            {extraction.author && (
              <span className="rounded bg-stone-100 px-2 py-0.5 text-stone-700">
                {extraction.author}
              </span>
            )}
          </div>
          <p className="leading-relaxed text-stone-700">{extraction.summary}</p>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-stone-400">
                Themes
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {extraction.themes.map((t) => (
                  <button
                    key={t}
                    onClick={() =>
                      onStartChat(doc.id, `What does this document say about "${t}"?`)
                    }
                    title="Start a chat about this theme"
                    className="rounded-full bg-pine-50 px-2.5 py-1 text-left text-xs text-pine-800 transition-colors hover:bg-pine-100"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-stone-400">
                Key entities
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {extraction.keyEntities.map((e) => (
                  <span
                    key={`${e.type}-${e.value}`}
                    title={e.type}
                    className="rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-700"
                  >
                    {e.value}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-stone-400">
              Starter questions
            </h3>
            <ul className="grid gap-2 md:grid-cols-2">
              {extraction.starterQuestions.map((q) => (
                <li key={q}>
                  <StarterQuestion compact question={q} onClick={() => onStartChat(doc.id, q)} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
