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

  const result = await agent.invoke(
    { messages },
    { recursionLimit: 2 * env.AGENT_MAX_TOOL_CALLS + 1 },
  );

  const aiMessages = result.messages.filter((m): m is AIMessage => m instanceof AIMessage);
  const finalText = messageText(aiMessages.at(-1));
  const usage = aiMessages.reduce(
    (acc, m) => ({
      inputTokens: acc.inputTokens + (m.usage_metadata?.input_tokens ?? 0),
      outputTokens: acc.outputTokens + (m.usage_metadata?.output_tokens ?? 0),
    }),
    { inputTokens: 0, outputTokens: 0 },
  );

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
  return message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
}
