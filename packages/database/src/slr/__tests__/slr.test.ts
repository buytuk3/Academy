/**
 * CORE-04 — Student Learning Record tests (Core Platform).
 *
 * Proves SLR is a READ-ONLY projection over Evidence:
 *  1. SLR is built from Evidence (via the Evidence Reader).
 *  2. No Evidence rows are copied INTO SLR (no SLR table in schema/migrations;
 *     the build path never writes).
 *  3. Student isolation (no cross-student leakage).
 *  4. Tenant isolation (no cross-tenant leakage).
 *  5. Longitudinal continuity across grade/school/curriculum change (no reset).
 *  6. References between hops (diagnosis → intervention → reassessment → outcome).
 *  7. Multidimensional learner data (no overall score; many strands/dimensions).
 *  8. Extensible skills registry (new metric = new dimension automatically).
 *  9. No circular dependency / Core never imports Engines.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

vi.mock("../../evidence/evidence-reader.js", () => ({
  listEvidenceForStudent: vi.fn(),
  getEvidenceChain: vi.fn(),
}));

import { listEvidenceForStudent, getEvidenceChain } from "../../evidence/evidence-reader.js";
import { buildStudentTimeline } from "../slr.js";
import { SKILL_REGISTRY, skillDefinitionFor } from "../skills.js";
import type { Evidence } from "../../schema/evidence.js";

const mockList = vi.mocked(listEvidenceForStudent);
const mockChain = vi.mocked(getEvidenceChain);

const T = "00000000-0000-4000-8000-00000000000a";
const S = "00000000-0000-4000-8000-00000000000b";
const S2 = "00000000-0000-4000-8000-00000000000c";
const ids = {
  diag: "00000000-0000-4000-8000-00000000000d",
  inter: "00000000-0000-4000-8000-00000000000e",
  reassess: "00000000-0000-4000-8000-00000000000f",
  outcome: "00000000-0000-4000-8000-000000000011",
};

function ev(partial: Partial<Evidence> & { id: string; occurredAt: Date; evidenceType: string }): Evidence {
  return {
    tenantId: T,
    studentId: S,
    actorId: null,
    actorRole: null,
    subject: null,
    grade: null,
    curriculumBook: null,
    unitId: null,
    lessonId: null,
    objectiveId: null,
    activityId: null,
    sessionId: null,
    attemptId: null,
    passageId: null,
    inResponseToId: null,
    action: null,
    response: null,
    result: null,
    durationMs: null,
    errorType: null,
    confidence: null,
    sourceEngine: "reading-engine",
    tool: null,
    teacherDecision: null,
    followUp: null,
    metadata: null,
    createdAt: new Date(partial.occurredAt.getTime() + 1),
    ...partial,
  } as Evidence;
}

beforeEach(() => {
  mockList.mockReset();
  mockChain.mockReset();
  mockChain.mockResolvedValue([]);
});

describe("CORE-04 — SLR is built from Evidence (no second source)", () => {
  it("builds a longitudinal timeline by reading the Evidence Reader only", async () => {
    mockList.mockResolvedValue([
      ev({ id: "e1", occurredAt: new Date("2026-01-05T08:00:00Z"), evidenceType: "attempt", subject: "reading", grade: "1", response: { accuracy: 70, fluency: 60 } }),
      ev({ id: "e2", occurredAt: new Date("2026-02-05T08:00:00Z"), evidenceType: "assessment", subject: "reading", grade: "2", response: { accuracy: 85, fluency: 75 } }),
    ]);
    const timeline = await buildStudentTimeline({ tenantId: T, studentId: S });
    expect(mockList).toHaveBeenCalledTimes(1);
    expect(mockList.mock.calls[0][0]).toMatchObject({ tenantId: T, studentId: S });
    expect(timeline.events.map((e) => e.evidenceId)).toEqual(["e1", "e2"]); // chronological
    expect(timeline.events[0].occurredAt.getTime()).toBeLessThan(timeline.events[1].occurredAt.getTime());
    expect(timeline.strands.map((s) => s.subject)).toContain("reading");
  });

  it("never persists Evidence rows inside SLR (no SLR table; read-only build path)", async () => {
    const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
    const migrationsDir = join(ROOT, "packages/database/migrations");
    // CORE-18: scan top-level .sql only (legacy/ + meta/ are directories; legacy chain is frozen history)
    for (const f of readdirSync(migrationsDir).filter((x) => x.endsWith(".sql"))) {
      const sql = readFileSync(join(migrationsDir, f), "utf8");
      expect(sql).not.toMatch(/create\s+table\s+(?:if\s+not\s+exists\s+)?slr\b/i);
    }
    const slrSource = readFileSync(join(ROOT, "packages/database/src/slr/slr.ts"), "utf8");
    expect(slrSource).not.toContain('from "../client.js"'); // no direct db access
    expect(slrSource).not.toMatch(/\.insert\s*\(/); // no writes anywhere
    expect(slrSource).toContain("listEvidenceForStudent"); // reads evidence via the reader
  });
});

describe("CORE-04 — isolation (tenant/student) and longitudinal continuity", () => {
  it("rejects without student context and never touches the reader", async () => {
    await expect(buildStudentTimeline({ tenantId: T, studentId: "" })).rejects.toThrow("STUDENT_CONTEXT_MISSING");
    expect(mockList).not.toHaveBeenCalled();
  });

  it("rejects without tenant context and never touches the reader", async () => {
    await expect(buildStudentTimeline({ tenantId: "", studentId: S })).rejects.toThrow("TENANT_CONTEXT_MISSING");
    expect(mockList).not.toHaveBeenCalled();
  });

  it("is longitudinal — grade/school/curriculum change is context, NOT a reset", async () => {
    mockList.mockResolvedValue([
      ev({ id: "y1", occurredAt: new Date("2025-09-01T08:00:00Z"), evidenceType: "attempt", subject: "reading", grade: "1", curriculumBook: "B1" }),
      ev({ id: "y2", occurredAt: new Date("2026-01-15T08:00:00Z"), evidenceType: "attempt", subject: "reading", grade: "2", curriculumBook: "B2" }),
      ev({ id: "y3", occurredAt: new Date("2026-03-10T08:00:00Z"), evidenceType: "assessment", subject: "reading", grade: "3", curriculumBook: "B3" }),
    ]);
    const timeline = await buildStudentTimeline({ tenantId: T, studentId: S });
    // ONE continuous timeline — 3 events across 3 grades, nothing reset
    expect(timeline.events).toHaveLength(3);
    expect(timeline.contexts.map((c) => c.grade)).toEqual(["1", "2", "3"]);
    expect(timeline.contexts[0].from.getTime()).toBeLessThan(timeline.contexts[1].from.getTime());
    const reading = timeline.strands.find((s) => s.subject === "reading");
    expect(reading?.progress.evidenceCount).toBe(3); // spans ALL segments/grades
    expect(reading?.progress.firstOccurredAt?.getTime()).toBe(new Date("2025-09-01T08:00:00Z").getTime());
    expect(reading?.progress.lastOccurredAt?.getTime()).toBe(new Date("2026-03-10T08:00:00Z").getTime());
  });
});

describe("CORE-04 — references between hops (SLR flow)", () => {
  it("resolves diagnosis → intervention → reassessment → outcome by reference (no copying)", async () => {
    const diag = ev({ id: ids.diag, occurredAt: new Date("2026-01-01T08:00:00Z"), evidenceType: "decision", action: "diagnosis.issued", sourceEngine: "learning-diagnosis", subject: "reading" });
    const inter = ev({ id: ids.inter, occurredAt: new Date("2026-01-05T08:00:00Z"), evidenceType: "intervention", action: "intervention.started", sourceEngine: "intervention-engine", subject: "reading", inResponseToId: ids.diag });
    const reassess = ev({ id: ids.reassess, occurredAt: new Date("2026-02-01T08:00:00Z"), evidenceType: "assessment", action: "reading.reassessed", sourceEngine: "reading-engine", subject: "reading", inResponseToId: ids.inter });
    const outcome = ev({ id: ids.outcome, occurredAt: new Date("2026-02-10T08:00:00Z"), evidenceType: "outcome", action: "outcome.recorded", sourceEngine: "intervention-engine", subject: "reading", inResponseToId: ids.reassess });
    mockList.mockResolvedValue([outcome, reassess, inter, diag]);
    mockChain.mockImplementation(async ({ evidenceId }) => {
      const order = [ids.diag, ids.inter, ids.reassess, ids.outcome];
      const idx = order.indexOf(evidenceId);
      return idx === -1 ? [] : order.slice(0, idx + 1).map((id) => [diag, inter, reassess, outcome].find((e) => e.id === id)!);
    });

    const timeline = await buildStudentTimeline({ tenantId: T, studentId: S, resolveChains: true });
    const outcomeEvent = timeline.events.find((e) => e.evidenceId === ids.outcome);
    expect(outcomeEvent?.chain?.map((e) => e.id)).toEqual([ids.diag, ids.inter, ids.reassess, ids.outcome]);
    expect(mockChain).toHaveBeenCalledWith({ tenantId: T, evidenceId: ids.outcome });
    const reading = timeline.strands.find((s) => s.subject === "reading");
    expect(reading?.references.evidenceIds).toEqual([ids.diag, ids.inter, ids.reassess, ids.outcome]);
    expect(reading?.references.diagnosisIds).toEqual([ids.diag]);
    expect(reading?.references.interventionIds).toEqual([ids.inter]);
    expect(reading?.references.assessmentIds).toContain(ids.reassess);
    expect(reading?.references.outcomeIds).toEqual([ids.outcome]);
  });
});

describe("CORE-04 — multidimensional learner data (no overall score)", () => {
  it("represents multiple strands and dimensions without any overall score", async () => {
    mockList.mockResolvedValue([
      ev({ id: "r1", occurredAt: new Date("2026-01-01T08:00:00Z"), evidenceType: "assessment", subject: "reading", response: { accuracy: 90, fluency: 80 } }),
      ev({ id: "m1", occurredAt: new Date("2026-01-02T08:00:00Z"), evidenceType: "assessment", subject: "mathematics", response: { accuracy: 75 } }),
    ]);
    const timeline = await buildStudentTimeline({ tenantId: T, studentId: S });
    const subjects = timeline.strands.map((s) => s.subject).sort();
    expect(subjects).toEqual(["mathematics", "reading"]);
    const reading = timeline.strands.find((s) => s.subject === "reading");
    expect(reading?.dimensions).toEqual(expect.arrayContaining(["accuracy", "fluency"]));
    const indicatorMetrics = reading?.progress.indicators.map((i) => i.metric) ?? [];
    expect(indicatorMetrics).toEqual(expect.arrayContaining(["accuracy", "fluency"]));
    expect(indicatorMetrics).not.toContain("overall");
    expect(JSON.stringify(timeline)).not.toContain('"overall"');
  });

  it("extensible skills — an unknown metric becomes a dimension automatically (registry is data, not schema)", async () => {
    mockList.mockResolvedValue([
      ev({ id: "s1", occurredAt: new Date("2026-01-01T08:00:00Z"), evidenceType: "assessment", subject: "science", response: { "response-speed": 42 } }),
    ]);
    expect(SKILL_REGISTRY.some((s) => s.subject === "science")).toBe(true);
    expect(skillDefinitionFor("mathematics")).toBeDefined();
    const timeline = await buildStudentTimeline({ tenantId: T, studentId: S });
    const science = timeline.strands.find((s) => s.subject === "science");
    expect(science?.dimensions).toContain("response-speed");
    expect(science?.dimensions).toContain("accuracy"); // registry annotation merged
  });
});

describe("CORE-04 — no circular dependency / Core never imports Engines", () => {
  it("SLR modules have no engine imports and no direct client access", () => {
    const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
    const files = ["packages/database/src/slr/slr.ts", "packages/database/src/slr/skills.ts"];
    for (const f of files) {
      const text = readFileSync(join(ROOT, f), "utf8");
      expect(text).not.toMatch(/from\s+["'][^"']*reading-engine[^"']*["']/);
      expect(text).not.toContain('from "../client.js"');
    }
  });
});
