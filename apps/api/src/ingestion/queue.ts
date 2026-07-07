import PQueue from "p-queue";
import type { FastifyBaseLogger } from "fastify";
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
    } catch (err) {
      // processDocument already marked the row failed; this logs the cause.
      log.warn({ err, documentId: job.documentId }, "document ingestion failed");
    }
  });
}
