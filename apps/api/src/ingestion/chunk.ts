import { getEncoding, type Tiktoken } from "js-tiktoken";
import type { ParsedDocument } from "./parsers/types.js";

export interface Chunk {
  idx: number;
  content: string;
  location: string | null;
  tokenCount: number;
}

export interface ChunkOptions {
  /** Target chunk size in tokens (env CHUNK_TOKENS). */
  chunkTokens: number;
  /** Overlap carried from the previous chunk, in percent (env CHUNK_OVERLAP_PCT). */
  overlapPct: number;
}

let encoder: Tiktoken | undefined;
function enc(): Tiktoken {
  // cl100k_base as a stable approximation; Voyage uses its own tokenizer, so
  // budgets keep a safety margin (docs/01).
  encoder ??= getEncoding("cl100k_base");
  return encoder;
}

export function countTokens(text: string): number {
  return enc().encode(text).length;
}

/**
 * Structure-aware chunking (docs/01): sections first (headings become the
 * citation `location`), paragraphs packed up to ~chunkTokens, sliding overlap
 * between consecutive chunks of the same section. Oversized paragraphs fall
 * back to sentence packing.
 */
export function chunkDocument(doc: ParsedDocument, opts: ChunkOptions): Chunk[] {
  const chunks: Chunk[] = [];
  const overlapTokens = Math.floor((opts.chunkTokens * opts.overlapPct) / 100);

  for (const section of doc.sections) {
    const pieces = splitIntoPieces(section.text, opts.chunkTokens);

    let current: string[] = [];
    let currentTokens = 0;

    const flush = () => {
      const content = current.join("\n\n").trim();
      if (content.length === 0) return;
      chunks.push({
        idx: chunks.length,
        content,
        location: section.title,
        tokenCount: countTokens(content),
      });
    };

    for (const piece of pieces) {
      const pieceTokens = countTokens(piece);
      if (currentTokens + pieceTokens > opts.chunkTokens && current.length > 0) {
        flush();
        // Sliding overlap: seed the next chunk with the tail of the previous one.
        const tail = takeTail(current, overlapTokens);
        current = tail;
        currentTokens = countTokens(tail.join("\n\n"));
      }
      current.push(piece);
      currentTokens += pieceTokens;
    }
    flush();
  }

  return chunks;
}

/** Paragraphs; any paragraph larger than the budget is split by sentences. */
function splitIntoPieces(text: string, maxTokens: number): string[] {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const pieces: string[] = [];
  for (const p of paragraphs) {
    if (countTokens(p) <= maxTokens) {
      pieces.push(p);
      continue;
    }
    let acc = "";
    for (const sentence of p.split(/(?<=[.!?])\s+/)) {
      const candidate = acc.length > 0 ? `${acc} ${sentence}` : sentence;
      if (countTokens(candidate) > maxTokens && acc.length > 0) {
        pieces.push(acc);
        acc = sentence;
      } else {
        acc = candidate;
      }
    }
    if (acc.length > 0) pieces.push(acc);
  }
  return pieces;
}

function takeTail(pieces: string[], budgetTokens: number): string[] {
  if (budgetTokens <= 0) return [];
  const tail: string[] = [];
  let used = 0;
  for (let i = pieces.length - 1; i >= 0; i--) {
    const piece = pieces[i];
    if (piece === undefined) continue;
    const t = countTokens(piece);
    if (used + t > budgetTokens) break;
    tail.unshift(piece);
    used += t;
  }
  return tail;
}
