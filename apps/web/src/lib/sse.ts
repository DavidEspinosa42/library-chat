import type { ChatSseEvent } from "@library-chat/shared";

type EventData<E extends ChatSseEvent["event"]> = Extract<
  ChatSseEvent,
  { event: E }
>["data"];

export interface ChatStreamHandlers {
  onToken: (data: EventData<"token">) => void;
  onToolCall: (data: EventData<"tool_call">) => void;
  onCitations: (data: EventData<"citations">) => void;
  onDone: (data: EventData<"done">) => void;
  onError: (data: EventData<"error">) => void;
}

/**
 * SSE-over-POST reader (docs/04): EventSource can't POST, so the stream is
 * consumed with fetch + ReadableStream and parsed frame by frame.
 */
export async function streamChat(
  body: { sessionId: string; message: string },
  handlers: ChatStreamHandlers,
): Promise<void> {
  const res = await fetch("/api/v1/chat", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    try {
      const err = (await res.json()) as { error?: { code?: string; message?: string } };
      handlers.onError({
        code: err.error?.code ?? "INTERNAL",
        message: err.error?.message ?? "The request failed before streaming.",
      });
    } catch {
      handlers.onError({ code: "INTERNAL", message: `Request failed (${res.status}).` });
    }
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Frames are separated by a blank line.
    for (;;) {
      const idx = buffer.indexOf("\n\n");
      if (idx === -1) break;
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      dispatchFrame(frame, handlers);
    }
  }
}

function dispatchFrame(frame: string, handlers: ChatStreamHandlers): void {
  let event = "";
  let data = "";
  for (const line of frame.split("\n")) {
    if (line.startsWith("event: ")) event = line.slice(7).trim();
    else if (line.startsWith("data: ")) data += line.slice(6);
    // lines starting with ":" are keep-alive comments — ignored
  }
  if (!event || !data) return;

  try {
    const parsed = JSON.parse(data);
    switch (event) {
      case "token":
        return handlers.onToken(parsed);
      case "tool_call":
        return handlers.onToolCall(parsed);
      case "citations":
        return handlers.onCitations(parsed);
      case "done":
        return handlers.onDone(parsed);
      case "error":
        return handlers.onError(parsed);
    }
  } catch {
    // malformed frame — skip
  }
}
