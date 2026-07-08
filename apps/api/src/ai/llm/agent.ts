import type { CitationDto } from "@library-chat/shared";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { StructuredToolInterface } from "@langchain/core/tools";
import {
  AIMessage,
  HumanMessage,
  anthropicPromptCachingMiddleware,
  createAgent,
} from "langchain";
import { env } from "../../config/env.js";
import { processCitations } from "../postprocess/citations.js";
import {
  ACTIVE_PROMPT_VERSION,
  getPromptSet,
  type RetrievedEntry,
  type SourceRef,
} from "../prompt/registry.js";
import { createSearchChunksTool } from "../tools/search-chunks.js";
import { getChatModel } from "./factory.js";

export interface AgentTurnInput {
  userId: string;
  sources: SourceRef[];
  history: { role: "user" | "assistant"; content: string }[];
  message: string;
  onToolCall?: (args: { query: string; documentId?: string }) => void;
  /** When provided, the turn streams: text deltas are emitted as they arrive. */
  onToken?: (delta: string) => void;
}

export interface AgentTurnResult {
  content: string;
  citations: CitationDto[];
  invalidCitations: number;
  usage: { inputTokens: number; outputTokens: number };
  promptVersion: string;
  model: string;
}

/**
 * One chat turn (docs/02): prompt construction (prompt/), model invocation
 * (this module), post-processing (postprocess/). The tool-loop budget comes
 * from config: recursionLimit ≈ 2 · AGENT_MAX_TOOL_CALLS + 1.
 */
export async function runAgentTurn(input: AgentTurnInput): Promise<AgentTurnResult> {
  const prompts = getPromptSet();
  const registry: RetrievedEntry[] = [];

  const searchTool = createSearchChunksTool({
    userId: input.userId,
    documentIds: input.sources.map((s) => s.id),
    registry,
    prompts,
    ...(input.onToolCall ? { onSearch: input.onToolCall } : {}),
  });

  const model = await getChatModel();
  const agent = createAgent({
    model: model as BaseChatModel,
    tools: [searchTool as StructuredToolInterface],
    systemPrompt: prompts.buildChatSystemPrompt(input.sources),
    // No-op on non-Anthropic providers ("ignore") — cost control (docs/02).
    middleware: [anthropicPromptCachingMiddleware({ unsupportedModelBehavior: "ignore" })],
  });

  const messages = [
    ...input.history.map((m) =>
      m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content),
    ),
    new HumanMessage(input.message),
  ];
  const config = { recursionLimit: 2 * env.AGENT_MAX_TOOL_CALLS + 1 };

  let finalText: string;
  let usage: { inputTokens: number; outputTokens: number };

  if (input.onToken) {
    // Structural cast: ReactAgent's stream overloads don't narrow to our
    // minimal shape, but the (input, {streamMode:"messages"}) call is valid.
    ({ finalText, usage } = await streamTurn(
      agent as unknown as AgentLike,
      messages,
      config,
      input.onToken,
    ));
  } else {
    const result = await agent.invoke({ messages }, config);
    const aiMessages = result.messages.filter(
      (m): m is AIMessage => m instanceof AIMessage,
    );
    finalText = messageText(aiMessages.at(-1));
    usage = aiMessages.reduce(
      (acc, m) => ({
        inputTokens: acc.inputTokens + (m.usage_metadata?.input_tokens ?? 0),
        outputTokens: acc.outputTokens + (m.usage_metadata?.output_tokens ?? 0),
      }),
      { inputTokens: 0, outputTokens: 0 },
    );
  }

  const processed = processCitations(finalText, registry);
  return {
    ...processed,
    usage,
    promptVersion: ACTIVE_PROMPT_VERSION,
    model: env.CHAT_MODEL,
  };
}

function messageText(message: AIMessage | undefined): string {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
}

/**
 * streamMode "messages" yields [chunk, metadata] per token across every model
 * call of the loop. Text is accumulated per message id; the final answer is
 * the last message that produced text. Usage: last usage_metadata per id
 * (chunks repeat partials — summing every chunk would double-count).
 */
interface AgentLike {
  stream: (
    input: { messages: unknown[] },
    config: { recursionLimit: number; streamMode: "messages" },
  ) => Promise<AsyncIterable<unknown>>;
}

async function streamTurn(
  agent: AgentLike,
  messages: unknown[],
  config: { recursionLimit: number },
  onToken: (delta: string) => void,
): Promise<{ finalText: string; usage: { inputTokens: number; outputTokens: number } }> {
  const stream = await agent.stream({ messages }, { ...config, streamMode: "messages" });

  const textById = new Map<string, string>();
  const usageById = new Map<string, { input: number; output: number }>();
  const order: string[] = [];

  for await (const item of stream as AsyncIterable<unknown>) {
    const chunk = Array.isArray(item) ? item[0] : item;
    // Real providers stream AIMessageChunk deltas; the offline fakeModel yields
    // whole AIMessage objects (one per model turn). AIMessageChunk extends
    // AIMessage, so this covers both — keeping TEST_MODE / e2e streaming honest.
    if (!(chunk instanceof AIMessage)) continue;
    const id = chunk.id ?? "message";

    if (chunk.usage_metadata) {
      // Providers split usage across chunks (input on the first, output on the
      // last) — merge by max per field instead of keeping the last snapshot.
      const prev = usageById.get(id) ?? { input: 0, output: 0 };
      usageById.set(id, {
        input: Math.max(prev.input, chunk.usage_metadata.input_tokens ?? 0),
        output: Math.max(prev.output, chunk.usage_metadata.output_tokens ?? 0),
      });
    }

    // The tool-calling turn carries no answer text for the reader — skip it so
    // its content never leaks into the streamed answer.
    const hasToolCalls = Array.isArray(chunk.tool_calls) && chunk.tool_calls.length > 0;
    const delta = chunkText(chunk);
    if (delta.length === 0 || hasToolCalls) continue;
    if (!textById.has(id)) {
      textById.set(id, "");
      order.push(id);
    }
    textById.set(id, textById.get(id)! + delta);
    onToken(delta);
  }

  const lastId = order.at(-1);
  const usage = [...usageById.values()].reduce(
    (acc, u) => ({
      inputTokens: acc.inputTokens + u.input,
      outputTokens: acc.outputTokens + u.output,
    }),
    { inputTokens: 0, outputTokens: 0 },
  );
  return { finalText: lastId ? (textById.get(lastId) ?? "") : "", usage };
}

function chunkText(chunk: AIMessage): string {
  if (typeof chunk.content === "string") return chunk.content;
  if (!Array.isArray(chunk.content)) return "";
  return chunk.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}
