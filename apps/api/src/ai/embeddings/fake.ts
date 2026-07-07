import { env } from "../../config/env.js";
import type { EmbeddingsProvider } from "./types.js";

/**
 * Deterministic offline embedder for TEST_MODE (docs/02): same text → same
 * vector, similar-token texts land near each other (bag-of-token-hashes), so
 * retrieval ordering is stable across runs without any network.
 */
export class FakeEmbeddings implements EmbeddingsProvider {
  async embedChunkGroups(groups: string[][]): Promise<number[][][]> {
    return groups.map((group) => group.map((text) => pseudoVector(text)));
  }

  async embedQuery(text: string): Promise<number[]> {
    return pseudoVector(text);
  }
}

function pseudoVector(text: string): number[] {
  const dim = env.EMBEDDING_DIM;
  const vector = new Array<number>(dim).fill(0);
  for (const token of text.toLowerCase().split(/\W+/)) {
    if (token.length === 0) continue;
    const h = fnv1a(token);
    vector[h % dim] = (vector[h % dim] ?? 0) + 1;
  }
  const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0)) || 1;
  return vector.map((v) => v / norm);
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
