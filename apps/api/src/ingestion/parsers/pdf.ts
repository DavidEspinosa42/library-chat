import { extractText } from "unpdf";
import { normalizeWhitespace } from "./html-text.js";
import type { ParsedDocument } from "./types.js";

/** PDFs give us no reliable structure — one section, no location trail (docs/03). */
export async function parsePdf(buffer: Buffer): Promise<ParsedDocument> {
  const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
  return { sections: [{ title: null, text: normalizeWhitespace(text) }] };
}
