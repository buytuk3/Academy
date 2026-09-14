/**
 * CORE-03A — Evidence foundation tests (Core Platform / packages/database).
 * Aligned to the CORE-05 writer contract (mandatory actor + idempotency).
 *
 * The real Evidence writer + real canonical schema are exercised; only the DB
 * client is mocked (no live PostgreSQL — LIVE DATABASE NOT VERIFIED; live
 * integration stays OPEN VALIDATION until CI/Staging).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const hoisted = vi.hoisted(() => {
  const captured: { table: unknown; values: Record<string, unknown> }[] = [];
  const insert = vi.fn((table: unknown) => ({
    values: (v: Record<string, unknown>) => ({
      onConflictDoNothing: () => ({
        returning: async () => {
          captured.push({ table, values: v });
          return [{ id: "ev-row-1", ...v }];
        },
      }),
    }),
  }));
  // writer reference validation lookups (attempt / prior evidence) — found rows
  const select = vi.fn(() => ({
    from: () => ({
      where: () => ({
        limit: async () => [
          {
            id: "00000000-0000-4000-8000-00000000000c",
            tenantId: "00000000-0000-4000-8000-00000000000a",
            studentId: "00000000-0000-4000-8000-00000000000b",
          },
        ],
      }),
    }),
  }));
  return { captured, insert, select };
});

vi.mock("../../client.js", () => ({ db: { insert: hoisted.insert, select: hoisted.select } }));

import { recordEvidence } from "../evidence-writer.js";
import { evidenceTypeEnum, evidenceTable } from "../../schema/evidence.js";

const T = "00000000-0000-4000-8000-00000000000a";
const S = "00000000-0000-4000-8000-00000000000b";
const A = "00000000-0000-4000-8000-00000000000c";
const P = "00000000-0000-4000-8000-00000000000d";
const SE = "00000000-0000-4000-8000-00000000000e";

function base(op = "ev-op") {
  return {
    tenantId: T,
    studentId: S,
    actorRole: "system",
    evidenceType: "assessment",
    sourceEngine: "reading-engine",
    operationKey: op,
  } as const;
}

beforeEach(() => {
  hoisted.captured.length = 0;
  hoisted.insert.mockClear();
  hoisted.select.mockClear();
});

describe("CORE-03A — evidence writer records evidence", () => {
  it("records evidence actually (insert into evidence table + returns row)", async () => {
    const row = await recordEvidence(base("op-1"));
    expect(hoisted.insert).toHaveBeenCalledTimes(1);
    expect(hoisted.insert.mock.calls[0][0]).toBe(evidenceTable);
    expect(hoisted.captured).toHaveLength(1);
    expect(row.id).toBe("ev-row-1");
  });

  it("row carries studentId and tenantId", async () => {
    await recordEvidence(base("op-2"));
    expect(hoisted.captured[0].values).toMatchObject({ tenantId: T, studentId: S });
  });

  it("cannot pass without tenant context (explicit multi-tenant rule)", async () => {
    await expect(recordEvidence({ ...base(), tenantId: "" })).rejects.toThrow("TENANT_CONTEXT_MISSING");
    await expect(recordEvidence({ ...base(), tenantId: "not-a-uuid" })).rejects.toThrow("INVALID_TENANT_ID");
    expect(hoisted.insert).not.toHaveBeenCalled();
  });

  it("cannot pass without student context (uuid enforced)", async () => {
    await expect(recordEvidence({ ...base(), studentId: "" })).rejects.toThrow("STUDENT_CONTEXT_MISSING");
    await expect(recordEvidence({ ...base(), studentId: "abc" })).rejects.toThrow("INVALID_STUDENT_ID");
    expect(hoisted.insert).not.toHaveBeenCalled();
  });

  it("source engine is clear and required", async () => {
    await expect(recordEvidence({ ...base(), sourceEngine: "" })).rejects.toThrow("SOURCE_ENGINE_REQUIRED");
    await recordEvidence(base("op-src"));
    expect(hoisted.captured[0].values.sourceEngine).toBe("reading-engine");
  });

  it("does NOT change reading measurement ownership (writes only to evidence table)", async () => {
    await recordEvidence({
      tenantId: T, studentId: S, actorRole: "system", evidenceType: "assessment", sourceEngine: "reading-engine",
      operationKey: "op-own", attemptId: A, passageId: P, sessionId: SE, response: { overall: 85, accuracy: 90 },
    });
    expect(hoisted.insert).toHaveBeenCalledTimes(1);
    expect(hoisted.insert.mock.calls[0][0]).toBe(evidenceTable); // never reports/mastery/attempts
    expect(hoisted.captured[0].values).not.toHaveProperty("wordReport");
  });

  it("is serializable (JSON round-trip preserves uuid ids + context)", async () => {
    const row = await recordEvidence({
      tenantId: T, studentId: S, actorRole: "system", evidenceType: "assessment", sourceEngine: "reading-engine",
      operationKey: "op-serial", attemptId: A, passageId: P, sessionId: SE,
      response: { overall: 85 }, metadata: { masteryLevel: "PROGRESSING" },
    });
    const rt = JSON.parse(JSON.stringify(row)) as typeof row;
    expect(rt.tenantId).toBe(T);
    expect(rt.studentId).toBe(S);
    expect(rt.attemptId).toBe(A);
    expect(rt.sourceEngine).toBe("reading-engine");
    expect(rt.evidenceType).toBe("assessment");
    expect(rt.metadata).toEqual({ masteryLevel: "PROGRESSING" });
  });

  it("accepts canonical uuid ids (system-wide uuid contract)", async () => {
    const row = await recordEvidence({
      tenantId: T, studentId: S, actorRole: "system", evidenceType: "time", sourceEngine: "reading-engine",
      operationKey: "op-uuid", attemptId: A, sessionId: SE, durationMs: 4200,
    });
    expect(row.attemptId).toBe(A);
    expect(row.durationMs).toBe(4200);
  });
});

describe("CORE-03A — canonical schema: every dimension is a real column (metadata is supplementary only)", () => {
  const listed = [
    "tenantId", "studentId", "actorId", "actorRole", "occurredAt",
    "subject", "grade", "curriculumBook", "unitId", "lessonId", "objectiveId", "activityId",
    "sessionId", "attemptId", "passageId", "inResponseToId",
    "evidenceType", "action", "response", "result", "durationMs", "errorType", "confidence",
    "sourceEngine", "tool", "teacherDecision", "followUp",
  ];
  const columns = new Set(Object.keys(evidenceTable as unknown as Record<string, unknown>));
  it("every listed canonical field exists as a typed column (not metadata-only)", () => {
    for (const field of listed) expect(columns.has(field)).toBe(true);
    expect(columns.has("metadata")).toBe(true);
    expect(columns.has("operationKey")).toBe(true); // CORE-05 idempotency
  });

  it("the eight evidence kinds are a closed enum", () => {
    expect([...evidenceTypeEnum]).toEqual([
      "attempt", "response", "assessment", "mistake", "time", "intervention", "decision", "outcome",
    ]);
  });
});

describe("CORE-03A — no circular dependencies / direction stays apps→engines→packages", () => {
  const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));

  function* walk(dir: string): Generator<string> {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (entry === "node_modules" || entry === "dist" || entry === "__tests__") continue;
      const st = statSync(full);
      if (st.isDirectory()) yield* walk(full);
      else if (entry.endsWith(".ts")) yield full;
    }
  }

  it("packages/database/src never references the engine (packages import engines = 0)", () => {
    const offenders: string[] = [];
    const importRef = /(?:from\s+|import\s*\()\s*["'][^"']*reading-engine[^"']*["']/;
    for (const file of walk(join(ROOT, "packages/database/src"))) {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (importRef.test(line)) {
          offenders.push(`${file}: ${line.trim()}`);
          break;
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("reading runtime touches @workspace/db only (legacy db imports = 0)", () => {
    const files = [
      "engines/reading-engine/src/service/reading-service.ts",
      "engines/reading-engine/src/queue/workers/analyze.processor.ts",
      "engines/reading-engine/src/realtime/socket.ts",
    ];
    for (const f of files) {
      const path = join(ROOT, f);
      expect(existsSync(path)).toBe(true);
      const text = readFileSync(path, "utf8");
      expect(text).toContain('from "@workspace/db"');
      expect(text).not.toContain("../db/index");
      expect(text).not.toContain("../db/schema");
    }
  });
});
