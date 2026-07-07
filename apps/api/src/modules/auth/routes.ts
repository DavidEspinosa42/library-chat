import {
  authResponseSchema,
  loginBodySchema,
  registerBodySchema,
} from "@library-chat/shared";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { env } from "../../config/env.js";
import { db } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { AppError } from "../../lib/errors.js";

const COOKIE_NAME = "token";
const SEVEN_DAYS_S = 7 * 24 * 60 * 60;

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: "POST",
    url: "/register",
    schema: {
      body: registerBodySchema,
      response: { 201: authResponseSchema },
    },
    handler: async (req, reply) => {
      const { email, password } = req.body;
      const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
      if (existing) {
        throw new AppError("EMAIL_TAKEN", "An account with this email already exists.");
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const [user] = await db
        .insert(users)
        .values({ email, passwordHash })
        .returning({ id: users.id, email: users.email });
      if (!user) throw new AppError("INTERNAL", "Failed to create the account.");

      const token = await reply.jwtSign({ sub: user.id }, { expiresIn: "7d" });
      setAuthCookie(reply, token);
      return reply.status(201).send({ user });
    },
  });

  app.route({
    method: "POST",
    url: "/login",
    schema: {
      body: loginBodySchema,
      response: { 200: authResponseSchema },
    },
    handler: async (req, reply) => {
      const { email, password } = req.body;
      const user = await db.query.users.findFirst({ where: eq(users.email, email) });
      const ok = user && (await bcrypt.compare(password, user.passwordHash));
      if (!ok) {
        throw new AppError("INVALID_CREDENTIALS", "Email or password is incorrect.");
      }
      const token = await reply.jwtSign({ sub: user.id }, { expiresIn: "7d" });
      setAuthCookie(reply, token);
      return reply.send({ user: { id: user.id, email: user.email } });
    },
  });

  app.route({
    method: "POST",
    url: "/logout",
    schema: { response: { 204: z.null() } },
    handler: async (_req, reply) => {
      reply.clearCookie(COOKIE_NAME, { path: "/" });
      return reply.status(204).send(null);
    },
  });
};

function setAuthCookie(
  reply: { setCookie: (name: string, value: string, opts: object) => unknown },
  token: string,
) {
  reply.setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: SEVEN_DAYS_S,
  });
}
