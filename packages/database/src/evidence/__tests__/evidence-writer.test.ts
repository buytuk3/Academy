/**
 * CORE-05 — Canonical Evidence Writer tests (Core Platform).
 *
 * Proves the Writer is THE legal path for evidence:
 *  - records into the canonical evidence table;
 *  - mandatory context: tenantId / studentId / actor / occurredAt / type / sourceEngine;
 *  - reference validation incl. tenant & student mismatch;
 *  - idempotency (operation_key) dedupes queue retries while distinct events
 *    are both recorded;
 *  - no engine owns evidence storage; no circular dependency; OWNERSHIP reused.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const hoisted = vi.hoisted(() => {
  const rows: { table: unknown; values: Record<string, unknown> }[] = [];
  const insertedKeys: string[] = [];
  const lookupQueue: unknown[][] = [];
  const insert = vi.fn((table: unknown) => ({
    values: (v: Record<string, unknown>) => ({
      onConflictDoNothing: () => ({
        returning: async () => {
          const k = v.operationKey as string;
          if (k !== undefined && insertedKeys.includes(k)) return []; // unique-index conflict (retry)
          if (k !== undefined) insertedKeys.push(k);
          rows.push({ table, values: v });
          return [{ id: "ev-1", ...v }];
        },
      }),
    }),
  }));
  const select = vi.fn(() => ({
    from: () => ({
      where: () => ({
        limit: async () => lookupQueue.shift() ?? [],
      }),
    }),
  }));
  return { rows, insertedKeys, lookupQueue, insert, select };
});

vi.mock("../../client.js", () => ({ db: { insert: hoisted.insert, select: hoisted.select } }));

import { recordEvidence } from "../evidence-writer.js";
import { evidenceTable, evidenceTypeEnum } from "../../schema/evidence.js";
import { OWNERSHIP } from "../ownership.js";

const T = "00000000-0000-4000-8000-00000000000a";
const S = "00000000-0000-4000-8000-00000000000b";
const A = "00000000-0000-4000-8000-00000000000c";
const SE = "00000000-0000-4000-8000-00000000000e";
const P = "00000000-0000-4000-8000-00000000000d";
const OTHER = "00000000-0000-4000-8000-000000000099";
const PRIOR = "00000000-0000-4000-8000-0000000000aa";

function base() {
  return {
    tenantId: T, studentId: S, actorRole: "system", evidenceType: "assessment",
    sourceEngine: "reading-engine", operationKey: "op-1",
  } as const;
}

beforeEach(() => {
  hoisted.rows.length = 0;
  hoisted.insertedKeys.length = 0;
  hoisted.lookupQueue.length = 0;
  hoisted.insert.mockClear();
  hoisted.select.mockClear();
});

describe("CORE-05 — writer records evidence in the canonical table (legal path only)", () => {
  it("records into evidenceTable and returns the row", async () => {
    const row = await recordEvidence(base());
    expect(hoisted.insert).toHaveBeenCalledTimes(1);
    expect(hoisted.insert.mock.calls[0][0]).toBe(evidenceTable);
    expect(hoisted.rows[0].values).toMatchObject({
      tenantId: T, studentId: S, actorRole: "system", evidenceType: "assessment",
      sourceEngine: "reading-engine", operationKey: "op-1",
    });
    expect(row.id).toBe("ev-1");
  });

  it("returns a deterministic derived operationKey when the producer omits it", async () => {
    const { operationKey: _omit, ...rest } = base();
    await recordEvidence(rest);
    expect(hoisted.rows[0].values.operationKey).toBe(`reading-engine:assessment:${S}:no-ref`);
  });
});

describe("CORE-05 — mandatory context", () => {
  it("tenantId mandatory: empty → TENANT_CONTEXT_MISSING; non-uuid → INVALID_TENANT_ID", async () => {
    await expect(recordEvidence({ ...base(), tenantId: "" })).rejects.toThrow("TENANT_CONTEXT_MISSING");
    await expect(recordEvidence({ ...base(), tenantId: "x" })).rejects.toThrow("INVALID_TENANT_ID");
    expect(hoisted.insert).not.toHaveBeenCalled();
  });

  it("studentId mandatory: empty → STUDENT_CONTEXT_MISSING; non-uuid → INVALID_STUDENT_ID", async () => {
    await expect(recordEvidence({ ...base(), studentId: "" })).rejects.toThrow("STUDENT_CONTEXT_MISSING");
    await expect(recordEvidence({ ...base(), studentId: "x" })).rejects.toThrow("INVALID_STUDENT_ID");
    expect(hoisted.insert).not.toHaveBeenCalled();
  });

  it("actor required: none → ACTOR_REQUIRED; bad actorId → INVALID_ACTOR_ID; empty role → INVALID_ACTOR_ROLE", async () => {
    const { actorRole: _r, ...noActor } = base();
    await expect(recordEvidence(noActor)).rejects.toThrow("ACTOR_REQUIRED");
    await expect(recordEvidence({ ...base(), actorId: "zzz", actorRole: "teacher" })).rejects.toThrow("INVALID_ACTOR_ID");
    await expect(recordEvidence({ ...base(), actorRole: "  " })).rejects.toThrow("INVALID_ACTOR_ROLE");
    expect(hoisted.insert).not.toHaveBeenCalled();
  });

  it("occurredAt validated: garbage → INVALID_OCCURRED_AT; absent → defaults to a Date", async () => {
    await expect(recordEvidence({ ...base(), occurredAt: "not-a-date" as unknown as Date })).rejects.toThrow("INVALID_OCCURRED_AT");
    const row = await recordEvidence(base());
    expect(row.occurredAt).toBeInstanceOf(Date);
  });

  it("evidence type validated: bogus → INVALID_EVIDENCE_TYPE; all eight canonical types accepted", async () => {
    await expect(recordEvidence({ ...base(), evidenceType: "bogus" as never })).rejects.toThrow("INVALID_EVIDENCE_TYPE");
    for (const type of evidenceTypeEnum) {
      await recordEvidence({ ...base(), evidenceType: type, operationKey: `op-${type}` });
    }
    expect(hoisted.insert).toHaveBeenCalledTimes(evidenceTypeEnum.length);
  });

  it("sourceEngine mandatory → SOURCE_ENGINE_REQUIRED", async () => {
    await expect(recordEvidence({ ...base(), sourceEngine: "" })).rejects.toThrow("SOURCE_ENGINE_REQUIRED");
    expect(hoisted.insert).not.toHaveBeenCalled();
  });
});

describe("CORE-05 — references, tenant & student isolation", () => {
  it("valid attempt reference is recorded", async () => {
    hoisted.lookupQueue.push([{ id: A, tenantId: T, studentId: S }]);
    const row = await recordEvidence({ ...base(), attemptId: A });
    expect(hoisted.rows[0].values.attemptId).toBe(A);
  });

  it("unknown attempt → INVALID_ATTEMPT_REFERENCE", async () => {
    hoisted.lookupQueue.push([]);
    await expect(recordEvidence({ ...base(), attemptId: A })).rejects.toThrow("INVALID_ATTEMPT_REFERENCE");
    expect(hoisted.insert).not.toHaveBeenCalled();
  });

  it("tenant mismatch: attempt belongs to another tenant → TENANT_MISMATCH", async () => {
    hoisted.lookupQueue.push([{ id: A, tenantId: OTHER, studentId: S }]);
    await expect(recordEvidence({ ...base(), attemptId: A })).rejects.toThrow("TENANT_MISMATCH");
    expect(hoisted.insert).not.toHaveBeenCalled();
  });

  it("student mismatch: attempt belongs to another student → STUDENT_MISMATCH", async () => {
    hoisted.lookupQueue.push([{ id: A, tenantId: T, studentId: OTHER }]);
    await expect(recordEvidence({ ...base(), attemptId: A })).rejects.toThrow("STUDENT_MISMATCH");
    expect(hoisted.insert).not.toHaveBeenCalled();
  });

  it("inResponseToId: valid prior → stored; unknown/invalid format → INVALID_EVIDENCE_REFERENCE", async () => {
    hoisted.lookupQueue.push([{ id: PRIOR, tenantId: T }]);
    const row = await recordEvidence({ ...base(), inResponseToId: PRIOR });
    expect(hoisted.rows[0].values.inResponseToId).toBe(PRIOR);

    hoisted.lookupQueue.push([]);
    await expect(recordEvidence({ ...base(), operationKey: "op-2", inResponseToId: PRIOR })).rejects.toThrow(
      "INVALID_EVIDENCE_REFERENCE",
    );
    await expect(recordEvidence({ ...base(), operationKey: "op-3", inResponseToId: "zzz" })).rejects.toThrow(
      "INVALID_EVIDENCE_REFERENCE",
    );
  });
});

describe("CORE-05 — idempotency (operation_key)", () => {
  it("same operation_key twice → single stored row; the retry resolves to the existing row", async () => {
    const first = await recordEvidence(base());
    // retry of the SAME logical event: insert conflicts ([]) → writer fetches existing
    hoisted.lookupQueue.push([{ id: "ev-existing", tenantId: T, studentId: S, operationKey: "op-1" }]);
    const second = await recordEvidence(base());
    // writer attempted insert twice (the retry re-attempted), but only ONE row was stored
    expect(hoisted.insert).toHaveBeenCalledTimes(2);
    expect(hoisted.rows).toHaveLength(1);
    expect(second.id).toBe("ev-existing");
    expect(first.id).toBe("ev-1");
  });

  it("two DISTINCT events (different keys) are BOTH recorded", async () => {
    await recordEvidence(base());
    await recordEvidence({ ...base(), operationKey: "op-2", evidenceType: "outcome" });
    expect(hoisted.rows).toHaveLength(2);
    const keys = hoisted.rows.map((r) => r.values.operationKey);
    expect(keys).toEqual(["op-1", "op-2"]);
  });
});

describe("CORE-05 — no engine owns evidence storage; OWNERSHIP reused; no circular dependency", () => {
  it("engines never import evidenceTable nor write evidence directly; they use recordEvidence from @workspace/db", () => {
    const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
    const processFile = join(ROOT, "engines/reading-engine/src/queue/workers/analyze.processor.ts");
    const src = readFileSync(processFile, "utf8");
    expect(src).toMatch(/recordEvidence/); // uses the canonical writer
    expect(src).not.toMatch(/evidenceTable/); // …and NEVER the table directly

    // Walk the engine tree (non-test) — no direct evidence table imports anywhere.
    function* walk(dir: string): Generator<string> {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (entry === "node_modules" || entry === "dist" || entry === "__tests__") continue;
        const st = statSync(full);
        if (st.isDirectory()) yield* walk(full);
        else if (entry.endsWith(".ts")) yield full;
      }
    }
    const offenders: string[] = [];
    for (const file of walk(join(ROOT, "engines/reading-engine/src"))) {
      const text = readFileSync(file, "utf8");
      if (/evidenceTable/.test(text) || /schema\/evidence/.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("OWNERSHIP reused: evidence and SLR stay core-platform", () => {
    expect(OWNERSHIP["evidence"]).toBe("core-platform");
    expect(OWNERSHIP["student-learning-record"]).toBe("core-platform");
  });

  it("no circular dependency — core evidence modules never import engines", () => {
    const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
    const files = [
      "packages/database/src/evidence/evidence-writer.ts",
      "packages/database/src/evidence/evidence-reader.ts",
      "packages/database/src/schema/evidence.ts",
    ];
    for (const f of files) {
      const text = readFileSync(join(ROOT, f), "utf8");
      expect(text).not.toMatch(/from\s+["'][^"']*reading-engine[^"']*["']/);
    }
  });
});
