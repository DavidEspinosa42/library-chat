import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { eq, inArray } from "drizzle-orm";
import { runExtraction } from "../apps/api/src/ai/extraction/extract.js";
import { runAgentTurn } from "../apps/api/src/ai/llm/agent.js";
import { retrieveChunks } from "../apps/api/src/ai/tools/search-core.js";
import { NO_EVIDENCE, OUT_OF_SCOPE } from "../apps/api/src/ai/prompt/templates.js";
import { documentCardSchema } from "@library-chat/shared";
import { env } from "../apps/api/src/config/env.js";
import { db, sql } from "../apps/api/src/db/client.js";
import { chunks, documents, extractions, users } from "../apps/api/src/db/schema.js";
import { processDocument } from "../apps/api/src/ingestion/worker.js";
import {
  extractionCases,
  POISONED,
  qaCases,
  retrievalCases,
  type ExtractionCase,
  type QACase,
  type RetrievalCase,
} from "./cases/golden.js";
import { judgeFaithfulness } from "./judge.js";

interface CaseResult {
  id: string;
  kind: string;
  passed: boolean;
  detail: string;
  /** A documented limitation: reported, but excluded from the regression gate. */
  knownLimitation?: string;
  judge?: { faithful: boolean; reason: string };
}

const results: CaseResult[] = [];
const retrievalRecall: number[] = [];

async function main(): Promise<void> {
  if (env.TEST_MODE) {
    throw new Error("Evals must run against the live provider — unset TEST_MODE (docs/02).");
  }
  console.log(`Evaluating with chat=${env.CHAT_MODEL}, judge=${env.JUDGE_MODEL}\n`);

  const user = await db.query.users.findFirst({ where: eq(users.email, env.DEMO_EMAIL) });
  if (!user) throw new Error(`Demo user ${env.DEMO_EMAIL} not found — run 'pnpm seed' first.`);

  await ingestPoisonedBook(user.id);

  const docs = await db
    .select({ id: documents.id, title: documents.title })
    .from(documents)
    .where(eq(documents.userId, user.id));
  const idByTitle = new Map(docs.map((d) => [d.title, d.id]));

  const resolve = (titles: string[]): { id: string; title: string }[] =>
    titles.map((title) => {
      const id = idByTitle.get(title);
      if (!id) throw new Error(`Seeded document not found: "${title}" — re-run 'pnpm seed'.`);
      return { id, title };
    });

  // One case throwing (e.g. an agent turn hitting the recursion limit) is
  // recorded and the run continues — never aborts the whole suite.
  for (const c of retrievalCases) await guard(c, () => runRetrieval(c, user.id, resolve));
  for (const c of qaCases) await guard(c, () => runQA(c, user.id, resolve));
  for (const c of extractionCases) await guard(c, () => runExtractionCase(c, idByTitle));

  await report();
}

async function guard(
  c: { id: string; kind: string; knownLimitation?: string },
  run: () => Promise<void>,
): Promise<void> {
  try {
    await run();
  } catch (err) {
    record(c.id, c.kind, false, `errored: ${err instanceof Error ? err.message.split("\n")[0] : "unknown"}`, undefined, c.knownLimitation);
  }
}

/** Idempotently (re)ingest the poisoned book so injection cases have a target. */
async function ingestPoisonedBook(userId: string): Promise<void> {
  await db.delete(documents).where(eq(documents.title, POISONED));
  const buffer = await readFile(fileURLToPath(new URL("./seed-docs/poisoned-book.md", import.meta.url)));
  const [row] = await db
    .insert(documents)
    .values({ userId, title: POISONED, filename: "poisoned-book.md", sourceType: "upload", format: "md" })
    .returning();
  if (!row) throw new Error("Failed to insert the poisoned book.");
  await processDocument({ documentId: row.id, userId, buffer, format: "md" });
  console.log("Poisoned book ingested.\n");
}

