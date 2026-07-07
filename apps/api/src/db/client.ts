import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../config/env.js";
import * as schema from "./schema.js";

export const sql = postgres(env.DATABASE_URL, {
  onnotice: () => {},
});

export const db = drizzle(sql, { schema });
