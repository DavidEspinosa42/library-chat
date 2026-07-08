import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initMobiFile } from "@lingo-reader/mobi-parser";
import { firstHeading, htmlToText } from "./html-text.js";
import type { ParsedDocument, ParsedSection } from "./types.js";

/** Kindle MOBI: one section per spine chapter, like epub. */
export async function parseMobi(buffer: Buffer): Promise<ParsedDocument> {
  const resourceDir = await mkdtemp(join(tmpdir(), "library-chat-mobi-"));
  try {
    const book = await initMobiFile(new Uint8Array(buffer), resourceDir);
    const metadataTitle = book.getMetadata().title || undefined;

    const sections: ParsedSection[] = [];
    for (const [i, item] of book.getSpine().entries()) {
      let chapter: { html: string } | undefined;
      try {
        chapter = book.loadChapter(item.id);
      } catch {
        // A malformed chapter should cost us that chapter, not the whole book.
        // If every chapter fails, the empty result fails ingestion downstream.
        continue;
      }
      if (!chapter) continue;
      const text = htmlToText(chapter.html);
      if (text.length === 0) continue;
      sections.push({ title: firstHeading(chapter.html) ?? `Chapter ${i + 1}`, text });
    }
    return { metadataTitle, sections };
  } finally {
    await rm(resourceDir, { recursive: true, force: true });
  }
}
