import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import Fastify, { type FastifyError } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { env } from "./config/env.js";
import { sql } from "./db/client.js";
import { AppError } from "./lib/errors.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "test" ? "warn" : "info",
      // Never log credentials or content (docs/06).
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        'res.headers["set-cookie"]',
      ],
      ...(env.NODE_ENV === "development"
        ? { transport: { target: "pino-pretty", options: { colorize: true } } }
        : {}),
    },
    bodyLimit: 1024 * 1024, // JSON bodies; multipart file limits are configured separately
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(helmet);
  await app.register(cors, { origin: env.WEB_ORIGIN, credentials: true });

  // Every error leaves through the envelope (docs/04).
  app.setErrorHandler((err: FastifyError, _req, reply) => {
    if (err instanceof AppError) {
      return reply
        .status(err.status)
        .send({ error: { code: err.code, message: err.message } });
    }
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply
        .status(400)
        .send({ error: { code: "VALIDATION", message: err.message } });
    }
    if (err.statusCode === 413) {
      return reply
        .status(413)
        .send({ error: { code: "PAYLOAD_TOO_LARGE", message: "Request body too large." } });
    }
    app.log.error(err);
    return reply
      .status(500)
      .send({ error: { code: "INTERNAL", message: "Unexpected server error." } });
  });

  app.get("/healthz", async (_req, reply) => {
    try {
      await sql`select 1`;
      return { status: "ok" as const, db: "up" as const };
    } catch {
      return reply.status(503).send({ status: "degraded", db: "down" });
    }
  });

  return app;
}
