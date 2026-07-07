import type { FastifyReply, FastifyRequest } from "fastify";
import "@fastify/jwt";

declare module "fastify" {
  interface FastifyInstance {
    /** onRequest guard — verifies the JWT cookie or throws UNAUTHORIZED. */
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}
