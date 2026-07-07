import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, fakeModel, initChatModel } from "langchain";
import { env } from "../../config/env.js";

/**
 * Model invocation layer (docs/02). The ONLY module that knows providers
 * exist: models are env-driven `provider:model` strings resolved through
 * LangChain's universal `initChatModel`. TEST_MODE swaps in scripted fakes
 * through this same factory — tests and prod share one pipeline.
 */

let chatModelPromise: Promise<BaseChatModel> | undefined;

export function getChatModel(): Promise<BaseChatModel> {
  if (env.TEST_MODE) {
    // Fresh instance per turn — fake response queues are consumed on use.
    return Promise.resolve(buildTestChatModel());
  }
  chatModelPromise ??= initChatModel(env.CHAT_MODEL, {
    maxTokens: env.MAX_TOKENS_CHAT,
  });
  return chatModelPromise;
}

/**
 * Deterministic offline chat model: one retrieval call, then a cited answer.
 * Keeps the full stack (and the e2e suite) functional without any API key.
 */
function buildTestChatModel(): BaseChatModel {
  return fakeModel()
    .respondWithTools([
      { name: "search_chunks", args: { query: "key ideas main topic" }, id: "call_1" },
    ])
    .respond(
      new AIMessage(
        "Based on the selected sources, the passage most relevant to your question is cited here [1].",
      ),
    ) as unknown as BaseChatModel;
}
