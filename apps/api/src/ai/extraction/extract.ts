import { asc, eq } from "drizzle-orm";
import { env } from "../../config/env.js";
import { db } from "../../db/client.js";
import { chunks, documents, extractions } from "../../db/schema.js";
import { getExtractionModel } from "../llm/factory.js";
import { ACTIVE_PROMPT_VERSION, getPromptSet } from "../prompt/registry.js";
import { documentCardSchema, type DocumentCard } from "./schema.js";

/**
 * Non-blocking extraction job (docs/01 step 7): runs after the document is
 * `ready`; failure lands in extractions.error, never touches document status.
 * Upsert keeps retries idempotent.
 */
export async function runExtraction(documentId: string): Promise<void> {
  const model = env.EXTRACTION_MODEL;
  try {
    const document = await db.query.documents.findFirst({
      where: eq(documents.id, documentId),
    });
    if (!document || document.status !== "ready") return;

    const excerpt = await buildExcerpt(documentId);
    const card = await extractCard(excerpt, document.title);

    await db
      .insert(extractions)
      .values({
        documentId,
        payload: card,
        error: null,
        promptVersion: ACTIVE_PROMPT_VERSION,
        model,
      })
      .onConflictDoUpdate({
        target: extractions.documentId,
        set: { payload: card, error: null, promptVersion: ACTIVE_PROMPT_VERSION, model },
      });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 300) : "unknown error";
    await db
      .insert(extractions)
      .values({
        documentId,
        payload: null,
        error: message,
        promptVersion: ACTIVE_PROMPT_VERSION,
        model,
      })
      .onConflictDoUpdate({
        target: extractions.documentId,
        set: { payload: null, error: message, promptVersion: ACTIVE_PROMPT_VERSION, model },
      });
    throw err;
  }
}

/** First ~EXTRACTION_EXCERPT_TOKENS of the document, in chunk order (capped by design — docs/02). */
async function buildExcerpt(documentId: string): Promise<string> {
  const rows = await db
    .select({ content: chunks.content, tokenCount: chunks.tokenCount })
    .from(chunks)
    .where(eq(chunks.documentId, documentId))
    .orderBy(asc(chunks.idx));

  const parts: string[] = [];
  let tokens = 0;
  for (const row of rows) {
    if (tokens + row.tokenCount > env.EXTRACTION_EXCERPT_TOKENS) break;
    parts.push(row.content);
    tokens += row.tokenCount;
  }
  return parts.join("\n\n");
}

async function extractCard(excerpt: string, fallbackTitle: string): Promise<DocumentCard> {
  const modelPromise = getExtractionModel();
  if (!modelPromise) return deterministicTestCard(fallbackTitle, excerpt);

  const model = await modelPromise;
  // Explicit structured output: prompt for pure JSON, parse and Zod-validate
  // at the boundary ourselves. withStructuredOutput through the universal
  // model fell back to a text parser that failed live (see docs/05 Phase 3).
  const response = await model.invoke(getPromptSet().buildExtractionPrompt(excerpt));
  const text =
    typeof response.content === "string"
      ? response.content
      : response.content.map((b) => (b.type === "text" ? b.text : "")).join("");

  return parseExtractionCard(text, fallbackTitle);
}

/**
 * Parse + validate a model response into a DocumentCard (pure — unit-tested).
 * LLM-overflowable maxima are clamped by the schema; hard shape violations throw.
 */
export function parseExtractionCard(text: string, fallbackTitle: string): DocumentCard {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error(`Extraction returned no JSON object: ${text.slice(0, 120)}`);
  }
  const raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  // Documents without a stated title (transcripts, notes) come back as null —
  // fall back to the stored title instead of failing validation.
  if (typeof raw["title"] !== "string" || raw["title"].trim().length === 0) {
    raw["title"] = fallbackTitle;
  }
  // Models occasionally invent a docType outside the taxonomy — coerce to "other".
  const docTypes: readonly string[] = documentCardSchema.shape.docType.options;
  if (typeof raw["docType"] !== "string" || !docTypes.includes(raw["docType"])) {
    raw["docType"] = "other";
  }
  return sanitizeCard(documentCardSchema.parse(raw));
}

/** House style bans em dashes; enforced deterministically, not begged from the model. */
function stripEmDashes(text: string): string {
  return text.replace(/\s*—\s*/g, ", ");
}

function sanitizeCard(card: DocumentCard): DocumentCard {
  return {
    ...card,
    title: stripEmDashes(card.title),
    summary: stripEmDashes(card.summary),
    themes: card.themes.map(stripEmDashes),
    keyEntities: card.keyEntities.map((e) => ({ ...e, value: stripEmDashes(e.value) })),
    starterQuestions: card.starterQuestions.map(stripEmDashes),
  };
}

/** TEST_MODE card: deterministic, schema-valid, derived from real content. */
function deterministicTestCard(title: string, excerpt: string): DocumentCard {
  return documentCardSchema.parse({
    docType: "book",
    title,
    author: null,
    language: "English",
    summary: `Deterministic test summary of "${title}": ${excerpt.slice(0, 120).replace(/\s+/g, " ")}…`,
    themes: ["testing", "retrieval"],
    keyEntities: [{ type: "concept", value: "test mode" }],
    starterQuestions: [
      `What is "${title}" about?`,
      "What are the main themes?",
      "Who is mentioned in this document?",
    ],
  });
}
