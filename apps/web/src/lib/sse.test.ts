import { afterEach, describe, expect, test, vi } from "vitest";
import { streamChat, type ChatStreamHandlers } from "./sse.js";

const enc = new TextEncoder();

/** A fetch stub whose body streams the given byte chunks in order. */
function stubFetch(status: number, chunks: string[], json?: unknown) {
  const body =
    status >= 400
      ? null
      : new ReadableStream<Uint8Array>({
          start(controller) {
            for (const c of chunks) controller.enqueue(enc.encode(c));
            controller.close();
          },
        });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status < 400,
      status,
      body,
      json: async () => json,
    }),
  );
}

function recorder(): ChatStreamHandlers & { events: [string, unknown][] } {
  const events: [string, unknown][] = [];
  return {
    events,
    onToken: (d) => events.push(["token", d]),
    onToolCall: (d) => events.push(["tool_call", d]),
    onCitations: (d) => events.push(["citations", d]),
    onDone: (d) => events.push(["done", d]),
    onError: (d) => events.push(["error", d]),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("streamChat SSE parser", () => {
  test("dispatches token, tool_call, citations and done in order", async () => {
    stubFetch(200, [
      'event: tool_call\ndata: {"name":"search_chunks","query":"deception"}\n\n',
      'event: token\ndata: {"delta":"Hello"}\n\n',
      'event: token\ndata: {"delta":" world"}\n\n',
      'event: citations\ndata: {"citations":[],"invalidCitations":0}\n\n',
      'event: done\ndata: {"messageId":"m1","content":"Hello world","usage":{"inputTokens":1,"outputTokens":2},"elapsedMs":5}\n\n',
    ]);
    const h = recorder();
    await streamChat({ sessionId: "s", message: "m" }, h);

    expect(h.events.map((e) => e[0])).toEqual(["tool_call", "token", "token", "citations", "done"]);
    expect(h.events[1]![1]).toEqual({ delta: "Hello" });
  });

  test("reassembles a frame split across chunk boundaries", async () => {
    stubFetch(200, ['event: token\ndata: {"del', 'ta":"Hi"}\n\n', 'event: done\ndata: {"messageId":"m","content":"Hi","usage":{"inputTokens":0,"outputTokens":0},"elapsedMs":1}\n\n']);
    const h = recorder();
    await streamChat({ sessionId: "s", message: "m" }, h);

    expect(h.events[0]).toEqual(["token", { delta: "Hi" }]);
    expect(h.events.at(-1)![0]).toBe("done");
  });

  test("ignores keep-alive comment lines", async () => {
    stubFetch(200, [": ping\n\n", 'event: token\ndata: {"delta":"x"}\n\n']);
    const h = recorder();
    await streamChat({ sessionId: "s", message: "m" }, h);
    expect(h.events).toEqual([["token", { delta: "x" }]]);
  });

  test("surfaces a pre-stream error envelope through onError", async () => {
    stubFetch(404, [], { error: { code: "NOT_FOUND", message: "Conversation not found." } });
    const h = recorder();
    await streamChat({ sessionId: "missing", message: "m" }, h);
    expect(h.events).toEqual([["error", { code: "NOT_FOUND", message: "Conversation not found." }]]);
  });
});
