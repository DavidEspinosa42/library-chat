import PQueue from "p-queue";
import type { FastifyBaseLogger } from "fastify";
import { runExtraction } from "../ai/extraction/extract.js";
import { env } from "../config/env.js";
import { processDocument, type IngestionJob } from "./worker.js";

/**
 * In-process queue (deliberate scope decision — docs/01). Bounded concurrency
 * throttles embedding calls; jobs are lost on process restart (documented
 * limitation; the production path is an external queue).
 */
const queue = new PQueue({ concurrency: env.QUEUE_CONCURRENCY });

export function enqueueIngestion(job: IngestionJob, log: FastifyBaseLogger): void {
  void queue.add(async () => {
    try {
      await processDocument(job);
      log.info({ documentId: job.documentId }, "document ingested");
      // Non-blocking extraction (docs/01 step 7): chat is already available.
      enqueueExtraction(job.documentId, log);
    } catch (err) {
      // processDocument already marked the row failed; this logs the cause.
      log.warn({ err, documentId: job.documentId }, "document ingestion failed");
    }
  });
}

export function enqueueExtraction(documentId: string, log: FastifyBaseLogger): void {
  void queue.add(async () => {
    try {
      await runExtraction(documentId);
      log.info({ documentId }, "document card extracted");
    } catch (err) {
      // runExtraction already stored the error on the extractions row.
      log.warn({ err, documentId }, "document extraction failed");
    }
  });
}
