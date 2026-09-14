/**
 * CORE-24 / Wave 3 — db-push-verify.mjs  (VERIFICATION-ONLY TOOLING)
 * Owner-approved decision (AUTH/CONTRACT → CLOSEOUT, 2026-09-11):
 *   "أنشئ أداة Drift رسمية، لكن لا تجعلها Production Push"
 *
 * PURPOSE:
 *   Builds the SCHEMA-PUSHED comparison DB for the Drift gate:
 *   Schema → drizzle-kit push → Verification DB.
 *   The drift gate then proves: Migration-built DB == Schema-pushed DB.
 *
 * THIS IS NOT A DEPLOYMENT TOOL:
 *   - Production is served ONLY by reviewed SQL migrations → db-migrate.mjs.
 *   - The target database name MUST contain "verify" (hard guard below);
 *     any other name aborts the tool.
 *   - NEVER passes --force and NEVER bypasses destructive warnings
 *     (drizzle-kit 0.22.8 has no safe non-interactive force; on a FRESH,
 *     EMPTY verify DB push emits pure CREATE DDL and applies it without
 *     any confirmation prompt — the only supported mode here).
 *
 * EXACT COMMAND EXECUTED (documented per owner directive §"لا تستخدم --force"):
 *   drizzle-kit push --dialect=postgresql --schema=<ESM-compatible temp copy of
 *   packages/database/src/schema/index.ts> --url=<VERIFY_URL>
 *   (run from packages/database, where the canonical drizzle.config.ts lives;
 *    --url overrides the config's dbCredentials.url for THIS verification DB;
 *    the temp schema copy is the canonical schema with `.js`→extensionless
 *    specifiers — the SAME documented workaround as db-generate.mjs, required
 *    because drizzle-kit 0.22.8 cannot resolve the schema's .js ESM imports.)
 *
 * Usage: node scripts/db-push-verify.mjs <VERIFY_DB_URL>
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkg = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(pkg, "..", "..");
const schemaDir = join(pkg, "src", "schema");
const tmpDir = join(pkg, "drizzle", ".drizzle-schema-push");

const targetUrl = process.argv[2];
if (!targetUrl) {
  console.error("[db-push-verify] usage: node scripts/db-push-verify.mjs <VERIFY_DB_URL>");
  process.exit(2);
}

// ── Verification-only guard: the target DB name MUST contain "verify" ──
let dbName;
try {
  dbName = decodeURIComponent(new URL(targetUrl).pathname.replace(/^\//, ""));
} catch {
  console.error("[db-push-verify] REFUSED — target URL is not parseable");
  process.exit(2);
}
if (!/verify/i.test(dbName)) {
  console.error(
    `[db-push-verify] REFUSED — target database "${dbName}" is not a verification database.\n` +
    `[db-push-verify] This tool pushes the RAW schema; it must only ever touch a DB named *verify*.`
  );
  process.exit(2);
}

// resolve drizzle-kit binary from the workspace donor install (same as db-generate.mjs)
const candidates = [
  join(repoRoot, "engines", "reading-engine", "node_modules", ".bin", "drizzle-kit"),
  join(pkg, "node_modules", ".bin", "drizzle-kit"),
];
const drizzleBin = candidates.find((p) => existsSync(p));
if (!drizzleBin) {
  console.error("[db-push-verify] drizzle-kit binary not found in workspace installs");
  process.exit(2);
}

// materialize the canonical schema as an ESM-parseable temp copy (db-generate pattern)
rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });
for (const f of readdirSync(schemaDir)) {
  if (!f.endsWith(".ts")) continue;
  const src = readFileSync(join(schemaDir, f), "utf8");
  writeFileSync(join(tmpDir, f), src.replace(/\.js"/g, '"'));
}

const args = [
  "push",
  "--dialect=postgresql",
  `--schema=${join(tmpDir, "index.ts")}`,
  `--url=${targetUrl}`,
  "--verbose",
];
console.log(`[db-push-verify] drizzle-kit ${args.join(" ")}`);
try {
  execFileSync(drizzleBin, args, { stdio: "inherit", cwd: pkg });
} catch (e) {
  console.error("[db-push-verify] drizzle-kit push FAILED (verification DB unchanged policy: inspect output above)");
  process.exit(1);
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
console.log(`[db-push-verify] OK — schema pushed to verification DB "${dbName}" (no --force, verification-only)`);
