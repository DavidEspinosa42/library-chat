import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { parseHtml } from "./html.js";
import { parseSubtitles } from "./subtitles.js";
import { parseText } from "./text.js";
import { parseDocument } from "./index.js";

const buf = (s: string) => Buffer.from(s, "utf-8");
const seed = (name: string) =>
  readFile(fileURLToPath(new URL(`../../../../../seed/${name}`, import.meta.url)));

describe("text parser (txt/md)", () => {
  test("splits markdown headings into sections used as the location trail", async () => {
    const { sections } = await parseText(
      buf("# Introduction\n\nHello world.\n\n## Details\n\nMore text here."),
    );
    expect(sections.map((s) => s.title)).toEqual(["Introduction", "Details"]);
    expect(sections[0]?.text).toContain("Hello world.");
  });

  test("recognizes roman-numeral chapter headings in plain prose", async () => {
    const { sections } = await parseText(
      buf("I. Laying Plans\n\nAll warfare is based on deception.\n\nII. Waging War\n\nIn war, speed matters."),
    );
    expect(sections.map((s) => s.title)).toEqual(["I. Laying Plans", "II. Waging War"]);
  });

  test("falls back to a single untitled section when there are no headings", async () => {
    const { sections } = await parseText(buf("Just a flat paragraph with no structure."));
    expect(sections).toHaveLength(1);
    expect(sections[0]?.title).toBeNull();
  });
});

describe("html parser", () => {
  test("uses <title> as metadata title and splits at headings", async () => {
    const { metadataTitle, sections } = await parseHtml(
      buf("<html><head><title>My Page</title></head><body><h1>Alpha</h1><p>First.</p><h2>Beta</h2><p>Second.</p></body></html>"),
    );
    expect(metadataTitle).toBe("My Page");
    expect(sections.map((s) => s.title)).toEqual(["Alpha", "Beta"]);
    expect(sections[1]?.text).toContain("Second.");
  });
});

describe("subtitle parser (srt/vtt)", () => {
  test("groups srt cues into time-stamped sections", async () => {
    const srt = "1\n00:00:01,000 --> 00:00:04,000\nHello there.\n\n2\n00:00:05,000 --> 00:00:07,000\nGeneral Kenobi.\n";
    const { sections } = await parseSubtitles(buf(srt));
    expect(sections).toHaveLength(1);
    expect(sections[0]?.title).toBe("00:00:01");
    expect(sections[0]?.text).toBe("Hello there. General Kenobi.");
  });

  test("parses vtt cues (optional hours) and strips inline tags", async () => {
    const vtt = "WEBVTT\n\n00:01.000 --> 00:03.000\n<v Roger>Hi <b>world</b>\n";
    const { sections } = await parseSubtitles(buf(vtt));
    expect(sections[0]?.text).toBe("Hi world");
  });

  test("starts a new section past the ~5-minute boundary", async () => {
    const srt =
      "1\n00:00:01,000 --> 00:00:04,000\nEarly.\n\n" +
      "2\n00:06:00,000 --> 00:06:03,000\nLater.\n";
    const { sections } = await parseSubtitles(buf(srt));
    expect(sections.map((s) => s.title)).toEqual(["00:00:01", "00:06:00"]);
  });
});

/**
 * Integration over the real demo corpus (docs/05): every seed file parses to
 * non-empty text through the format router. Slow-ish (real epub/pdf/doc) but
 * the strongest regression guard on the ingestion front-end.
 */
describe("seed corpus integration", () => {
  const cases: [string, "pdf" | "docx" | "txt" | "md" | "srt" | "epub"][] = [
    ["Sun Tzu - The Art of War.txt", "txt"],
    ["Benjamin Franklin - Autobiography.md", "md"],
    ["P.T. Barnum - The Art Of Money Getting.pdf", "pdf"],
    ["Remote Work Policy.docx", "docx"],
    ["Inside the Mind of Anthropic CEO Dario Amodei.srt", "srt"],
    ["Marcus Aurelius - Meditations.epub", "epub"],
  ];

  test.each(cases)("parses %s into sections with real text", async (file, format) => {
    const parsed = await parseDocument(await seed(file), format);
    expect(parsed.sections.length).toBeGreaterThan(0);
    const total = parsed.sections.reduce((n, s) => n + s.text.length, 0);
    expect(total).toBeGreaterThan(500);
  });
});
