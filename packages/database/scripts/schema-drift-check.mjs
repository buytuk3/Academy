/**
 * CORE-18 / R-008 + CORE-24 Wave-3 (owner-approved CLOSEOUT directive, 2026-09-11)
 * — schema-drift-check (CI gate).
 * Compares a DB built via canonical migrations (DB-A) against the canonical
 * drizzle schema PUSHED to a fresh verification DB (DB-B) across:
 *   tables, columns (types/nullability/defaults), primary keys, foreign keys,
 *   unique constraints, indexes, enum/type definitions, CHECK constraints.
 *
 * Classification (owner directive §"لا تستخدم --force"):
 *   - HARD dimensions (tables/columns/pk/fk/unique/indexes/enums):
 *       ZERO differences = PASS; any diff = FAIL.
 *   - CHECK constraints: drizzle-kit push emits CHECKs from pgTable check()
 *       but the migration chain may carry OWNER-PATCHED CHECKs appended to the
 *       SQL files after generation (ACR-24/001 §2.2/§2.3, ACR-24/002 §2.2/§2.3).
 *       CHECKs present in the migration SQL but absent from the push side are
 *       classified "expected representation difference" (documented, additive
 *       only — NEVER a lost constraint); any other CHECK diff = FAIL.
 *
 * Usage: node scripts/schema-drift-check.mjs <MIGRATED_URL> <PUSHED_URL>
 * Exit codes: 0 = PASS (incl. classified CHECK diffs), 1 = drift/FAIL, 2 = usage.
 */
import postgres from "postgres";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [migratedUrl, pushedUrl] = process.argv.slice(2);
if (!migratedUrl || !pushedUrl) {
  console.error("Usage: node scripts/schema-drift-check.mjs <MIGRATED_URL> <PUSHED_URL>");
  process.exit(2);
}

const mig = postgres(migratedUrl, { max: 1 });
const can = postgres(pushedUrl, { max: 1 });

// CHECK constraint names that the migration SQL files actually declare
// (from ALTER TABLE ... ADD CONSTRAINT ... CHECK) — the owner-patched surface.
const pkg = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationChecks = new Set();
for (const f of readdirSync(join(pkg, "migrations"))) {
  if (!f.endsWith(".sql")) continue;
  const sqlText = readFileSync(join(pkg, "migrations", f), "utf8");
  for (const m of sqlText.matchAll(/ADD CONSTRAINT\s+"?([a-z0-9_]+)"?\s+CHECK/gi)) {
    migrationChecks.add(m[1]);
  }
}

async function snapshot(sql) {
  const tables = (await sql`
    SELECT table_name, table_type FROM information_schema.tables
    WHERE table_schema='public' ORDER BY table_name`);
  const columns = (await sql`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns WHERE table_schema='public'
    ORDER BY table_name, column_name`);
  const pks = (await sql`
    SELECT conname, conrelid::regclass AS tbl FROM pg_constraint
    WHERE contype='p' AND connamespace='public'::regnamespace ORDER BY conname`);
  const fks = (await sql`
    SELECT conname, conrelid::regclass AS tbl FROM pg_constraint
    WHERE contype='f' AND connamespace='public'::regnamespace ORDER BY conname`);
  const uniques = (await sql`
    SELECT conname, conrelid::regclass AS tbl FROM pg_constraint
    WHERE contype='u' AND connamespace='public'::regnamespace ORDER BY conname`);
  const indexes = (await sql`
    SELECT tablename, indexname, indexdef FROM pg_indexes
    WHERE schemaname='public' ORDER BY indexname`);
  const checks = (await sql`
    SELECT conname, conrelid::regclass AS tbl FROM pg_constraint
    WHERE contype='c' AND connamespace='public'::regnamespace ORDER BY conname`);
  const enums = (await sql`
    SELECT t.typname, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS labels
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    GROUP BY t.typname ORDER BY t.typname`);
  return { tables, columns, pks, fks, uniques, indexes, checks, enums };
}

