/**
 * CORE-18 / R-008 — canonical Production/Staging/CI migration runner.
 * drizzle-kit migrate applies journaled SQL files from packages/database/migrations
 * (meta/_journal.json). `push` is dev-only and forbidden in production/staging.
 * Usage: node scripts/db-migrate.mjs <DATABASE_URL>
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(here, "..", "migrations");
const url = process.argv[2] ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required (arg 1 or env)");
  process.exit(2);
}
const journal = JSON.parse(readFileSync(join(migrationsFolder, "meta", "_journal.json"), "utf8"));
console.log(`[db-migrate] journal entries: ${journal.entries.length}`);
for (const e of journal.entries) console.log(`[db-migrate]   - ${e.tag}`);
const client = postgres(url, { max: 1 });
try {
  await migrate(drizzle(client), { migrationsFolder });
  console.log("[db-migrate] OK — all migrations applied");
} finally {
  await client.end();
}
