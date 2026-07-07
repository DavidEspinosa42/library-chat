import { VoyageAIClient } from "voyageai";
import { env } from "../../config/env.js";
import type { EmbeddingsProvider } from "./types.js";

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1_000;

/**
 * voyage-context-4 adapter (docs/02). Own chunker → `enableAutoChunking: false`.
 * One API call per group; 429/5xx retried with exponential backoff + jitter.
 */
export class VoyageEmbeddings implements EmbeddingsProvider {
  private readonly client: VoyageAIClient;

  constructor(apiKey: string) {
    this.client = new VoyageAIClient({ apiKey });
  }

  async embedChunkGroups(groups: string[][]): Promise<number[][][]> {
    const result: number[][][] = [];
    for (const group of groups) {
      const response = await this.callWithRetry(() =>
        this.client.contextualizedEmbed({
          inputs: [group],
          model: env.EMBEDDING_MODEL,
          inputType: "document",
          outputDimension: env.EMBEDDING_DIM,
          enableAutoChunking: false,
        }),
      );
      const vectors = response.results[0]?.embeddings ?? [];
      if (vectors.length !== group.length || vectors.some((v) => v.length === 0)) {
        throw new Error(
          `Voyage returned ${vectors.length} embeddings for a group of ${group.length} chunks`,
        );
      }
      result.push(vectors);
    }
    return result;
  }

  async embedQuery(text: string): Promise<number[]> {
    const response = await this.callWithRetry(() =>
      this.client.contextualizedEmbed({
        inputs: [[text]],
        model: env.EMBEDDING_MODEL,
        inputType: "query",
        outputDimension: env.EMBEDDING_DIM,
        enableAutoChunking: false,
      }),
    );
    const vector = response.results[0]?.embeddings[0];
    if (!vector || vector.length === 0) {
      throw new Error("Voyage returned no embedding for the query");
    }
    return vector;
  }

  private async callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        if (!isRetryable(err) || attempt === MAX_RETRIES - 1) throw err;
        const delay = BASE_DELAY_MS * 2 ** attempt + Math.random() * 500;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastError;
  }
}

function isRetryable(err: unknown): boolean {
  const status = (err as { statusCode?: number }).statusCode;
  return status === 429 || (typeof status === "number" && status >= 500);
}
