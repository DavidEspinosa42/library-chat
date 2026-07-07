import { env } from "../../config/env.js";
import { FakeEmbeddings } from "./fake.js";
import type { EmbeddingsProvider } from "./types.js";
import { VoyageEmbeddings } from "./voyage.js";

let instance: EmbeddingsProvider | undefined;

/** Same factory for prod and tests — TEST_MODE swaps the implementation (docs/02). */
export function getEmbeddings(): EmbeddingsProvider {
  if (!instance) {
    instance = env.TEST_MODE
      ? new FakeEmbeddings()
      : new VoyageEmbeddings(requireKey());
  }
  return instance;
}

function requireKey(): string {
  if (!env.VOYAGE_API_KEY) {
    // env.ts already fails fast on this; double guard for type narrowing.
    throw new Error("VOYAGE_API_KEY is required when TEST_MODE is off");
  }
  return env.VOYAGE_API_KEY;
}
