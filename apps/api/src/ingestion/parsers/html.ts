import { normalizeWhitespace, splitHtmlSections } from "./html-text.js";
import type { ParsedDocument } from "./types.js";

/** Standalone HTML page: <title> as metadata title, sections split at headings. */
export async function parseHtml(buffer: Buffer): Promise<ParsedDocument> {
  const raw = buffer.toString("utf-8");
  const titleText = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw)?.[1];
  const title = titleText
    ? normalizeWhitespace(titleText.replace(/<[^>]+>/g, " ")).slice(0, 120)
    : "";
  const body = raw.replace(/<head[\s\S]*?<\/head>/i, " ");
  return {
    metadataTitle: title.length > 0 ? title : undefined,
    sections: splitHtmlSections(body),
  };
}
