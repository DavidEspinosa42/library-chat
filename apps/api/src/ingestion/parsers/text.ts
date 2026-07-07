import { normalizeWhitespace } from "./html-text.js";
import type { ParsedDocument, ParsedSection } from "./types.js";

const MD_HEADING = /^#{1,6}\s+(.+)$/;
// Plain-text book conventions (Project Gutenberg et al.):
// "CHAPTER IV", "Book II", … and bare roman-numeral headings: "I. Laying Plans".
const TXT_HEADING = /^\s*(chapter|book|part|section)\s+[\divxlc]+\.?.{0,80}$/i;
const ROMAN_HEADING = /^\s*[IVXLCDM]{1,7}\.\s+[A-Z][^\n]{1,78}[^.\s]$/;

/** txt/md/pasted text: split into sections on headings for the location trail. */
export async function parseText(buffer: Buffer): Promise<ParsedDocument> {
  const raw = normalizeWhitespace(buffer.toString("utf-8"));
  const lines = raw.split("\n");

  const sections: ParsedSection[] = [];
  let title: string | null = null;
  let acc: string[] = [];

  const flush = () => {
    const text = acc.join("\n").trim();
    if (text.length > 0) sections.push({ title, text });
    acc = [];
  };

  for (const line of lines) {
    const md = MD_HEADING.exec(line);
    const heading =
      md?.[1] ??
      (TXT_HEADING.test(line) || ROMAN_HEADING.test(line) ? line.trim() : null);
    if (heading) {
      flush();
      title = heading.slice(0, 120);
    } else {
      acc.push(line);
    }
  }
  flush();

  if (sections.length === 0) sections.push({ title: null, text: raw });
  return { sections };
}
