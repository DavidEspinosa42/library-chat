import { z } from "zod";

/**
 * The document card (docs/02): summary + classification + entities + starter
 * questions. Generic across document types — nothing here assumes books.
 */
export const documentCardSchema = z.object({
  docType: z
    .enum([
      "book",
      "article",
      "report",
      "manual",
      "academic-paper",
      "resume",
      "legal",
      "presentation",
      "notes",
      "correspondence",
      "transcript",
      "other",
    ])
    .describe("What kind of document this is"),
  title: z.string().describe("The document's own title, as stated in its content"),
  author: z.string().nullable().describe("Author if stated, otherwise null"),
  language: z.string().describe("Main language of the document, in English (e.g. 'English')"),
  summary: z.string().describe("Faithful 3-5 sentence summary of the document"),
  // Upper bounds are OUR preference, not an invariant — LLMs overflow them,
  // so we clamp instead of rejecting (live finding: 9 themes → hard failure).
  themes: z
    .array(z.string())
    .min(2)
    .transform((a) => a.slice(0, 8))
    .describe("Main themes/topics covered"),
  keyEntities: z
    .array(
      z.object({
        type: z.enum(["person", "place", "organization", "concept"]),
        value: z.string(),
      }),
    )
    .transform((a) => a.slice(0, 15))
    .describe("Key entities mentioned in the document"),
  starterQuestions: z
    .array(z.string())
    .min(3)
    .transform((a) => a.slice(0, 5))
    .describe(
      "3-5 interesting questions a reader could ask about this document, answerable from its content",
    ),
});

export type DocumentCard = z.infer<typeof documentCardSchema>;
