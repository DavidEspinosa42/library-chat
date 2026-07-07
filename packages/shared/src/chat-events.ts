import { z } from "zod";
import { citationSchema, usageSchema } from "./chat.js";

/**
 * SSE events for POST /chat (docs/04). Consumed with fetch + ReadableStream
 * (SSE-over-POST). The `done` event carries the authoritative post-processed
 * content — the client swaps its accumulated token text for it.
 */

export const tokenEventSchema = z.object({ delta: z.string() });

export const toolCallEventSchema = z.object({
  name: z.literal("search_chunks"),
  query: z.string(),
  documentId: z.uuid().optional(),
});

export const citationsEventSchema = z.object({
  citations: z.array(citationSchema),
  invalidCitations: z.number().int(),
});

export const doneEventSchema = z.object({
  messageId: z.uuid(),
  content: z.string(),
  usage: usageSchema,
  elapsedMs: z.number(),
});

export const errorEventSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export type ChatSseEvent =
  | { event: "token"; data: z.infer<typeof tokenEventSchema> }
  | { event: "tool_call"; data: z.infer<typeof toolCallEventSchema> }
  | { event: "citations"; data: z.infer<typeof citationsEventSchema> }
  | { event: "done"; data: z.infer<typeof doneEventSchema> }
  | { event: "error"; data: z.infer<typeof errorEventSchema> };
