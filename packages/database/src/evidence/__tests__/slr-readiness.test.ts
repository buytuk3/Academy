/**
 * CORE-03B — Evidence Integration / SLR Readiness (Core Platform).
 * Aligned to the CORE-05 writer contract (mandatory actor, uuid references,
 * onConflictDoNothing idempotent insert).
 *
 * Proves Evidence is the central longitudinal source that later layers
 * (Assessment, Diagnosis, Intervention, Mastery, Learning Intelligence) and the
 * Student Learning Record (CORE-04) will READ from — with no duplication of
 * evidence and no circular dependency.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const hoisted = vi.hoisted(() => {
  const captured: { table: unknown; values: Record<string, unknown> }[] = [];
  let counter = 0;
  const insert = vi.fn((table: unknown) => ({
    values: (v: Record<string, unknown>) => ({
      onConflictDoNothing: () => ({
        returning: async () => {
          const row = { id: `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`, ...v };
          captured.push({ table, values: row });
          return [row];
        },
      }),
    }),
  }));

  const queue: Record<string, unknown>[][] = [];
  const fromTables: unknown[] = [];
  const select = vi.fn(() => {
    let fromTable: unknown = null;
    const terminal = async () => {
      if (fromTable === attemptsTable) return [{ id: ATT, tenantId: T, studentId: S }];
      if (fromTable === evidenceTable) return queue.shift() ?? [{ id: PRIOR, tenantId: T }];
      return [];
    };
    return {
      from: (table: unknown) => {
        fromTable = table;
        fromTables.push(table);
        return {
          where: () => ({
            orderBy: () => ({ limit: () => ({ offset: () => terminal() }) }),
            limit: () => terminal(),
          }),
        };
      },
    };
  });

  const andCalls: unknown[][] = [];
  const and = vi.fn((...conds: unknown[]) => {
    andCalls.push(conds);
    return { __and: conds };
  });
  const eq = vi.fn((col: unknown, val: unknown) => ({ __eq: [col, val] }));
  const desc = vi.fn((col: unknown) => ({ __desc: col }));
  const gte = vi.fn((col: unknown, val: unknown) => ({ __gte: [col, val] }));
  const lte = vi.fn((col: unknown, val: unknown) => ({ __lte: [col, val] }));

  return { captured, insert, queue, fromTables, select, andCalls, and, eq, desc, gte, lte };
});

vi.mock("../../client.js", () => ({ db: { insert: hoisted.insert, select: hoisted.select } }));
vi.mock("drizzle-orm", () => ({
  and: hoisted.and,
  eq: hoisted.eq,
  desc: hoisted.desc,
  gte: hoisted.gte,
  lte: hoisted.lte,
}));

import { recordEvidence } from "../evidence-writer.js";
import { listEvidenceForStudent, getEvidenceChain } from "../evidence-reader.js";
import { evidenceTable } from "../../schema/evidence.js";
import { attemptsTable } from "../../schema/reading.js";
import { OWNERSHIP } from "../ownership.js";

const T = "00000000-0000-4000-8000-00000000000a";
const S = "00000000-0000-4000-8000-00000000000b";
const ATT = "00000000-0000-4000-8000-0000000000bb";
const PRIOR = "00000000-0000-4000-8000-0000000000cc";

beforeEach(() => {
  hoisted.captured.length = 0;
  hoisted.queue.length = 0;
  hoisted.fromTables.length = 0;
  hoisted.andCalls.length = 0;
  hoisted.insert.mockClear();
  hoisted.select.mockClear();
  hoisted.and.mockClear();
  hoisted.eq.mockClear();
  hoisted.desc.mockClear();
  hoisted.gte.mockClear();
  hoisted.lte.mockClear();
});

describe("CORE-03B — evidence is the central source downstream layers read from", () => {
  it("reads ONLY the canonical evidence table, scoped by tenant+student", async () => {
    hoisted.queue.push([{ id: "ev-1", tenantId: T, studentId: S, evidenceType: "assessment" }]);
    const rows = await listEvidenceForStudent({ tenantId: T, studentId: S });
    expect(rows).toHaveLength(1);
    expect(hoisted.fromTables).toEqual([evidenceTable]); // single source — no second table
    expect(hoisted.eq.mock.calls.some((c) => c[0] === evidenceTable.tenantId && c[1] === T)).toBe(true);
    expect(hoisted.eq.mock.calls.some((c) => c[0] === evidenceTable.studentId && c[1] === S)).toBe(true);
    expect(hoisted.andCalls[0]).toHaveLength(2); // tenant + student
    expect(hoisted.insert).not.toHaveBeenCalled(); // read path never writes
  });

  it("layers can read by type (assessment / diagnosis / intervention / mastery / intelligence)", async () => {
    hoisted.queue.push([]);
    await listEvidenceForStudent({ tenantId: T, studentId: S, evidenceType: "assessment" });
    expect(hoisted.andCalls[0]).toHaveLength(3); // tenant + student + type
    expect(hoisted.eq.mock.calls.some((c) => c[0] === evidenceTable.evidenceType && c[1] === "assessment")).toBe(true);
  });

  it("rejects without tenant context (read path is multi-tenant too)", async () => {
    await expect(listEvidenceForStudent({ tenantId: "", studentId: S })).rejects.toThrow("TENANT_CONTEXT_MISSING");
    expect(hoisted.select).not.toHaveBeenCalled();
  });
});

describe("CORE-03B — longitudinal chain (Student → Activity → Attempt → Evidence → Diagnosis → Intervention → Reassessment → Outcome)", () => {
  it("builds the chain with NO duplication (each hop is a distinct evidence row, linked by reference)", async () => {
    const diagnosis = await recordEvidence({
      tenantId: T, studentId: S, actorRole: "system", evidenceType: "decision", action: "diagnosis.issued",
      sourceEngine: "learning-diagnosis", activityId: "act-1", attemptId: ATT,
    });
    const intervention = await recordEvidence({
      tenantId: T, studentId: S, actorRole: "system", evidenceType: "intervention", action: "intervention.started",
      sourceEngine: "intervention-engine", inResponseToId: diagnosis.id,
    });
    const reassessment = await recordEvidence({
      tenantId: T, studentId: S, actorRole: "system", evidenceType: "assessment", action: "reading.reassessed",
      sourceEngine: "reading-engine", inResponseToId: intervention.id,
    });
    const outcome = await recordEvidence({
      tenantId: T, studentId: S, actorRole: "system", evidenceType: "outcome", action: "outcome.recorded",
      sourceEngine: "intervention-engine", inResponseToId: reassessment.id,
    });

    expect(hoisted.captured).toHaveLength(4); // 4 distinct rows — nothing copied/duplicated
    const ids = hoisted.captured.map((c) => c.values.id as string);
    expect(new Set(ids).size).toBe(4);

    hoisted.queue.push([outcome], [reassessment], [intervention], [diagnosis]);
    const chain = await getEvidenceChain({ tenantId: T, evidenceId: outcome.id });
    expect(chain.map((e) => e.id)).toEqual([diagnosis.id, intervention.id, reassessment.id, outcome.id]);
  });

  it("getEvidenceChain is tenant-scoped", async () => {
    hoisted.queue.push([]);
    const chain = await getEvidenceChain({ tenantId: T, evidenceId: "ev-x" });
    expect(chain).toEqual([]);
    expect(hoisted.eq.mock.calls.some((c) => c[0] === evidenceTable.id && c[1] === "ev-x")).toBe(true);
    expect(hoisted.eq.mock.calls.some((c) => c[0] === evidenceTable.tenantId && c[1] === T)).toBe(true);
  });
});

describe("CORE-03B — ownership boundaries are explicit (SLR will consume, never duplicate)", () => {
  it("ownership map is complete and unambiguous", () => {
    expect(OWNERSHIP["reading.measurements"]).toBe("reading-engine");
    expect(OWNERSHIP["evidence"]).toBe("core-platform");
    expect(OWNERSHIP["student-learning-record"]).toBe("core-platform");
    expect(OWNERSHIP["assessment"]).toBe("assessment-engine");
    expect(OWNERSHIP["mastery"]).toBe("mastery-engine");
    expect(OWNERSHIP["diagnosis"]).toBe("learning-diagnosis");
    expect(OWNERSHIP["intervention"]).toBe("intervention-engine");
  });

  it("no circular dependency — evidence modules never import engines", () => {
    const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
    const files = [
      "packages/database/src/evidence/evidence-writer.ts",
      "packages/database/src/evidence/evidence-reader.ts",
      "packages/database/src/evidence/ownership.ts",
      "packages/database/src/schema/evidence.ts",
    ];
    for (const f of files) {
      const text = readFileSync(join(ROOT, f), "utf8");
      expect(text).not.toMatch(/from\s+["'][^"']*reading-engine[^"']*["']/);
    }
  });
});
