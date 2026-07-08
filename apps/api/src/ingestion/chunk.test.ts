import { describe, expect, test } from "vitest";
import { chunkDocument, countTokens } from "./chunk.js";
import type { ParsedDocument } from "./parsers/types.js";

const OPTS = { chunkTokens: 100, overlapPct: 15 };

function doc(sections: ParsedDocument["sections"]): ParsedDocument {
  return { sections };
}

describe("chunkDocument", () => {
  test("carries the section title as each chunk's location", () => {
    const chunks = chunkDocument(
      doc([{ title: "I. Laying Plans", text: "All warfare is based on deception." }]),
      OPTS,
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ idx: 0, location: "I. Laying Plans" });
    expect(chunks[0]?.content).toContain("deception");
  });

  test("packs paragraphs up to the token budget, splitting into multiple chunks", () => {
    const para = (n: number) => `Paragraph ${n}. ${"word ".repeat(40).trim()}.`;
    const text = [para(1), para(2), para(3), para(4)].join("\n\n");
    const chunks = chunkDocument(doc([{ title: null, text }]), OPTS);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      // Budget is a target, not a hard cap (overlap can nudge it) — allow margin.
      expect(chunk.tokenCount).toBeLessThanOrEqual(OPTS.chunkTokens + 60);
    }
  });

  test("consecutive chunks of a section share an overlapping tail", () => {
    // Short paragraphs (~10 tokens) so the last one of a chunk fits the 15-token
    // overlap budget and is carried forward to seed the next chunk.
    const paragraphs = Array.from({ length: 24 }, (_, i) => `Para${i} short body line here.`);
    const chunks = chunkDocument(doc([{ title: "S", text: paragraphs.join("\n\n") }]), OPTS);

    expect(chunks.length).toBeGreaterThan(1);
    const first = chunks[0]!.content;
    const second = chunks[1]!.content;
    // The tail of the first chunk (one or more whole paragraphs that fit the
    // overlap budget) seeds the start of the second chunk.
    const secondHeadParagraph = second.split("\n\n")[0]!;
    expect(first).toContain(secondHeadParagraph);
    expect(first.endsWith(secondHeadParagraph) || first.includes(`${secondHeadParagraph}\n\n`)).toBe(true);
  });

  test("splits an oversized paragraph on sentence boundaries", () => {
    const huge = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} carries several tokens here.`).join(" ");
    const chunks = chunkDocument(doc([{ title: null, text: huge }]), OPTS);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(OPTS.chunkTokens + 60);
    }
    // Every sentence survives the split somewhere.
    expect(chunks.map((c) => c.content).join(" ")).toContain("Sentence number 29");
  });

  test("keeps sections separate — a chunk never mixes two locations", () => {
    const chunks = chunkDocument(
      doc([
        { title: "Book I", text: "First section body." },
        { title: "Book II", text: "Second section body." },
      ]),
      OPTS,
    );
    expect(chunks.map((c) => c.location)).toEqual(["Book I", "Book II"]);
  });

  test("counts tokens deterministically for the same text", () => {
    expect(countTokens("hello world")).toBe(countTokens("hello world"));
    expect(countTokens("hello world")).toBeGreaterThan(0);
  });

  test("assigns contiguous chunk indexes across sections", () => {
    const chunks = chunkDocument(
      doc([
        { title: "A", text: "alpha body text." },
        { title: "B", text: "beta body text." },
        { title: "C", text: "gamma body text." },
      ]),
      OPTS,
    );
    expect(chunks.map((c) => c.idx)).toEqual([0, 1, 2]);
  });
});
