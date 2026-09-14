/**
 * CORE-18 / R-008 — canonical migration generator (one command).
 * drizzle-kit v0.22.8 cannot resolve the schema's `.js` ESM specifiers
 * directly, so this script materializes a stripped copy of
 * packages/database/src/schema/*.ts into drizzle/.drizzle-schema/
 * (gitignored temp), then runs `drizzle-kit generate` against it.
 * The drizzle-kit binary is resolved from the workspace install
 * (engines/reading-engine/node_modules) — never assumed on PATH.
 * Usage: node scripts/db-generate.mjs [-- name=MY_NAME]
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkg = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(pkg, "..", "..");
const schemaDir = join(pkg, "src", "schema");
const tmpDir = join(pkg, "drizzle", ".drizzle-schema");
const outDir = join(pkg, "migrations");

// resolve drizzle-kit binary from the workspace donor install
const candidates = [
  join(repoRoot, "engines", "reading-engine", "node_modules", ".bin", "drizzle-kit"),
  join(pkg, "node_modules", ".bin", "drizzle-kit"),
];
const drizzleBin = candidates.find((p) => existsSync(p));
if (!drizzleBin) {
  console.error("[db-generate] drizzle-kit binary not found in workspace installs");
  process.exit(2);
}

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });
for (const f of readdirSync(schemaDir)) {
  if (!f.endsWith(".ts")) continue;
  const src = readFileSync(join(schemaDir, f), "utf8");
  writeFileSync(join(tmpDir, f), src.replace(/\.js"/g, '"'));
}

const nameArg = process.argv.find((a) => a.startsWith("name="));
const name = nameArg ? nameArg.split("=")[1] : undefined;
const args = [
  JSON.stringify(drizzleBin), "generate",
  "--dialect=postgresql",
  `--schema=${JSON.stringify(join(tmpDir, "index.ts"))}`,
  `--out=${JSON.stringify(outDir)}`,
  ...(name ? [`--name=${JSON.stringify(name)}`] : []),
];
console.log(`[db-generate] ${args.join(" ")}`);
execSync(args.join(" "), { stdio: "inherit" });

// cleanup temp schema copy (keep generated SQL + journal)
rmSync(tmpDir, { recursive: true, force: true });
console.log("[db-generate] done — review the generated SQL before committing.");
