import { convertToHtml } from "mammoth";
import { splitHtmlSections } from "./html-text.js";
import type { ParsedDocument } from "./types.js";

/** DOCX via mammoth: docx → semantic HTML → sections split at headings. */
export async function parseDocx(buffer: Buffer): Promise<ParsedDocument> {
  const { value: html } = await convertToHtml({ buffer });
  return { sections: splitHtmlSections(html) };
}
