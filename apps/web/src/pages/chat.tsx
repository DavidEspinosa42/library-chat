import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type {
  CitationDto,
  DocumentCard,
  MessageDto,
  SessionListItem,
} from "@library-chat/shared";
import { ErrorAlert } from "../components/alert.js";
import { PrimaryButton } from "../components/button.js";
import { CitationList } from "../components/citation-chip.js";
import { DocumentRowContent } from "../components/document-row.js";
import { Markdown } from "../components/markdown.js";
import { StarterQuestion } from "../components/starter-question.js";
import { useToast } from "../components/toast.js";
import { useDocuments } from "../hooks/use-documents.js";
import { useStartChat } from "../hooks/use-start-chat.js";
import { api, ApiRequestError } from "../lib/api.js";
import { streamChat } from "../lib/sse.js";

interface UiMessage {
  key: string;
  role: "user" | "assistant";
  content: string;
  citations?: CitationDto[] | null;
  usage?: { inputTokens: number; outputTokens: number };
  elapsedMs?: number;
  failed?: boolean;
}

export function ChatPage() {
  const [params] = useSearchParams();
  const sessionId = params.get("session");
  return (
    <div className="grid items-start gap-6 md:grid-cols-[250px_minmax(0,1fr)]">
      <ConversationsSidebar activeId={sessionId} />
      <div className="min-w-0">
        {sessionId ? (
          <Conversation key={sessionId} sessionId={sessionId} />
        ) : (
          <SourcePicker />
        )}
      </div>
    </div>
  );
}

/* ────────────────────────── Conversations sidebar ────────────────────────── */

function ConversationsSidebar({ activeId }: { activeId: string | null }) {
  const [sessions, setSessions] = useState<SessionListItem[] | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get<{ sessions: SessionListItem[] }>("/api/v1/chat/sessions")
      .then((r) => setSessions(r.sessions))
      .catch(() => setSessions([]));
  }, [activeId]);

  function go(path: string) {
    setMobileOpen(false);
    navigate(path);
  }

  return (
    <aside className="md:sticky md:top-6">
      <button
        onClick={() => setMobileOpen((v) => !v)}
        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-left text-sm font-semibold md:hidden"
      >
        Conversations{sessions ? ` (${sessions.length})` : ""} {mobileOpen ? "▴" : "▾"}
      </button>

      <div
        className={`${mobileOpen ? "mt-2 flex" : "hidden"} flex-col md:mt-0 md:flex md:max-h-[calc(100vh-6.5rem)]`}
      >
        {/* The picker IS the new chat — only offer the button inside a conversation. */}
        {activeId !== null && (
          <button
            onClick={() => go("/chat")}
            className="mb-4 rounded-lg border border-stone-300 bg-white px-3 py-2 text-left text-sm font-semibold text-pine-700 transition-colors hover:border-pine-600 hover:bg-pine-50"
          >
            + New chat
          </button>
        )}

        <p className="mb-1 px-1 text-xs font-semibold uppercase tracking-wider text-stone-400">
          Conversations
        </p>
        <nav className="flex flex-col gap-1 overflow-y-auto pr-1">
          {sessions === null && <p className="px-1 text-sm text-stone-400">Loading…</p>}
          {sessions?.length === 0 && (
            <p className="px-1 text-sm text-stone-400">No conversations yet.</p>
          )}
          {sessions?.map((s) => (
            <button
              key={s.id}
              onClick={() => go(`/chat?session=${s.id}`)}
              className={`rounded-lg px-2.5 py-2 text-left transition-colors ${
                s.id === activeId ? "bg-pine-100" : "hover:bg-stone-100"
              }`}
            >
              <span className="block truncate text-sm font-semibold">
                {s.documentTitles.join(" + ")}
              </span>
              <span className="block font-mono text-xs text-stone-400">
                {s.messageCount} msgs ·{" "}
                {new Date(s.lastMessageAt ?? s.createdAt).toLocaleDateString()}
              </span>
            </button>
          ))}
        </nav>
      </div>
    </aside>
  );
}

/* ────────────────────────── Source picker (empty state) ────────────────────────── */

