import { describe, expect, test } from "vitest";
import { parseExtractionCard } from "./extract.js";

const valid = {
  docType: "book",
  title: "The Art of War",
  author: "Sun Tzu",
  language: "English",
  summary: "A classic treatise on strategy. It covers deception, terrain and leadership.",
  themes: ["strategy", "war"],
  keyEntities: [{ type: "person", value: "Sun Tzu" }],
  starterQuestions: ["What is the central idea?", "How does it treat deception?", "Who should read it?"],
};

describe("parseExtractionCard", () => {
  test("parses a well-formed JSON card", () => {
    const card = parseExtractionCard(JSON.stringify(valid), "fallback");
    expect(card.title).toBe("The Art of War");
    expect(card.docType).toBe("book");
  });

  test("tolerates prose and code fences around the JSON object", () => {
    const wrapped = "Here is the card:\n```json\n" + JSON.stringify(valid) + "\n```\nDone.";
    expect(parseExtractionCard(wrapped, "fallback").title).toBe("The Art of War");
  });

  test("rejects a response with no JSON object", () => {
    expect(() => parseExtractionCard("I cannot help with that.", "fallback")).toThrow(/no JSON object/);
  });

  test("falls back to the stored title when the model returns a null title", () => {
    const card = parseExtractionCard(JSON.stringify({ ...valid, title: null }), "Stored Title");
    expect(card.title).toBe("Stored Title");
  });

  test("coerces an out-of-taxonomy docType to 'other'", () => {
    const card = parseExtractionCard(JSON.stringify({ ...valid, docType: "screenplay" }), "fallback");
    expect(card.docType).toBe("other");
  });

  test("clamps overflowing themes and starterQuestions instead of rejecting", () => {
    const card = parseExtractionCard(
      JSON.stringify({
        ...valid,
        themes: Array.from({ length: 12 }, (_, i) => `theme-${i}`),
        starterQuestions: Array.from({ length: 9 }, (_, i) => `question ${i}?`),
      }),
      "fallback",
    );
    expect(card.themes).toHaveLength(8);
    expect(card.starterQuestions).toHaveLength(5);
  });

  test("strips em dashes from every text field (house style)", () => {
    const card = parseExtractionCard(
      JSON.stringify({
        ...valid,
        title: "War — and Peace",
        summary: "Strategy — the art of winning — without fighting.",
        themes: ["deception — surprise", "leadership"],
        starterQuestions: ["What — really — matters?", "Why fight?", "When to retreat?"],
      }),
      "fallback",
    );
    expect(card.title).not.toContain("—");
    expect(card.summary).not.toContain("—");
    expect(card.themes[0]).not.toContain("—");
    expect(card.starterQuestions[0]).not.toContain("—");
  });

  test("rejects a card missing required fields (hard shape violation)", () => {
    const { summary: _s, ...missingSummary } = valid;
    expect(() => parseExtractionCard(JSON.stringify(missingSummary), "fallback")).toThrow();
  });
});
