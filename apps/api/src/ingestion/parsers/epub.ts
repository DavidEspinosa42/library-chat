import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initEpubFile } from "@lingo-reader/epub-parser";
import { firstHeading, htmlToText } from "./html-text.js";
import type { ParsedDocument, ParsedSection } from "./types.js";

/** EPUB: one section per spine chapter; titles from chapter headings. */
export async function parseEpub(buffer: Buffer): Promise<ParsedDocument> {
  // The parser writes embedded resources (images) to disk — send them to a temp dir.
  const resourceDir = await mkdtemp(join(tmpdir(), "library-chat-epub-"));
  try {
    const epub = await initEpubFile(new Uint8Array(buffer), resourceDir);
    const metadataTitle = epub.getMetadata().title || undefined;

    const sections: ParsedSection[] = [];
    for (const [i, item] of epub.getSpine().entries()) {
      const chapter = await epub.loadChapter(item.id);
      const text = htmlToText(chapter.html);
      if (text.length === 0) continue;
      sections.push({ title: firstHeading(chapter.html) ?? `Chapter ${i + 1}`, text });
    }
    return { metadataTitle, sections };
  } finally {
    await rm(resourceDir, { recursive: true, force: true });
  }
}
