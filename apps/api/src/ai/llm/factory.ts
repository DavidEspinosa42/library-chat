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
let extractionModelPromise: Promise<BaseChatModel> | undefined;
let judgeModelPromise: Promise<BaseChatModel> | undefined;

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
 * Extraction model, or null in TEST_MODE — structured output can't be usefully
 * scripted through fakeModel, so the extraction job produces a deterministic
 * card offline instead (see ai/extraction/extract.ts).
 */
export function getExtractionModel(): Promise<BaseChatModel> | null {
  if (env.TEST_MODE) return null;
  extractionModelPromise ??= initChatModel(env.EXTRACTION_MODEL, {
    maxTokens: env.MAX_TOKENS_EXTRACTION,
  });
  return extractionModelPromise;
}

/**
 * Eval judge model (docs/02): Sonnet 5 by default — deliberately stronger than
 * the judged Haiku to catch subtle faithfulness errors. Only used by `pnpm eval`
 * (live, keyed); never on the request path, so it has no TEST_MODE fake.
 */
export function getJudgeModel(): Promise<BaseChatModel> {
  judgeModelPromise ??= initChatModel(env.JUDGE_MODEL, { maxTokens: 1024 });
  return judgeModelPromise;
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
