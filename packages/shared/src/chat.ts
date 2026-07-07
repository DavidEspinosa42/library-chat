import { z } from "zod";

export const createSessionBodySchema = z.object({
  documentIds: z.array(z.uuid()).min(1).max(50),
});
export type CreateSessionBody = z.infer<typeof createSessionBodySchema>;

export const sessionDtoSchema = z.object({
  id: z.uuid(),
  documentIds: z.array(z.uuid()),
  createdAt: z.iso.datetime(),
});
export type SessionDto = z.infer<typeof sessionDtoSchema>;

export const citationSchema = z.object({
  n: z.number().int(),
  chunkId: z.uuid(),
  documentId: z.uuid(),
  documentTitle: z.string(),
  location: z.string().nullable(),
  snippet: z.string(),
});
export type CitationDto = z.infer<typeof citationSchema>;

export const chatBodySchema = z.object({
  sessionId: z.uuid(),
  message: z.string().min(1),
});
export type ChatBody = z.infer<typeof chatBodySchema>;

export const usageSchema = z.object({
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
});

/** JSON response of POST /chat (Phase 2 — becomes SSE in Phase 3). */
export const chatResponseSchema = z.object({
  messageId: z.uuid(),
  content: z.string(),
  citations: z.array(citationSchema),
  invalidCitations: z.number().int(),
  usage: usageSchema,
  elapsedMs: z.number(),
});

export const messageDtoSchema = z.object({
  id: z.uuid(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  citations: z.array(citationSchema).nullable(),
  createdAt: z.iso.datetime(),
});
export type MessageDto = z.infer<typeof messageDtoSchema>;

/** Conversation list item — titles power the "Conversations ▾" dropdown. */
export const sessionListItemSchema = sessionDtoSchema.extend({
  documentTitles: z.array(z.string()),
  messageCount: z.number().int(),
  lastMessageAt: z.iso.datetime().nullable(),
});
export type SessionListItem = z.infer<typeof sessionListItemSchema>;

export const sessionsListResponseSchema = z.object({
  sessions: z.array(sessionListItemSchema),
});

export const sessionDetailResponseSchema = z.object({
  session: sessionListItemSchema,
  messages: z.array(messageDtoSchema),
});
