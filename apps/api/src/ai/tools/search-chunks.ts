import { tool } from "langchain";
import { z } from "zod";
import type { PromptSet, RetrievedEntry } from "../prompt/registry.js";
import { retrieveChunks } from "./search-core.js";

export interface SearchContext {
  userId: string;
  /** The session's corpus — validated server-side; the model can only narrow it. */
  documentIds: string[];
  /** Per-turn registry: every retrieved chunk, numbered — feeds citation validation. */
  registry: RetrievedEntry[];
  prompts: PromptSet;
  onSearch?: (args: { query: string; documentId?: string }) => void;
}

/**
 * The retrieval tool (docs/02). The corpus filter is enforced here with the
 * request's validated documentIds — a prompt-injected documentId outside the
 * selection is silently clamped back to the corpus.
 */
export function createSearchChunksTool(ctx: SearchContext) {
  return tool(
    async ({ query, documentId }: { query: string; documentId?: string }) => {
      ctx.onSearch?.(documentId ? { query, documentId } : { query });

      const entries = await retrieveChunks({
        userId: ctx.userId,
        documentIds: ctx.documentIds,
        query,
        startN: ctx.registry.length,
        ...(documentId ? { documentId } : {}),
      });
      ctx.registry.push(...entries);

      return ctx.prompts.formatSearchResults(entries);
    },
    {
      name: "search_chunks",
      description:
        "Semantic search over the user's selected sources. Returns the most relevant passages, numbered for citation. Optionally narrow to a single source with its documentId.",
      schema: z.object({
        query: z.string().describe("What to look for, phrased as a search query"),
        documentId: z
          .uuid()
          .optional()
          .describe("Restrict the search to one of the selected sources"),
      }),
    },
  );
}
