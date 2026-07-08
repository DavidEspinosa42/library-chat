import { normalizeWhitespace } from "./html-text.js";
import type { ParsedDocument, ParsedSection } from "./types.js";

/**
 * SRT/VTT transcripts: cues are grouped into ~5-minute sections whose title is
 * the section's start timestamp — citations then point at a moment in time.
 */
const SECTION_SECONDS = 300;

// "HH:MM:SS,mmm --> …" (srt) or "[HH:]MM:SS.mmm --> …" (vtt; hours optional).
const CUE_TIME = /^(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,]\d{1,3}\s*-->/;

export async function parseSubtitles(buffer: Buffer): Promise<ParsedDocument> {
  let raw = buffer.toString("utf-8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1); // strip BOM
  const lines = raw.split(/\r?\n/);

  const cues: { start: number; text: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = CUE_TIME.exec(lines[i]!.trim());
    if (!m) continue; // skips srt indexes, WEBVTT header, NOTE/STYLE blocks
    const start = Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    const textLines: string[] = [];
    while (i + 1 < lines.length && lines[i + 1]!.trim().length > 0) {
      i += 1;
      textLines.push(lines[i]!.replace(/<[^>]+>/g, " "));
    }
    const text = normalizeWhitespace(textLines.join(" "));
    if (text.length > 0) cues.push({ start, text });
  }

  const sections: ParsedSection[] = [];
  let current: string[] = [];
  let sectionStart = 0;
  for (const cue of cues) {
    if (current.length > 0 && cue.start >= sectionStart + SECTION_SECONDS) {
      sections.push({ title: formatTimestamp(sectionStart), text: current.join(" ") });
      current = [];
    }
    if (current.length === 0) sectionStart = cue.start;
    current.push(cue.text);
  }
  if (current.length > 0) {
    sections.push({ title: formatTimestamp(sectionStart), text: current.join(" ") });
  }
  return { sections };
}

function formatTimestamp(totalSeconds: number): string {
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}
