import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { HumanMessage } from "@langchain/core/messages";
import { AIMessage, createAgent, fakeModel, tool } from "langchain";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { isAiMessage } from "./llm/agent.js";
import { processCitations } from "./postprocess/citations.js";
import { getPromptSet, type RetrievedEntry } from "./prompt/registry.js";
import { NO_EVIDENCE, OUT_OF_SCOPE } from "./prompt/templates.js";

/**
 * Phase 2 smoke test: agent wiring + prompt envelope + citation post-processing,
 * fully offline via LangChain's scripted fakeModel (docs/02 test-mode story).
 */

const prompts = getPromptSet();

function makeStubSearchTool(registry: RetrievedEntry[]) {
  return tool(
    async ({ query: _query }: { query: string }) => {
      const entry: RetrievedEntry = {
        n: registry.length + 1,
        chunkId: "3f0e2f9e-58a2-4f5f-9d2e-1c9a35b6a111",
        documentId: "9a7b6c5d-4e3f-4a2b-8c1d-0e9f8a7b6c5d",
        documentTitle: "The Art of War",
        location: "I. Laying Plans",
        content: "All warfare is based on deception.",
      };
      registry.push(entry);
      return prompts.formatSearchResults([entry]);
    },
    {
      name: "search_chunks",
      description: "stub retrieval",
      schema: z.object({ query: z.string() }),
    },
  );
}

describe("agent flow (scripted fake model)", () => {
  test("tool call → cited answer; invented markers stripped and flagged", async () => {
    const registry: RetrievedEntry[] = [];
    const model = fakeModel()
      .respondWithTools([
        { name: "search_chunks", args: { query: "deception" }, id: "call_1" },
      ])
      .respond(
        new AIMessage("Sun Tzu grounds strategy in deception [1], not fortune [7]."),
      );

    const agent = createAgent({
      model: model as unknown as BaseChatModel,
      tools: [makeStubSearchTool(registry) as StructuredToolInterface],
      systemPrompt: prompts.buildChatSystemPrompt([
        { id: "9a7b6c5d-4e3f-4a2b-8c1d-0e9f8a7b6c5d", title: "The Art of War" },
      ]),
    });

    const result = await agent.invoke(
      { messages: [{ role: "user", content: "What is strategy based on?" }] },
      { recursionLimit: 9 },
    );

    const lastAi = result.messages.filter((m) => m instanceof AIMessage).at(-1);
    const processed = processCitations(String(lastAi?.content), registry);

    expect(model.callCount).toBe(2); // tool turn + answer turn
    expect(registry).toHaveLength(1);
    expect(processed.content).toContain("[1]");
    expect(processed.content).not.toContain("[7]");
    expect(processed.invalidCitations).toBe(1);
    expect(processed.citations).toHaveLength(1);
    expect(processed.citations[0]).toMatchObject({
      n: 1,
      documentTitle: "The Art of War",
      location: "I. Laying Plans",
    });
  });
});

describe("isAiMessage (copy-safe streaming filter)", () => {
  test("recognizes a real AIMessage", () => {
    expect(isAiMessage(new AIMessage("hi"))).toBe(true);
  });

  test("recognizes an AI message even when it is NOT instanceof AIMessage", () => {
    // Simulates langgraph's streamed AIMessageChunk, which comes from a different
    // @langchain/core copy — `instanceof AIMessage` is false, but getType() is "ai".
    // This is the exact shape that silently dropped every streamed token.
    const chunkFromOtherCopy = { getType: () => "ai", content: "token" };
    expect(chunkFromOtherCopy instanceof AIMessage).toBe(false);
    expect(isAiMessage(chunkFromOtherCopy)).toBe(true);
  });

  test("rejects non-AI messages and junk", () => {
    expect(isAiMessage(new HumanMessage("hi"))).toBe(false);
    expect(isAiMessage({ getType: () => "human" })).toBe(false);
    expect(isAiMessage(null)).toBe(false);
    expect(isAiMessage("nope")).toBe(false);
  });
});

describe("prompt module", () => {
  test("literal templates are locked (evals match them exactly)", () => {
    expect(NO_EVIDENCE).toBe(
      "I couldn't find information about this in the selected documents.",
    );
    expect(OUT_OF_SCOPE).toBe(
      "I can only answer questions about the documents you've selected. Please ask something related to their content.",
    );
  });

  test("system prompt embeds sources and both templates", () => {
    const sp = prompts.buildChatSystemPrompt([{ id: "id-1", title: "Meditations" }]);
    expect(sp).toContain('"Meditations" (documentId: id-1)');
    expect(sp).toContain(NO_EVIDENCE);
    expect(sp).toContain(OUT_OF_SCOPE);
  });

  test("search results use the low-trust envelope with numbering", () => {
    const out = prompts.formatSearchResults([
      {
        n: 3,
        chunkId: "c",
        documentId: "d",
        documentTitle: 'He said "run"',
        location: null,
        content: "text",
      },
    ]);
    expect(out).toContain('<document-content n="3"');
    expect(out).toContain("source=\"He said 'run'\""); // quotes escaped in attrs
    expect(out).toContain("</document-content>");
  });
});

describe("citation post-processing", () => {
  test("answers starting with a template are truncated to exactly the template", () => {
    const r = processCitations(
      `${NO_EVIDENCE}\n\nHowever, here is some helpful elaboration [1].`,
      [],
    );
    expect(r).toEqual({ content: NO_EVIDENCE, citations: [], invalidCitations: 0 });
  });

  test("no markers → no citations, text untouched", () => {
    const r = processCitations("Plain answer.", []);
    expect(r).toEqual({ content: "Plain answer.", citations: [], invalidCitations: 0 });
  });

  test("repeated markers are deduplicated in the citation list", () => {
    const registry: RetrievedEntry[] = [
      {
        n: 1,
        chunkId: "a",
        documentId: "b",
        documentTitle: "T",
        location: null,
        content: "x".repeat(700),
      },
    ];
    const r = processCitations("First [1], and again [1].", registry);
    expect(r.citations).toHaveLength(1);
    expect(r.citations[0]?.snippet.length).toBeLessThanOrEqual(601); // capped + ellipsis
  });

  test("cited markers are renumbered 1..N in first-appearance order", () => {
    const entry = (n: number): RetrievedEntry => ({
      n,
      chunkId: `chunk-${n}`,
      documentId: "d",
      documentTitle: "T",
      location: null,
      content: `content ${n}`,
    });
    // Registry numbers everything retrieved (with gaps left by unused chunks).
    const registry = [entry(3), entry(9), entry(17)];
    const r = processCitations("Claim [17], then [3], and again [17].", registry);
    expect(r.content).toBe("Claim [1], then [2], and again [1].");
    expect(r.citations.map((c) => ({ n: c.n, chunkId: c.chunkId }))).toEqual([
      { n: 1, chunkId: "chunk-17" },
      { n: 2, chunkId: "chunk-3" },
    ]);
    expect(r.invalidCitations).toBe(0);
  });
});