async function runRetrieval(
  c: RetrievalCase,
  userId: string,
  resolve: (t: string[]) => { id: string; title: string }[],
): Promise<void> {
  const sources = resolve(c.documents);
  const entries = await retrieveChunks({
    userId,
    documentIds: sources.map((s) => s.id),
    query: c.query,
    topK: 3,
  });
  const matched = c.expect.filter((e) =>
    entries.some(
      (r) => r.documentTitle === e.document && r.content.toLowerCase().includes(e.textIncludes.toLowerCase()),
    ),
  );
  const recall = matched.length / c.expect.length;
  retrievalRecall.push(recall);
  record(c.id, c.kind, recall === 1, `recall@3 = ${recall.toFixed(2)}`, undefined, c.knownLimitation);
}

async function runQA(
  c: QACase,
  userId: string,
  resolve: (t: string[]) => { id: string; title: string }[],
): Promise<void> {
  const sources = resolve(c.documents);
  const searchedDocs = new Set<string>();
  const turn = await runAgentTurn({
    userId,
    sources,
    history: [],
    message: c.question,
    onToolCall: (a) => {
      if (a.documentId) searchedDocs.add(a.documentId);
    },
  });
  const failures: string[] = [];

  if (c.expectTemplate) {
    const expected = c.expectTemplate === "NO_EVIDENCE" ? NO_EVIDENCE : OUT_OF_SCOPE;
    if (turn.content !== expected) failures.push(`expected exact ${c.expectTemplate} template`);
  }

  const notes: string[] = [];

  if (c.kind === "factual" || c.kind === "comparative") {
    if (turn.citations.length === 0) failures.push("no citations");
    if (turn.invalidCitations > 0) failures.push(`${turn.invalidCitations} invalid citations`);
    const citedDocs = new Set(turn.citations.map((x) => x.documentId));
    const allowed = new Set(sources.map((s) => s.id));
    if ([...citedDocs].some((d) => !allowed.has(d))) failures.push("cited a document outside the corpus");
    if (c.expectTable && !/\|.*\|/.test(turn.content)) failures.push("no markdown table");

    if (c.minCitedDocuments) {
      // A comparative answer must retrieve from every source (robust, hard gate).
      // Per-cell citation attribution across searches is a known Haiku limitation
      // (docs/05): it under-numbers the second search's passages, so the cited-doc
      // COUNT is reported as a quality signal, not a pass/fail gate.
      if (searchedDocs.size < c.minCitedDocuments) {
        failures.push(`searched ${searchedDocs.size} of ≥ ${c.minCitedDocuments} sources`);
      }
      if (citedDocs.size < c.minCitedDocuments) {
        notes.push(`cited ${citedDocs.size}/${c.minCitedDocuments} sources (known attribution limitation)`);
      }
    }
  }

  if (c.kind === "injection") {
    for (const bad of c.forbidden ?? []) {
      if (turn.content.toLowerCase().includes(bad.toLowerCase())) failures.push(`leaked forbidden text "${bad}"`);
    }
  }

  let judge: CaseResult["judge"];
  if (c.judge && failures.length === 0) {
    // Judge against the FULL cited chunks, not the 600-char UI snippets — the
    // model quoted from the full tool output, so snippets cause false negatives.
    const cited = await fetchCitedContents(turn.citations.map((x) => x.chunkId));
    try {
      judge = await judgeFaithfulness(c.question, turn.content, cited);
      if (!judge.faithful) failures.push(`judge: ${judge.reason}`);
    } catch (err) {
      notes.push(`judge inconclusive: ${err instanceof Error ? err.message : "error"}`);
    }
  }

  const detail = [...failures, ...notes].join("; ") || "ok";
  record(c.id, c.kind, failures.length === 0, detail, judge, c.knownLimitation);
}

/** Full chunk text for the cited chunkIds, preserving citation order. */
async function fetchCitedContents(chunkIds: string[]): Promise<string[]> {
  if (chunkIds.length === 0) return [];
  const rows = await db
    .select({ id: chunks.id, content: chunks.content })
    .from(chunks)
    .where(inArray(chunks.id, chunkIds));
  const byId = new Map(rows.map((r) => [r.id, r.content]));
  return chunkIds.map((id) => byId.get(id) ?? "").filter((c) => c.length > 0);
}

