import type { DocumentFormat } from "@library-chat/shared";

/** Common output of every format parser (docs/01 — ingestion pipeline). */
export interface ParsedSection {
  /** Heading trail used as citation `location` (e.g. "Book V" / "Chapter 8"). */
  title: string | null;
  text: string;
}

export interface ParsedDocument {
  /** Document title suggested by the file's own metadata, when it has any. */
  metadataTitle?: string;
  sections: ParsedSection[];
}

export type Parser = (buffer: Buffer) => Promise<ParsedDocument>;
export type ParserFormat = DocumentFormat;
