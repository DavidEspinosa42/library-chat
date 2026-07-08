import type { CitationDto } from "@library-chat/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { CitationList } from "./citation-chip.js";

const citations: CitationDto[] = [
  { n: 1, chunkId: "a", documentId: "d1", documentTitle: "The Art of War", location: "I. Laying Plans", snippet: "All warfare is based on deception." },
  { n: 2, chunkId: "b", documentId: "d2", documentTitle: "Meditations", location: null, snippet: "The universe is change." },
];

describe("CitationList", () => {
  test("renders a chip per citation with its number, title and location", () => {
    render(<CitationList citations={citations} />);
    const chips = screen.getAllByTestId("citation-chip");
    expect(chips).toHaveLength(2);
    expect(chips[0]!.textContent).toContain("[1]");
    expect(chips[0]!.textContent).toContain("The Art of War");
    expect(chips[0]!.textContent).toContain("I. Laying Plans");
  });

  test("clicking a chip opens its snippet popover; clicking again closes it", () => {
    render(<CitationList citations={citations} />);
    const chip = screen.getAllByTestId("citation-chip")[0]!;

    expect(chip.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/All warfare is based on deception/)).toBeTruthy();

    fireEvent.click(chip);
    expect(chip.getAttribute("aria-expanded")).toBe("false");
  });

  test("only one popover is open at a time", () => {
    render(<CitationList citations={citations} />);
    const [first, second] = screen.getAllByTestId("citation-chip");
    fireEvent.click(first!);
    fireEvent.click(second!);
    expect(first!.getAttribute("aria-expanded")).toBe("false");
    expect(second!.getAttribute("aria-expanded")).toBe("true");
  });

  test("Escape closes the open popover", () => {
    render(<CitationList citations={citations} />);
    const chip = screen.getAllByTestId("citation-chip")[0]!;
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(chip.getAttribute("aria-expanded")).toBe("false");
  });
});
