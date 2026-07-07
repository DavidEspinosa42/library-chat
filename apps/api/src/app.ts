import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyError, type FastifyRequest } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { env } from "./config/env.js";
import { sql } from "./db/client.js";
import { AppError } from "./lib/errors.js";
import { authRoutes } from "./modules/auth/routes.js";
import { chatRoutes } from "./modules/chat/routes.js";
import { documentRoutes } from "./modules/documents/routes.js";

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
  await app.register(cookie);
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    cookie: { cookieName: "token", signed: false },
  });
  await app.register(multipart, {
    limits: {
      fileSize: env.MAX_FILE_MB * 1024 * 1024,
      files: env.MAX_FILES_PER_UPLOAD,
      fields: 5,
    },
  });

  app.decorate("authenticate", async (req: FastifyRequest) => {
    try {
      await req.jwtVerify();
    } catch {
      throw new AppError("UNAUTHORIZED", "Authentication required.");
    }
  });

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

  await app.register(authRoutes, { prefix: "/api/v1/auth" });
  await app.register(documentRoutes, { prefix: "/api/v1" });
  await app.register(chatRoutes, { prefix: "/api/v1" });

  return app;
}
