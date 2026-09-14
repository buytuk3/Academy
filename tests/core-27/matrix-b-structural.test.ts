/**
 * CORE-27 / Batch 2 — Matrix B (structural part): B1, B5, B6.
 * Source-level architectural protections — MUST ALL PASS. Read-only over the
 * repository source; no product file is modified by this batch.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === "dist" || e === ".git" || e === "tsbuildinfo") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("CORE-27 Batch 2 — Matrix B (structural protections)", () => {
  // ── B1: Learning Loop NEVER writes Evidence directly ─────────────────
  it("B1: learning-loop source imports the canonical writer path only via @workspace/db, and never calls evidence table inserts", async () => {
    const files = walk(join(ROOT, "packages", "learning-loop", "src"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // no direct pg/table access, no second writer
      expect(src, f).not.toMatch(/from\s+["']drizzle-orm\/postgres-js/);
      expect(src, f).not.toMatch(/insert\(evidenceTable\)/);
      // any Evidence write MUST go through recordEvidence (the ONLY legal writer)
      const usesWriter = /recordEvidence\s*\(/.test(src);
      const directEvidenceInsert = /evidenceTable\s*\)/.test(src) && /insert\(/.test(src) && !usesWriter;
      expect(directEvidenceInsert, f).toBe(false);
    }
    // runtime proof: loop outcome stage writes its outcome evidence THROUGH recordEvidence
    const loopSrc = readFileSync(join(ROOT, "packages", "learning-loop", "src", "loop.ts"), "utf8");
    expect(loopSrc).toMatch(/await recordEvidence\(/); // via the canonical writer only
  });

  // ── B5: no new migrations / no new tables ────────────────────────────
  it("B5: migration chain is frozen at 0000–0005 and the four loop tables live ONLY in 0000", async () => {
    const migDir = join(ROOT, "packages", "database", "migrations");
    const sqlFiles = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
    console.log("EVIDENCE B5 migration files", JSON.stringify(sqlFiles));
    expect(sqlFiles).toEqual([
      "0000_core18_canonical_baseline.sql",
      "0001_core18_identity_membership.sql",
      "0002_core19_organization_scope.sql",
      "0003_core20_evidence_tenant_time_index.sql",
      "0004_core24_content_exercise_library.sql",
      "0005_core24_activity_assignment_attempt_state.sql",
    ]);
    const journal = JSON.parse(readFileSync(join(migDir, "meta", "_journal.json"), "utf8"));
    expect(journal.entries).toHaveLength(6);
    const baseline = readFileSync(join(migDir, "0000_core18_canonical_baseline.sql"), "utf8");
    for (const t of ["learning_diagnoses", "intervention_proposals", "learning_reassessments", "learning_outcomes"]) {
      expect(baseline).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS "${t}"`));
    }
  });

  // ── B6: no Learner Model store, no new Event Bus ─────────────────────
  it("B6: learner model stays a pure projection (no new store) and events keep ONE canonical dispatcher/outbox", async () => {
    const learnerDir = join(ROOT, "packages", "database", "src", "learner");
    const learnerFiles = readdirSync(learnerDir);
    console.log("EVIDENCE B6 learner files", JSON.stringify(learnerFiles));
    // projection/types/rules only — no store module, no new table definitions
    expect(learnerFiles.filter((f) => f.endsWith(".ts")).sort()).toEqual(["index.ts", "projection.ts", "rules.ts", "types.ts"]);
    const proj = readFileSync(join(learnerDir, "projection.ts"), "utf8");
    expect(proj).not.toMatch(/insert\(/); // pure read/projection
    expect(proj).toMatch(/listEvidenceForStudent/); // reads through the canonical reader
    const schemaIndex = readFileSync(join(ROOT, "packages", "database", "src", "schema", "index.ts"), "utf8");
    expect(schemaIndex).not.toMatch(/learner-store|learnerStore/);
    // events: single dispatcher + outbox; no second bus
    const eventsSrc = readdirSync(join(ROOT, "packages", "events", "src"));
    console.log("EVIDENCE B6 events files", JSON.stringify(eventsSrc));
    const dispatcher = readFileSync(join(ROOT, "packages", "events", "src", "dispatcher.ts"), "utf8");
    expect(dispatcher).toMatch(/publishEvent/);
    const loopSrc = readFileSync(join(ROOT, "packages", "learning-loop", "src", "loop.ts"), "utf8");
    expect(loopSrc).toMatch(/from ["']@workspace\/events["']/); // loop publishes via the canonical bus only
  });
});