function key(row, fields) {
  return fields.map((f) => String(row[f])).join("|");
}

function diffNames(a, b, fields, label) {
  const A = new Set(a.map((r) => key(r, fields)));
  const B = new Set(b.map((r) => key(r, fields)));
  return { A, B, missing: [...A].filter((x) => !B.has(x)), extra: [...B].filter((x) => !A.has(x)) };
}

function hardDiff(a, b, fields, label, failures) {
  const { A, B, missing, extra } = diffNames(a, b, fields, label);
  if (missing.length || extra.length) {
    console.error(`[drift] ${label}: MIGRATED_MISSING=${missing.length} PUSHED_EXTRA=${extra.length}`);
    for (const m of missing.slice(0, 20)) console.error(`  - missing: ${m}`);
    for (const e of extra.slice(0, 20)) console.error(`  - extra:   ${e}`);
    failures.push(label);
    return false;
  }
  console.log(`[drift] ${label}: identical (${A.size})`);
  return true;
}

try {
  const M = await snapshot(mig);
  const C = await snapshot(can);

  // Fresh-DB guard: an empty DB aborts the gate (never passes silently).
  for (const [name, snap] of [["MIGRATED", M], ["PUSHED", C]]) {
    if (snap.tables.length === 0) {
      console.error(`[drift] ABORT — ${name} DB is EMPTY (no tables). Gate cannot pass on an un-built database.`);
      process.exit(1);
    }
  }

  const failures = [];
  hardDiff(M.tables, C.tables, ["table_name", "table_type"], "tables", failures);
  hardDiff(M.columns, C.columns, ["table_name", "column_name", "data_type", "is_nullable", "column_default"], "columns(types/nullability/defaults)", failures);
  hardDiff(M.pks, C.pks, ["conname", "tbl"], "primary_keys", failures);
  hardDiff(M.fks, C.fks, ["conname", "tbl"], "foreign_keys", failures);
  hardDiff(M.uniques, C.uniques, ["conname", "tbl"], "unique_constraints", failures);
  hardDiff(M.indexes, C.indexes, ["tablename", "indexname", "indexdef"], "indexes", failures);
  hardDiff(M.enums, C.enums, ["typname", "labels"], "enum_types", failures);

  // CHECK constraints — classified dimension (owner-approved representation rule).
  const chk = diffNames(M.checks, C.checks, ["conname", "tbl"], "checks");
  const expectedMissing = chk.missing.filter((name) => migrationChecks.has(name.split("|")[0]));
  const unexpectedMissing = chk.missing.filter((name) => !migrationChecks.has(name.split("|")[0]));
  if (unexpectedMissing.length || chk.extra.length) {
    console.error(`[drift] checks: UNEXPECTED_MISSING=${unexpectedMissing.length} PUSHED_EXTRA=${chk.extra.length}`);
    for (const m of unexpectedMissing.slice(0, 20)) console.error(`  - missing: ${m}`);
    for (const e of chk.extra.slice(0, 20)) console.error(`  - extra:   ${e}`);
    failures.push("checks(unexpected)");
  } else if (expectedMissing.length) {
    console.log(`[drift] checks: expected representation difference — ${expectedMissing.length} CHECK(s) live in reviewed migration SQL only (drizzle-kit 0.22.8 push does not emit them from the schema; additive-only patch per ACR-24/001 §2.2/§2.3 + ACR-24/002 §2.2/§2.3):`);
    for (const m of expectedMissing) console.log(`  ~ expected-diff: ${m}`);
  } else {
    console.log(`[drift] checks: identical (${M.checks.length})`);
  }

  if (failures.length) {
    console.error(`[drift] FAIL — schema drift detected (hard dimensions: ${failures.join(", ")})`);
    process.exit(1);
  }
  console.log("[drift] PASS — Migration-built DB == Schema-pushed DB (zero hard drift; CHECK diffs classified if any)");
} finally {
  await mig.end();
  await can.end();
}
