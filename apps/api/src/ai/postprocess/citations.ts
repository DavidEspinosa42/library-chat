import type { CitationDto } from "@library-chat/shared";
import type { RetrievedEntry } from "../prompt/registry.js";
import { NO_EVIDENCE, OUT_OF_SCOPE } from "../prompt/templates.js";

const MARKER = /\[(\d+)\]/g;
const SNIPPET_CHARS = 600;

export interface ProcessedAnswer {
  /** Final text: valid markers renumbered 1..N, invented ones stripped. */
  content: string;
  /** Only the entries the answer actually cites, renumbered 1..N in first-appearance order. */
  citations: CitationDto[];
  /** How many invented markers were removed — surfaced to the UI (docs/02). */
  invalidCitations: number;
}

/**
 * Response post-processing (docs/02, module #3): a claim can only point at
 * text that was actually retrieved in this turn. Pure function — no models,
 * no prompts.
 */
export function processCitations(
  text: string,
  registry: RetrievedEntry[],
): ProcessedAnswer {
  // Template enforcement (docs/02 "output shaping"): the literal-template
  // contract is guaranteed here, deterministically — not begged from the model.
  // Models love appending helpful elaboration; the contract says template only.
  for (const template of [NO_EVIDENCE, OUT_OF_SCOPE]) {
    if (text.trimStart().startsWith(template)) {
      return { content: template, citations: [], invalidCitations: 0 };
    }
  }

  const byN = new Map(registry.map((e) => [e.n, e]));
  const oldToNew = new Map<number, number>();
  const citedEntries: RetrievedEntry[] = [];
  let invalidCitations = 0;

  const content = text
    .replace(MARKER, (_marker, digits: string) => {
      const n = Number(digits);
      const entry = byN.get(n);
      if (!entry) {
        invalidCitations += 1;
        return "";
      }
      // Registry numbers index everything retrieved this turn, not just what the
      // answer cites — renumber to 1..N in first-appearance order for the reader.
      let newN = oldToNew.get(n);
      if (newN === undefined) {
        newN = oldToNew.size + 1;
        oldToNew.set(n, newN);
        citedEntries.push(entry);
      }
      return `[${newN}]`;
    })
    .replace(/[ \t]+([.,;:!?])/g, "$1") // tidy space left by stripped markers
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  const citations: CitationDto[] = citedEntries.map((e, i) => ({
    n: i + 1,
    chunkId: e.chunkId,
    documentId: e.documentId,
    documentTitle: e.documentTitle,
    location: e.location,
    snippet:
      e.content.length > SNIPPET_CHARS
        ? `${e.content.slice(0, SNIPPET_CHARS)}…`
        : e.content,
  }));

  return { content, citations, invalidCitations };
}
