import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./vitest.config.js";

/** Migrate the test database once per run, then wipe it (users cascade to everything). */
export default async function setup(): Promise<void> {
  const sql = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
    await sql`TRUNCATE TABLE users CASCADE`;
  } finally {
    await sql.end();
  }
}
