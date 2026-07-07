import type { DocumentFormat } from "@library-chat/shared";
import { parseAzw3 } from "./azw3.js";
import { parseEpub } from "./epub.js";
import { parsePdf } from "./pdf.js";
import { parseText } from "./text.js";
import type { ParsedDocument, Parser } from "./types.js";

const parsers: Record<DocumentFormat, Parser> = {
  pdf: parsePdf,
  txt: parseText,
  md: parseText,
  epub: parseEpub,
  azw3: parseAzw3,
};

export function parseDocument(
  buffer: Buffer,
  format: DocumentFormat,
): Promise<ParsedDocument> {
  return parsers[format](buffer);
}

export type { ParsedDocument, ParsedSection } from "./types.js";
