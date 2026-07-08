import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { documentFormatSchema, type DocumentFormat } from "@library-chat/shared";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { runExtraction } from "../ai/extraction/extract.js";
import { env } from "../config/env.js";
import { db, sql } from "../db/client.js";
import { documents, users } from "../db/schema.js";
import { processDocument } from "../ingestion/worker.js";

/**
 * Seed the demo corpus (docs/05): a demo user + the seed/ files. Ingested in a
 * deliberate order — the four books first, then the docx, then the srt — so the
 * two extra-format samples sit at the top of the library list (createdAt desc).
 * Runs the real pipeline (parse → chunk → embed → extract); honours TEST_MODE.
 */

// Books first (oldest), then the two format samples (newest → top of the list).
const SEED_FILES = [
  "Sun Tzu - The Art of War.txt",
  "Benjamin Franklin - Autobiography.md",
  "P.T. Barnum - The Art Of Money Getting.pdf",
  "Marcus Aurelius - Meditations.epub",
  "Remote Work Policy.docx",
  "Inside the Mind of Anthropic CEO Dario Amodei.srt",
] as const;

const seedPath = (name: string) => fileURLToPath(new URL(`../../../../seed/${name}`, import.meta.url));

function formatOf(filename: string): DocumentFormat {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const parsed = documentFormatSchema.safeParse(ext);
  if (!parsed.success) throw new Error(`Unsupported seed file extension: .${ext} (${filename})`);
  return parsed.data;
}

async function main(): Promise<void> {
  console.log(`Seeding as ${env.DEMO_EMAIL}${env.TEST_MODE ? " (TEST_MODE: fake AI)" : ""}`);

  const passwordHash = await bcrypt.hash(env.DEMO_PASSWORD, 10);
  const [user] = await db
    .insert(users)
    .values({ email: env.DEMO_EMAIL, passwordHash })
    .onConflictDoUpdate({ target: users.email, set: { passwordHash } })
    .returning();
  if (!user) throw new Error("Failed to upsert the demo user.");

  // Clean slate: cascade removes the user's chunks, sessions, messages, cards.
  await db.delete(documents).where(eq(documents.userId, user.id));

  for (const filename of SEED_FILES) {
    const format = formatOf(filename);
    const buffer = await readFile(seedPath(filename));
    const title = filename.replace(/\.[^.]+$/, "");

    const [row] = await db
      .insert(documents)
      .values({ userId: user.id, title, filename, sourceType: "upload", format })
      .returning();
    if (!row) throw new Error(`Failed to insert ${filename}`);

    process.stdout.write(`  ${filename} … `);
    await processDocument({ documentId: row.id, userId: user.id, buffer, format });
    await runExtraction(row.id);
    console.log("ready");
  }

  console.log(`Done — ${SEED_FILES.length} documents seeded.`);
}

main()
  .then(() => sql.end())
  .catch(async (err) => {
    console.error("Seed failed:", err);
    await sql.end();
    process.exit(1);
  });
