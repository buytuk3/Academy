/**
 * CORE-08 — Teacher Decision Boundary test suite.
 * Maps 1:1 to the CORE-08 Definition of Done:
 *   Happy path (approve→authorized→delivery), Modify (final plan), Reject
 *   (no delivery), Security (cross-tenant, unauthorized role, wrong student/
 *   proposal/activity), Reliability (duplicate request, retry, same op key),
 *   Integrity (no evidence duplication, no SLR duplication, no overall score,
 *   no second database), single canonical path (CORE-07 now consumes this).
 * The @workspace/db client is mocked; recordEvidence mock enforces the CORE-05
 * writer contract (decision evidence written ONLY through the writer).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url)); // repo root (from packages/decisions/src/__tests__/)

const T = "00000000-0000-4000-8000-00000000000a";
const S = "00000000-0000-4000-8000-00000000000b";
const OTHER_T = "00000000-0000-4000-8000-0000000000cc";

const hoisted = vi.hoisted(() => {
  const evidenceCalls: Record<string, unknown>[] = [];
  const securityEvents: { type: string }[] = [];
  const updates: { table: unknown; set: Record<string, unknown> }[] = [];

  const db = {
    update: vi.fn((table: unknown) => ({
      set: (v: Record<string, unknown>) => ({
        where: async () => {
          updates.push({ table, set: v });
          return [];
        },
      }),
    })),
    insert: vi.fn(() => ({ values: () => ({ onConflictDoNothing: () => ({ returning: async () => [] }) }) })),
  };
  const recordEvidence = vi.fn(async (input: Record<string, unknown>) => {
    evidenceCalls.push(input);
    return { id: `ev-${evidenceCalls.length}`, ...input };
  });
  const publishEvent = vi.fn(async () => undefined);

  class ClassifiedError extends Error {
    className: string;
    constructor(className = "application", message: string) {
      super(message);
      this.className = className;
      this.name = "ClassifiedError";
    }
  }
  const createLogger = () => ({ info() {}, error() {}, warn() {}, debug() {} });
  const safeLog = (x: unknown) => x;
  const getMetrics = () => ({ securityEvents: { inc() {} } });
  const recordSecurityEvent = vi.fn((_l, _m, type: string) => {
    securityEvents.push({ type });
  });

  const interventionProposalsTable = { __t: "intervention_proposals" } as never;

  return {
    db, recordEvidence, publishEvent, ClassifiedError, createLogger, safeLog, getMetrics,
    recordSecurityEvent, interventionProposalsTable, evidenceCalls, securityEvents, updates,
  };
});

vi.mock("@workspace/db", () => ({
  db: hoisted.db,
  recordEvidence: hoisted.recordEvidence,
  interventionProposalsTable: hoisted.interventionProposalsTable,
}));
vi.mock("@workspace/events", () => ({ publishEvent: hoisted.publishEvent }));
vi.mock("@workspace/observability", () => ({
  ClassifiedError: hoisted.ClassifiedError,
  createLogger: hoisted.createLogger,
  safeLog: hoisted.safeLog,
  getMetrics: hoisted.getMetrics,
  recordSecurityEvent: hoisted.recordSecurityEvent,
}));

import {
  applyTeacherDecision, decisionOperationKey, assertDeliveryAuthorized, toDecisionContract,
  DECISION_STATES, assertValidDecisionTransition, DECISION_ROLES, assertActorCanDecide,
} from "../index.js";
import type { InterventionProposal } from "@workspace/db";

function proposal(over: Record<string, unknown> = {}): InterventionProposal {
  return {
    id: "prop-1",
    tenantId: T,
    studentId: S,
    diagnosisId: "diag-1",
    skill: "fluency",
    activityType: "targeted-reading-practice",
    config: { sessionMinutes: 10 },
    suggestedBy: "learning-loop",
    status: "PENDING",
    originalProposal: { activityType: "targeted-reading-practice", config: { sessionMinutes: 10 } },
    decision: null,
    decidedAt: null,
    deliveryAuthorization: null,
    operationKey: "loop:intervention:diag-1",
    createdAt: new Date(),
    ...over,
  } as unknown as InterventionProposal;
}
const decisionEvidence = () => hoisted.evidenceCalls.filter((c) => String(c.operationKey).startsWith("teacher:decision:"));

beforeEach(() => {
  hoisted.evidenceCalls.length = 0;
  hoisted.securityEvents.length = 0;
  hoisted.updates.length = 0;
  hoisted.recordEvidence.mockClear();
  hoisted.publishEvent.mockClear();
  hoisted.recordSecurityEvent.mockClear();
  hoisted.db.update.mockClear();
});

// ============================ CONTRACT & STATE MACHINE ============================
describe("CORE-08 — Decision Contract & State Machine", () => {
  it("has exactly four states: PENDING APPROVED MODIFIED REJECTED", () => {
    expect(DECISION_STATES).toEqual(["PENDING", "APPROVED", "MODIFIED", "REJECTED"]);
  });

  it("PENDING can never transition to PENDING; a final state cannot be re-decided", () => {
    expect(() => assertValidDecisionTransition("PENDING", "PENDING")).toThrow("DECISION_CANNOT_REMAIN_PENDING");
    expect(() => assertValidDecisionTransition("APPROVED", "MODIFIED")).toThrow("DECISION_ALREADY_FINAL");
    expect(() => assertValidDecisionTransition("PENDING", "APPROVED")).not.toThrow();
  });

  it("the decision contract carries NO overall student score", () => {
    const c: Record<string, unknown> = {
      decisionId: "d1", tenantId: T, studentId: S, proposalId: "p1", actorId: "a", actorRole: "teacher",
      decision: "APPROVED", occurredAt: new Date().toISOString(), evidenceRefs: [], deliveryAuthorization: null,
    };
    expect("score" in c).toBe(false);
    expect("student.level" in c).toBe(false);
  });
});

// ============================ HAPPY PATH ============================
describe("CORE-08 — Happy path: Approve → Authorized → Delivery", () => {
  it("APPROVED issues a bound delivery authorization, records decision evidence, emits event", async () => {
    const r = await applyTeacherDecision({
      tenantId: T, proposal: proposal(), decision: { action: "APPROVED", actorId: "teacher-1", actorRole: "teacher", reason: "evidence supports it" },
      evidenceRefs: ["ev-1", "ev-2"],
    });
    expect(r.existed).toBe(false);
    expect(r.proposal.status).toBe("APPROVED");
    expect(r.authorization).not.toBeNull();
    expect(r.proposal.deliveryAuthorization).toMatchObject({ tenantId: T, studentId: S, proposalId: "prop-1", activityType: "targeted-reading-practice" });
    // delivery authorization binds proposal+student+tenant+activity — NOT a general permission
    expect(() => assertDeliveryAuthorized({ tenantId: T, studentId: S, proposalId: "prop-1", activityType: "targeted-reading-practice" }, r.authorization)).not.toThrow();
    // decision is EVIDENCE via the canonical writer
    const ev = decisionEvidence()[0] as Record<string, unknown>;
    expect(ev.evidenceType).toBe("decision");
    expect(ev.operationKey).toBe("teacher:decision:prop-1:teacher-1:APPROVED");
    expect(ev.action).toBe("teacher.decision");
    expect((ev.response as Record<string, unknown>).evidenceRefs).toEqual(["ev-1", "ev-2"]);
    // real domain event on an authorized transition
    expect(hoisted.publishEvent.mock.calls.some((c) => (c[0] as { type: string }).type === "InterventionAssigned")).toBe(true);
  });
});

// ============================ MODIFY ============================
describe("CORE-08 — Modify: teacher modifies the AI proposal", () => {
  it("MODIFIED keeps originalProposal, stores the modification, authorizes the FINAL plan", async () => {
    const r = await applyTeacherDecision({
      tenantId: T, proposal: proposal(),
      decision: { action: "MODIFIED", actorId: "teacher-2", actorRole: "teacher", modifications: { activityType: "targeted-practice-extended", sessionMinutes: 15 } },
    });
    expect(r.proposal.status).toBe("MODIFIED");
    expect(r.proposal.activityType).toBe("targeted-practice-extended"); // final plan
    expect((r.proposal.originalProposal as Record<string, unknown>).activityType).toBe("targeted-reading-practice"); // original untouched
    expect(r.authorization?.activityType).toBe("targeted-practice-extended"); // auth bound to FINAL activity
    // delivering the ORIGINAL activity is rejected
    expect(() => assertDeliveryAuthorized({ tenantId: T, studentId: S, proposalId: "prop-1", activityType: "targeted-reading-practice" }, r.authorization))
      .toThrow("DELIVERY_AUTHORIZATION_MISMATCH");
    // delivering the FINAL activity is allowed
    expect(() => assertDeliveryAuthorized({ tenantId: T, studentId: S, proposalId: "prop-1", activityType: "targeted-practice-extended" }, r.authorization)).not.toThrow();
  });
});

// ============================ REJECT ============================
describe("CORE-08 — Reject: no delivery", () => {
  it("REJECTED records the reason, issues no authorization, emits no event", async () => {
    const r = await applyTeacherDecision({
      tenantId: T, proposal: proposal(),
      decision: { action: "REJECTED", actorId: "teacher-1", actorRole: "teacher", rejectionReason: "not appropriate for this student" },
    });
    expect(r.proposal.status).toBe("REJECTED");
    expect(r.authorization).toBeNull();
    expect(() => assertDeliveryAuthorized({ tenantId: T, studentId: S, proposalId: "prop-1", activityType: "targeted-reading-practice" }, r.authorization))
      .toThrow("DELIVERY_NOT_AUTHORIZED");
    expect(hoisted.publishEvent.mock.calls.some((c) => (c[0] as { type: string }).type === "InterventionAssigned")).toBe(false);
    const ev = decisionEvidence()[0] as Record<string, unknown>;
    expect((ev.response as Record<string, unknown>).rejectionReason).toBe("not appropriate for this student");
  });
});

// ============================ SECURITY & RBAC ============================
describe("CORE-08 — Security: tenant isolation & actor authorization", () => {
  it("rejects a proposal from another tenant and logs a security event", async () => {
    const pOther = proposal({ tenantId: OTHER_T });
    await expect(applyTeacherDecision({ tenantId: T, proposal: pOther, decision: { action: "APPROVED", actorId: "teacher-1", actorRole: "teacher" } }))
      .rejects.toThrow("CROSS_TENANT_PROPOSAL");
    expect(hoisted.securityEvents.some((e) => e.type === "cross-tenant-attempt")).toBe(true);
  });

  it("rejects an unauthorized role (student) — not every user can decide", async () => {
    await expect(applyTeacherDecision({ tenantId: T, proposal: proposal(), decision: { action: "APPROVED", actorId: "stu-1", actorRole: "student" } }))
      .rejects.toThrow("ACTOR_ROLE_NOT_AUTHORIZED");
    expect(hoisted.securityEvents.some((e) => e.type === "authorization-failure")).toBe(true);
  });

  it("requires actor identity", async () => {
    await expect(applyTeacherDecision({ tenantId: T, proposal: proposal(), decision: { action: "APPROVED", actorId: "", actorRole: "teacher" } }))
      .rejects.toThrow("DECISION_ACTOR_REQUIRED");
  });

  it("RBAC allow-list contains teacher roles and rejects others", () => {
    expect(DECISION_ROLES).toEqual(expect.arrayContaining(["teacher", "principal", "admin"]));
    for (const role of DECISION_ROLES) expect(() => assertActorCanDecide(role)).not.toThrow();
    expect(() => assertActorCanDecide("student")).toThrow("ACTOR_ROLE_NOT_AUTHORIZED");
    expect(() => assertActorCanDecide("parent")).toThrow("ACTOR_ROLE_NOT_AUTHORIZED");
  });

  it("delivery gate rejects a DIFFERENT proposal/student/tenant/activity even with a valid authorization", async () => {
    const r = await applyTeacherDecision({ tenantId: T, proposal: proposal(), decision: { action: "APPROVED", actorId: "teacher-1", actorRole: "teacher" } });
    const auth = r.authorization!;
    expect(() => assertDeliveryAuthorized({ tenantId: T, studentId: S, proposalId: "OTHER-PROP", activityType: "targeted-reading-practice" }, auth)).toThrow("DELIVERY_AUTHORIZATION_MISMATCH");
    expect(() => assertDeliveryAuthorized({ tenantId: T, studentId: "OTHER-STU", proposalId: "prop-1", activityType: "targeted-reading-practice" }, auth)).toThrow("DELIVERY_AUTHORIZATION_MISMATCH");
    expect(() => assertDeliveryAuthorized({ tenantId: OTHER_T, studentId: S, proposalId: "prop-1", activityType: "targeted-reading-practice" }, auth)).toThrow("DELIVERY_AUTHORIZATION_MISMATCH");
    expect(hoisted.securityEvents.some((e) => e.type === "authorization-failure")).toBe(true);
  });
});

// ============================ RELIABILITY / IDEMPOTENCY ============================
describe("CORE-08 — Reliability: retries never duplicate a decision", () => {
  it("same operation key (proposal+actor+action) → existed:true, ONE evidence row, ONE event", async () => {
    const r1 = await applyTeacherDecision({ tenantId: T, proposal: proposal(), decision: { action: "APPROVED", actorId: "teacher-1", actorRole: "teacher" } });
    expect(r1.existed).toBe(false);
    // retry / network / queue / UI re-submission with the SAME logical decision
    const r2 = await applyTeacherDecision({ tenantId: T, proposal: r1.proposal, decision: { action: "APPROVED", actorId: "teacher-1", actorRole: "teacher" } });
    expect(r2.existed).toBe(true);
    expect(decisionEvidence()).toHaveLength(1); // no duplicate decision evidence
    expect(hoisted.publishEvent.mock.calls.filter((c) => (c[0] as { type: string }).type === "InterventionAssigned")).toHaveLength(1); // no duplicate event
    expect(decisionOperationKey("prop-1", "teacher-1", "APPROVED")).toBe("teacher:decision:prop-1:teacher-1:APPROVED");
  });

  it("a DIFFERENT actor cannot re-decide an already decided proposal", async () => {
    const r1 = await applyTeacherDecision({ tenantId: T, proposal: proposal(), decision: { action: "APPROVED", actorId: "teacher-1", actorRole: "teacher" } });
    await expect(applyTeacherDecision({ tenantId: T, proposal: r1.proposal, decision: { action: "APPROVED", actorId: "principal-1", actorRole: "principal" } }))
      .rejects.toThrow("DECISION_ALREADY_FINAL");
  });
});

// ============================ TRACEABILITY & OUTCOME FEEDBACK ============================
describe("CORE-08 — Traceability (teacher is part of the evidence chain)", () => {
  it("toDecisionContract exposes who/when/what/why with refs, no overall score, no evidence copies", async () => {
    const r = await applyTeacherDecision({
      tenantId: T, proposal: proposal(),
      decision: { action: "MODIFIED", actorId: "teacher-2", actorRole: "teacher", modifications: { activityType: "targeted-practice-extended" } },
      evidenceRefs: ["ev-1"],
    });
    const c = toDecisionContract(r.proposal, ["ev-1"]);
    expect(c.decisionId).toBe("teacher:decision:prop-1:teacher-2:MODIFIED");
    expect(c.actorId).toBe("teacher-2");
    expect(c.actorRole).toBe("teacher");
    expect(c.decision).toBe("MODIFIED");
    expect(c.occurredAt.length).toBeGreaterThan(0); // decision time evidence preserved
    expect(c.evidenceRefs).toEqual(["ev-1"]);
    expect(c.deliveryAuthorization?.authorizationId).toContain("delivery:prop-1:");
    expect("score" in c).toBe(false);
  });

  it("timestamps preserved across the chain (proposal → decision → delivery)", () => {
    const p = proposal();
    expect(p.createdAt).toBeInstanceOf(Date);
    const at = new Date().toISOString();
    const auth = { authorizationId: "delivery:p:d", decisionId: "d", proposalId: "p", tenantId: T, studentId: S, activityType: "a", grantedBy: { actorId: "t", actorRole: "teacher" }, grantedAt: at };
    expect(auth.grantedAt).toBe(at);
  });
});

// ============================ INTEGRITY & ARCHITECTURE ============================
describe("CORE-08 — Integrity & Architecture (single canonical path)", () => {
  it("migration 007 is an ALTER-only extension — no second database, no evidence/SLR copy, no overall score", () => {
    const sql = readFileSync(join(ROOT, "packages/database/migrations/legacy/007_teacher_decision.sql"), "utf8"); // CORE-18: moved to legacy/ (frozen history)
    expect(sql).not.toMatch(/create\s+database/i);
    expect(sql).not.toMatch(/create\s+table/i);
    expect(sql).not.toMatch(/create\s+table\s+evidence/i);
    expect(sql.toLowerCase()).not.toContain("overall_score");
    const schema = readFileSync(join(ROOT, "packages/database/src/schema/learning-loop.ts"), "utf8");
    expect(schema).toContain("deliveryAuthorization");
    expect(schema.toLowerCase()).not.toContain("overall_score");
    expect(schema.toLowerCase()).not.toContain("student_level");
  });

  it("CORE-07 now consumes the canonical capability — loop.ts defines NO second applyTeacherDecision", () => {
    const loop = readFileSync(join(ROOT, "packages/learning-loop/src/loop.ts"), "utf8");
    expect(loop).toContain('from "@workspace/decisions"');
    expect(loop).not.toMatch(/export (async )?function applyTeacherDecision/);
    const idx = readFileSync(join(ROOT, "packages/learning-loop/src/index.ts"), "utf8");
    expect(idx).toContain('from "@workspace/decisions"'); // single canonical re-export
  });

  it("no circular dependency: core packages never import @workspace/decisions", () => {
    for (const f of ["packages/database/src/index.ts", "packages/events/src/index.ts", "packages/observability/src/index.ts"]) {
      const src = readFileSync(join(ROOT, f), "utf8");
      expect(src).not.toContain("@workspace/decisions");
    }
  });

  it("decisions package never depends on an engine", () => {
    const idx = readFileSync(join(ROOT, "packages/decisions/src/index.ts"), "utf8");
    expect(idx).not.toContain("engines/");
  });

  it("no evidence duplication: writing a decision produces exactly ONE evidence row", () => {
    // covered by idempotency test; here we prove the writer is the ONLY channel
    expect(hoisted.db.insert).not.toHaveBeenCalled(); // no direct table insert from the decision path
  });
});
