import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

// .env lives at the repo root; real environment variables always win over the file.
dotenv.config({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)), quiet: true });

const boolString = z
  .enum(["0", "1", "true", "false"])
  .default("0")
  .transform((v) => v === "1" || v === "true");

/**
 * Single config entry point (docs/06). The ONLY place `process.env` is read.
 * Fail-fast: the process refuses to boot on invalid config.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().default(3000),
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(16),
    WEB_ORIGIN: z.string().default("http://localhost:5173"),

    /** Swaps AI factories to offline fakes (fakeModel + deterministic embedder). */
    TEST_MODE: boolString,

    ANTHROPIC_API_KEY: z.string().optional(),
    VOYAGE_API_KEY: z.string().optional(),

    CHAT_MODEL: z.string().default("anthropic:claude-haiku-4-5"),
    EXTRACTION_MODEL: z.string().default("anthropic:claude-haiku-4-5"),
    JUDGE_MODEL: z.string().default("anthropic:claude-sonnet-5"),
    EMBEDDING_MODEL: z.string().default("voyage-context-4"),
    /** Must match the vector(N) column dimension in db/schema.ts. */
    EMBEDDING_DIM: z.coerce.number().int().default(1024),
    // voyage-context-4 window: 32k tokens PER GROUP (inner list) — cl100k
    // approximation + different tokenizer → generous safety margin.
    EMBED_GROUP_MAX_TOKENS: z.coerce.number().int().default(28_000),

    QUEUE_CONCURRENCY: z.coerce.number().int().min(1).default(2),
    CHUNK_TOKENS: z.coerce.number().int().default(400),
    CHUNK_OVERLAP_PCT: z.coerce.number().int().min(0).max(50).default(15),
    EXTRACTION_EXCERPT_TOKENS: z.coerce.number().int().default(30_000),
    AGENT_MAX_TOOL_CALLS: z.coerce.number().int().min(1).default(4),
    RETRIEVAL_TOP_K: z.coerce.number().int().min(1).default(8),
    MAX_TOKENS_CHAT: z.coerce.number().int().default(2_048),
    MAX_TOKENS_EXTRACTION: z.coerce.number().int().default(4_096),

    MAX_FILE_MB: z.coerce.number().default(25),
    MAX_FILES_PER_UPLOAD: z.coerce.number().int().default(10),
    MAX_PASTE_CHARS: z.coerce.number().int().default(500_000),
    MAX_DOC_TOKENS: z.coerce.number().int().default(600_000),
    MAX_CHAT_MESSAGE_CHARS: z.coerce.number().int().default(4_000),

    RATE_LIMIT_MAX: z.coerce.number().int().default(30),
    RATE_LIMIT_WINDOW: z.string().default("1 minute"),
  })
  .superRefine((cfg, ctx) => {
    if (!cfg.TEST_MODE) {
      if (!cfg.ANTHROPIC_API_KEY) {
        ctx.addIssue({
          code: "custom",
          path: ["ANTHROPIC_API_KEY"],
          message: "Required unless TEST_MODE=1",
        });
      }
      if (!cfg.VOYAGE_API_KEY) {
        ctx.addIssue({
          code: "custom",
          path: ["VOYAGE_API_KEY"],
          message: "Required unless TEST_MODE=1",
        });
      }
    }
  });

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
