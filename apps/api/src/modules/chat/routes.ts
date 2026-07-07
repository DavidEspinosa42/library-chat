import {
  chatBodySchema,
  chatResponseSchema,
  createSessionBodySchema,
  sessionDtoSchema,
} from "@library-chat/shared";
import { and, asc, eq, inArray } from "drizzle-orm";
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
      const { documentIds } = req.body;
      const unique = [...new Set(documentIds)];

      const rows = await db
        .select({ id: documents.id, status: documents.status })
        .from(documents)
        .where(and(eq(documents.userId, req.user.sub), inArray(documents.id, unique)));

      if (rows.length !== unique.length) {
        throw new AppError("NOT_FOUND", "One or more selected documents do not exist.");
      }
      const notReady = rows.filter((r) => r.status !== "ready");
      if (notReady.length > 0) {
        throw new AppError(
          "DOCUMENT_NOT_READY",
          `${notReady.length} selected document(s) are not ready to chat yet.`,
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

  /** The AI interaction endpoint (assessment 1.2). JSON in Phase 2 → SSE in Phase 3. */
  app.route({
    method: "POST",
    url: "/chat",
    schema: {
      body: chatBodySchema,
      response: { 200: chatResponseSchema },
    },
    handler: async (req) => {
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

      const startedAt = Date.now();
      const result = await runAgentTurn({
        userId: req.user.sub,
        sources,
        history: priorMessages.map((m) => ({ role: m.role, content: m.content })),
        message,
      });
      const elapsedMs = Date.now() - startedAt;

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
        if (!assistant) throw new AppError("INTERNAL", "Failed to persist the answer.");
        return assistant.id;
      });

      return {
        messageId: assistantMessageId,
        content: result.content,
        citations: result.citations,
        invalidCitations: result.invalidCitations,
        usage: result.usage,
        elapsedMs,
      };
    },
  });
};