function SourcePicker() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const prevStatuses = useRef<Map<string, string>>(new Map());
  const { showToast } = useToast();
  const startChatNav = useStartChat();

  const { documents, loadError } = useDocuments({
    // Live-status requirement: toast when a processing doc becomes ready.
    onDocs: (docs) => {
      for (const d of docs) {
        if (prevStatuses.current.get(d.id) === "processing" && d.status === "ready") {
          showToast(`"${d.title}" is ready to chat`);
        }
        prevStatuses.current.set(d.id, d.status);
      }
    },
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function start() {
    setError(null);
    try {
      await startChatNav([...selected]);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not start the chat.");
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-center font-display text-2xl font-bold tracking-tight">
        Start a conversation
      </h1>
      <p className="mb-5 text-center text-sm text-stone-500">
        Pick the sources to ground your chat, then start. The selection is fixed per
        conversation.
      </p>

      {documents === null && <p className="text-center text-sm text-stone-500">Loading…</p>}
      {documents?.length === 0 && (
        <p className="rounded-xl border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
          No documents yet. Upload some in the Library first.
        </p>
      )}

      <ul className="grid gap-2 sm:grid-cols-2">
        {documents?.map((doc) => {
          const ready = doc.status === "ready";
          const isSelected = selected.has(doc.id);
          return (
            <li key={doc.id}>
              {/* The whole card is the toggle; selection = dark pine background. */}
              <button
                type="button"
                disabled={!ready}
                aria-pressed={isSelected}
                onClick={() => toggle(doc.id)}
                className={`flex h-full w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  !ready
                    ? "border-stone-200 bg-white opacity-60"
                    : isSelected
                      ? "border-pine-700 bg-pine-700 text-white"
                      : "border-stone-200 bg-white hover:border-pine-600 hover:bg-pine-50"
                }`}
              >
                <DocumentRowContent doc={doc} inverted={isSelected} />
              </button>
            </li>
          );
        })}
      </ul>

      {(error ?? loadError) && <ErrorAlert className="mt-3">{error ?? loadError}</ErrorAlert>}
      <div className="mt-6 text-center">
        <PrimaryButton
          onClick={() => void start()}
          disabled={selected.size === 0}
          className="px-6 py-2.5"
        >
          {selected.size === 0
            ? "Select at least one source"
            : `Start conversation (${selected.size})`}
        </PrimaryButton>
      </div>
    </div>
  );
}

/* ────────────────────────── Active conversation ────────────────────────── */

function Conversation({ sessionId }: { sessionId: string }) {
  const [params, setParams] = useSearchParams();
  const [session, setSession] = useState<SessionListItem | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [starters, setStarters] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const lastQuestion = useRef<string>("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Monotonic message-key source — never Date.now(), which collides when two
  // messages are appended within the same millisecond (React duplicate keys).
  const seq = useRef(0);
  const uid = () => `${seq.current++}`;

  // The input is disabled while streaming — hand the focus back afterwards.
  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy]);

  useEffect(() => {
    // `ignore` gate: under React StrictMode the effect is invoked twice in dev;
    // without this, the ?ask= auto-send fires twice → a duplicate chat request
    // (two LangSmith traces) and colliding message keys. Only the live effect
    // run (the one not cleaned up) proceeds.
    let ignore = false;
    api
      .get<{ session: SessionListItem; messages: MessageDto[] }>(
        `/api/v1/chat/sessions/${sessionId}`,
      )
      .then(({ session: s, messages: history }) => {
        if (ignore) return;
        setSession(s);
        setMessages(
          history.map((m) => ({
            key: m.id,
            role: m.role,
            content: m.content,
            citations: m.citations,
          })),
        );
        const lastUser = [...history].reverse().find((m) => m.role === "user");
        if (lastUser) lastQuestion.current = lastUser.content;
        if (history.length === 0) {
          // ?ask=… comes from a starter question / theme click in the Library.
          const ask = params.get("ask");
          if (ask) {
            setParams({ session: sessionId }, { replace: true });
            send(ask);
          } else {
            void loadStarters(s.documentIds);
          }
        }
      })
      .catch((err) => {
        if (ignore) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load the conversation.");
      });
    return () => {
      ignore = true;
    };
  }, [sessionId]);

  async function loadStarters(documentIds: string[]) {
    const questions: string[] = [];
    for (const id of documentIds.slice(0, 3)) {
      try {
        const { extraction } = await api.get<{ extraction: DocumentCard | null }>(
          `/api/v1/documents/${id}`,
        );
        if (extraction) questions.push(...extraction.starterQuestions.slice(0, 2));
      } catch {
        // starters are a nicety — skip on failure
      }
    }
    setStarters(questions.slice(0, 6));
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  function send(text: string) {
    const message = text.trim();
    if (message.length === 0 || busy) return;
    setBusy(true);
    setInput("");
    lastQuestion.current = message;

    const assistantKey = `stream-${uid()}`;
    setMessages((prev) => [
      ...prev,
      { key: `user-${uid()}`, role: "user", content: message },
      { key: assistantKey, role: "assistant", content: "" },
    ]);

    const patch = (update: Partial<UiMessage>) =>
      setMessages((prev) =>
        prev.map((m) => (m.key === assistantKey ? { ...m, ...update } : m)),
      );
    const append = (delta: string) =>
      setMessages((prev) =>
        prev.map((m) =>
          m.key === assistantKey ? { ...m, content: m.content + delta } : m,
        ),
      );

    void streamChat(
      { sessionId, message },
      {
        onToken: ({ delta }) => {
          setThinking(null);
          append(delta);
        },
        onToolCall: ({ query }) => setThinking(query),
        onCitations: ({ citations }) => patch({ citations }),
        onDone: ({ content, usage, elapsedMs }) => {
          // Authoritative post-processed text replaces accumulated tokens (docs/04).
          patch({ content, usage, elapsedMs });
          setThinking(null);
          setBusy(false);
        },
        onError: ({ message: errMessage }) => {
          patch({ failed: true, content: errMessage });
          setThinking(null);
          setBusy(false);
        },
      },
    ).catch(() => {
      patch({ failed: true, content: "Connection lost. Please retry." });
      setThinking(null);
      setBusy(false);
    });
  }

  function retry() {
    // Drop the failed exchange, resend the same question.
    setMessages((prev) => prev.slice(0, -2));
    send(lastQuestion.current);
  }

  if (loadError) {
    return <ErrorAlert>{loadError}</ErrorAlert>;
  }

  return (
    <div className="flex h-[calc(100vh-6.5rem)] flex-col">
      {/* Locked source chips (selection fixed per conversation — docs/03) */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5 border-b border-stone-200 pb-3">
        <span
          title="The selection is fixed for this conversation"
          className="flex items-center gap-1 text-xs text-stone-400"
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor" aria-hidden="true">
            <path d="M8 1a3.5 3.5 0 0 0-3.5 3.5V6H4a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 12 6h-.5V4.5A3.5 3.5 0 0 0 8 1Zm2 5H6V4.5a2 2 0 1 1 4 0V6Z" />
          </svg>
          Sources
        </span>
        {session?.documentTitles.map((t) => (
          <span
            key={t}
            className="rounded-full bg-stone-200 px-2.5 py-0.5 text-xs font-semibold text-stone-800"
          >
            {t}
          </span>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto pr-1">
        {messages.length === 0 && starters.length > 0 && (
          <div className="mb-4 flex flex-col gap-2">
            <p className="text-center text-sm text-stone-500">
              Ask anything about your sources, or start from one of these:
            </p>
            {starters.map((q) => (
              <StarterQuestion key={q} question={q} onClick={() => send(q)} />
            ))}
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.key}
            className={`mb-3 max-w-[88%] rounded-xl border px-3.5 py-2.5 text-sm ${
              m.role === "user"
                ? "ml-auto whitespace-pre-wrap border-pine-200 bg-pine-50"
                : m.failed
                  ? "border-red-300 bg-red-50"
                  : "border-stone-200 bg-white"
            }`}
          >
            {m.role === "assistant" && !m.failed ? (
              <>
                {m.content.length === 0 && !m.failed ? (
                  <span className="animate-pulse text-stone-400">…</span>
                ) : (
                  <Markdown>{m.content}</Markdown>
                )}
                {m.citations && m.citations.length > 0 && (
                  <CitationList citations={m.citations} />
                )}
                {m.usage && (
                  <p className="mt-1.5 font-mono text-[10px] text-stone-400">
                    {m.usage.inputTokens}/{m.usage.outputTokens} tokens ·{" "}
                    {((m.elapsedMs ?? 0) / 1000).toFixed(1)}s
                  </p>
                )}
              </>
            ) : m.failed ? (
              <div className="flex items-center gap-3">
                <span role="alert" className="text-red-700">
                  {m.content}
                </span>
                <button
                  onClick={retry}
                  className="rounded bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-500"
                >
                  Retry
                </button>
              </div>
            ) : (
              m.content
            )}
          </div>
        ))}

        {thinking && (
          <p className="mb-3 animate-pulse text-xs text-stone-500">
            Searching the sources: “{thinking}”
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-3 flex gap-2 border-t border-stone-200 pt-3"
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your sources…"
          className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-pine-600 focus:outline-none focus:ring-1 focus:ring-pine-600"
          disabled={busy}
        />
        <PrimaryButton
          type="submit"
          disabled={busy || input.trim().length === 0}
          className="px-4 py-2"
        >
          Send
        </PrimaryButton>
        <button
          type="button"
          title="Re-ask: edit and resend your last question (loads it into the input)"
          onClick={() => {
            setInput(lastQuestion.current);
            inputRef.current?.focus();
          }}
          disabled={busy || lastQuestion.current.length === 0}
          className="rounded-lg border border-stone-300 px-3 py-2 text-sm hover:bg-stone-100 disabled:opacity-40"
        >
          ↻
        </button>
      </form>
    </div>
  );
}
