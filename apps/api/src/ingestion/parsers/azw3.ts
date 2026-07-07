import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initKf8File } from "@lingo-reader/mobi-parser";
import { firstHeading, htmlToText } from "./html-text.js";
import type { ParsedDocument, ParsedSection } from "./types.js";

/** AZW3 (Kindle KF8): one section per spine chapter, like epub. */
export async function parseAzw3(buffer: Buffer): Promise<ParsedDocument> {
  const resourceDir = await mkdtemp(join(tmpdir(), "library-chat-azw3-"));
  try {
    const kf8 = await initKf8File(new Uint8Array(buffer), resourceDir);
    const metadataTitle = kf8.getMetadata().title || undefined;

    const sections: ParsedSection[] = [];
    for (const [i, item] of kf8.getSpine().entries()) {
      const chapter = kf8.loadChapter(item.id);
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
