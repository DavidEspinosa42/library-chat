import {
  chatBodySchema,
  createSessionBodySchema,
  sessionDetailResponseSchema,
  sessionDtoSchema,
  sessionsListResponseSchema,
  type SessionListItem,
} from "@library-chat/shared";
import { and, asc, count, eq, inArray, max } from "drizzle-orm";
import type { FastifyReply } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { runAgentTurn } from "../../ai/llm/agent.js";
import { env } from "../../config/env.js";
import { db } from "../../db/client.js";
import { chatSessions, documents, messages } from "../../db/schema.js";
import { AppError } from "../../lib/errors.js";

export const chatRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", app.authenticate);

  /** Selection is locked per conversation — creating a session snapshots it (docs/03). */
  app.route({
    method: "POST",
    url: "/chat/sessions",
    schema: {
      body: createSessionBodySchema,
      response: { 201: z.object({ session: sessionDtoSchema }) },
    },
    handler: async (req, reply) => {
      const unique = [...new Set(req.body.documentIds)];

      const rows = await db
        .select({ id: documents.id, status: documents.status })
        .from(documents)
        .where(and(eq(documents.userId, req.user.sub), inArray(documents.id, unique)));

      if (rows.length !== unique.length) {
        throw new AppError("NOT_FOUND", "One or more selected documents do not exist.");
      }
      if (rows.some((r) => r.status !== "ready")) {
        throw new AppError(
          "DOCUMENT_NOT_READY",
          "All selected documents must be ready before starting a conversation.",
        );
      }

      const [session] = await db
        .insert(chatSessions)
        .values({ userId: req.user.sub, documentIds: unique })
        .returning();
      if (!session) throw new AppError("INTERNAL", "Failed to create the conversation.");

      return reply.status(201).send({
        session: {
          id: session.id,
          documentIds: session.documentIds,
          createdAt: session.createdAt.toISOString(),
        },
      });
    },
  });

  /** Conversation list — titles + counts, ordered by last activity (docs/04). */
  app.route({
    method: "GET",
    url: "/chat/sessions",
    schema: { response: { 200: sessionsListResponseSchema } },
    handler: async (req) => {
      const rows = await db
        .select({
          session: chatSessions,
          messageCount: count(messages.id),
          lastMessageAt: max(messages.createdAt),
        })
        .from(chatSessions)
        .leftJoin(messages, eq(messages.sessionId, chatSessions.id))
        .where(eq(chatSessions.userId, req.user.sub))
        .groupBy(chatSessions.id);

      const titles = await titleMap(rows.flatMap((r) => r.session.documentIds));
      const sessions = rows
        .map((r) => toListItem(r.session, r.messageCount, r.lastMessageAt, titles))
        .sort((a, b) =>
          (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt),
        );
      return { sessions };
    },
  });

  /** Open a conversation: view + continue (corpus stays fixed). */
  app.route({
    method: "GET",
    url: "/chat/sessions/:id",
    schema: {
      params: z.object({ id: z.uuid() }),
      response: { 200: sessionDetailResponseSchema },
    },
    handler: async (req) => {
      const session = await db.query.chatSessions.findFirst({
        where: and(
          eq(chatSessions.id, req.params.id),
          eq(chatSessions.userId, req.user.sub),
        ),
      });
      if (!session) throw new AppError("NOT_FOUND", "Conversation not found.");

      const history = await db.query.messages.findMany({
        where: eq(messages.sessionId, session.id),
        orderBy: asc(messages.createdAt),
      });
      const titles = await titleMap(session.documentIds);

      return {
        session: toListItem(
          session,
          history.length,
          history.at(-1)?.createdAt ?? null,
          titles,
        ),
        messages: history.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          citations: m.citations,
          createdAt: m.createdAt.toISOString(),
        })),
      };
    },
  });

  /**
   * The AI interaction endpoint (assessment 1.2) — SSE over POST (docs/04).
   * Everything is validated BEFORE hijacking, so early failures use the
   * normal error envelope; once streaming, failures become `error` events.
   */
  app.route({
    method: "POST",
    url: "/chat",
    schema: { body: chatBodySchema },
    handler: async (req, reply) => {
      const { sessionId, message } = req.body;
      if (message.length > env.MAX_CHAT_MESSAGE_CHARS) {
        throw new AppError(
          "PAYLOAD_TOO_LARGE",
          `Message exceeds ${env.MAX_CHAT_MESSAGE_CHARS} characters.`,
        );
      }

      const session = await db.query.chatSessions.findFirst({
        where: and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, req.user.sub)),
      });
      if (!session) throw new AppError("NOT_FOUND", "Conversation not found.");

      const sources = await db
        .select({ id: documents.id, title: documents.title })
        .from(documents)
        .where(
          and(
            eq(documents.userId, req.user.sub),
            inArray(documents.id, session.documentIds),
            eq(documents.status, "ready"),
          ),
        );
      if (sources.length === 0) {
        throw new AppError(
          "DOCUMENT_NOT_READY",
          "None of this conversation's sources are available anymore.",
        );
      }

      const priorMessages = await db.query.messages.findMany({
        where: eq(messages.sessionId, sessionId),
        orderBy: asc(messages.createdAt),
      });

      const sse = openSseStream(reply);
      const startedAt = Date.now();
      try {
        const result = await runAgentTurn({
          userId: req.user.sub,
          sources,
          history: priorMessages.map((m) => ({ role: m.role, content: m.content })),
          message,
          onToolCall: (args) => sse.send("tool_call", { name: "search_chunks", ...args }),
          onToken: (delta) => sse.send("token", { delta }),
        });

        const assistantMessageId = await db.transaction(async (tx) => {
          await tx.insert(messages).values({ sessionId, role: "user", content: message });
          const [assistant] = await tx
            .insert(messages)
            .values({
              sessionId,
              role: "assistant",
              content: result.content,
              citations: result.citations,
              promptVersion: result.promptVersion,
              model: result.model,
            })
            .returning({ id: messages.id });
          if (!assistant) throw new Error("failed to persist the answer");
          return assistant.id;
        });

        sse.send("citations", {
          citations: result.citations,
          invalidCitations: result.invalidCitations,
        });
        sse.send("done", {
          messageId: assistantMessageId,
          content: result.content,
          usage: result.usage,
          elapsedMs: Date.now() - startedAt,
        });
      } catch (err) {
        req.log.error({ err }, "chat turn failed");
        sse.send("error", {
          code: "INTERNAL",
          message: "The assistant failed to answer. Please try again.",
        });
      } finally {
        sse.close();
      }
    },
  });
};

