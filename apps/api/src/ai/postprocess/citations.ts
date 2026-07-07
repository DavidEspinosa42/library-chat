import type { CitationDto } from "@library-chat/shared";
import type { RetrievedEntry } from "../prompt/registry.js";
import { NO_EVIDENCE, OUT_OF_SCOPE } from "../prompt/templates.js";

const MARKER = /\[(\d+)\]/g;
const SNIPPET_CHARS = 240;

export interface ProcessedAnswer {
  /** Final text: valid markers kept, invented ones stripped. */
  content: string;
  /** Only the entries the answer actually cites, in first-appearance order. */
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
  const cited = new Map<number, RetrievedEntry>();
  let invalidCitations = 0;

  const content = text
    .replace(MARKER, (marker, digits: string) => {
      const n = Number(digits);
      const entry = byN.get(n);
      if (!entry) {
        invalidCitations += 1;
        return "";
      }
      if (!cited.has(n)) cited.set(n, entry);
      return marker;
    })
    .replace(/[ \t]+([.,;:!?])/g, "$1") // tidy space left by stripped markers
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  const citations: CitationDto[] = [...cited.values()].map((e) => ({
    n: e.n,
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
