import WordExtractor from "word-extractor";
import { parseText } from "./text.js";
import type { ParsedDocument } from "./types.js";

/**
 * Legacy OLE .doc via word-extractor (pure JS, no Word install needed).
 * The extracted plain text goes through the text parser so its heading
 * heuristics (CHAPTER …, roman numerals) still produce a location trail.
 */
export async function parseDoc(buffer: Buffer): Promise<ParsedDocument> {
  const doc = await new WordExtractor().extract(buffer);
  return parseText(Buffer.from(doc.getBody(), "utf-8"));
}