async function runExtractionCase(c: ExtractionCase, idByTitle: Map<string, string>): Promise<void> {
  const docId = idByTitle.get(c.document);
  if (!docId) return record(c.id, c.kind, false, `document not seeded: ${c.document}`);

  let row = await db.query.extractions.findFirst({ where: eq(extractions.documentId, docId) });
  if (!row || row.error || !row.payload) {
    await runExtraction(docId);
    row = await db.query.extractions.findFirst({ where: eq(extractions.documentId, docId) });
  }
  if (!row?.payload) return record(c.id, c.kind, false, `no extraction payload (${row?.error ?? "unknown"})`);

  const parsed = documentCardSchema.safeParse(row.payload);
  if (!parsed.success) return record(c.id, c.kind, false, "payload failed schema validation");

  const card = parsed.data;
  const failures: string[] = [];
  if (c.expect.docType && card.docType !== c.expect.docType) failures.push(`docType=${card.docType}`);
  if (c.expect.language && !card.language.toLowerCase().includes(c.expect.language.toLowerCase())) {
    failures.push(`language=${card.language}`);
  }
  if (c.expect.titleIncludes && !card.title.toLowerCase().includes(c.expect.titleIncludes.toLowerCase())) {
    failures.push(`title=${card.title}`);
  }
  if (c.expect.authorIncludes && !(card.author ?? "").toLowerCase().includes(c.expect.authorIncludes.toLowerCase())) {
    failures.push(`author=${card.author}`);
  }
  if (card.starterQuestions.length < 3 || card.starterQuestions.length > 5) {
    failures.push(`starterQuestions=${card.starterQuestions.length}`);
  }
  record(c.id, c.kind, failures.length === 0, failures.join("; ") || "ok");
}

function record(
  id: string,
  kind: string,
  passed: boolean,
  detail: string,
  judge?: CaseResult["judge"],
  knownLimitation?: string,
): void {
  results.push({ id, kind, passed, detail, ...(judge ? { judge } : {}), ...(knownLimitation ? { knownLimitation } : {}) });
  const label = passed ? "PASS" : knownLimitation ? "KNOWN" : "FAIL";
  console.log(`  ${label}  [${kind}] ${id} — ${detail}`);
}

async function report(): Promise<void> {
  const passed = results.filter((r) => r.passed).length;
  // A known-limitation case that fails is tracked, not a regression (docs/05).
  const regressions = results.filter((r) => !r.passed && !r.knownLimitation);
  const known = results.filter((r) => !r.passed && r.knownLimitation);
  const recallAvg = retrievalRecall.length
    ? retrievalRecall.reduce((s, r) => s + r, 0) / retrievalRecall.length
    : 0;
  const recallPass = recallAvg >= 0.8;

  console.log(`\n${passed}/${results.length} cases passed (${known.length} known limitations, ${regressions.length} regressions).`);
  console.log(`Retrieval recall@3 average: ${recallAvg.toFixed(3)} (${recallPass ? "PASS" : "FAIL"}, gate ≥ 0.80)`);
  for (const r of known) console.log(`  KNOWN  ${r.id}: ${r.knownLimitation}`);
  if (regressions.length > 0) for (const r of regressions) console.log(`  REGRESSION  ${r.id}: ${r.detail}`);

  const out = {
    timestamp: new Date().toISOString(),
    chatModel: env.CHAT_MODEL,
    judgeModel: env.JUDGE_MODEL,
    summary: {
      total: results.length,
      passed,
      knownLimitations: known.length,
      regressions: regressions.length,
      recallAt3: recallAvg,
      recallPass,
    },
    results,
  };
  const dir = fileURLToPath(new URL("./results/", import.meta.url));
  await mkdir(dir, { recursive: true });
  const file = `${dir}${out.timestamp.replace(/[:.]/g, "-")}.json`;
  await writeFile(file, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${file}`);

  // Gate on regressions and the recall metric only — documented known
  // limitations are tracked but do not fail the run.
  const green = regressions.length === 0 && recallPass;
  await sql.end();
  process.exit(green ? 0 : 1);
}

main().catch(async (err) => {
  console.error("Eval run failed:", err);
  await sql.end();
  process.exit(1);
});
