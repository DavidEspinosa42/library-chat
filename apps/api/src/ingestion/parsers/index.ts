import type { DocumentFormat } from "@library-chat/shared";
import { parseDoc } from "./doc.js";
import { parseDocx } from "./docx.js";
import { parseEpub } from "./epub.js";
import { parseHtml } from "./html.js";
import { parseMobi } from "./mobi.js";
import { parsePdf } from "./pdf.js";
import { parseSubtitles } from "./subtitles.js";
import { parseText } from "./text.js";
import type { ParsedDocument, Parser } from "./types.js";

const parsers: Record<DocumentFormat, Parser> = {
  pdf: parsePdf,
  docx: parseDocx,
  doc: parseDoc,
  txt: parseText,
  md: parseText,
  html: parseHtml,
  epub: parseEpub,
  mobi: parseMobi,
  srt: parseSubtitles,
  vtt: parseSubtitles,
};

export function parseDocument(
  buffer: Buffer,
  format: DocumentFormat,
): Promise<ParsedDocument> {
  return parsers[format](buffer);
}

export type { ParsedDocument, ParsedSection } from "./types.js";