/** SSE plumbing: hijack the reply, write manually, keep-alive every 15s (docs/04). */
function openSseStream(reply: FastifyReply) {
  reply.hijack();
  const raw = reply.raw;
  raw.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache, no-transform",
    // Hijacked replies skip @fastify/cors hooks — set the headers by hand.
    "access-control-allow-origin": env.WEB_ORIGIN,
    "access-control-allow-credentials": "true",
    "x-accel-buffering": "no",
  });
  const ping = setInterval(() => raw.write(": ping\n\n"), 15_000);
  return {
    send(event: string, data: unknown) {
      raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    close() {
      clearInterval(ping);
      raw.end();
    },
  };
}

async function titleMap(documentIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(documentIds)];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: documents.id, title: documents.title })
    .from(documents)
    .where(inArray(documents.id, unique));
  return new Map(rows.map((r) => [r.id, r.title]));
}

function toListItem(
  session: typeof chatSessions.$inferSelect,
  messageCount: number,
  lastMessageAt: Date | string | null,
  titles: Map<string, string>,
): SessionListItem {
  return {
    id: session.id,
    documentIds: session.documentIds,
    // Deleted sources stay visible in the audit trail, just unnamed (docs/03).
    documentTitles: session.documentIds.map((id) => titles.get(id) ?? "(deleted)"),
    createdAt: session.createdAt.toISOString(),
    messageCount,
    lastMessageAt:
      lastMessageAt === null
        ? null
        : typeof lastMessageAt === "string"
          ? new Date(lastMessageAt).toISOString()
          : lastMessageAt.toISOString(),
  };
}
