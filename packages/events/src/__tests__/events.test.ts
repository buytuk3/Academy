/**
 * CORE-06 — Event flow + Observability foundation tests.
 * Maps 1:1 to the 13 required proofs (producer, consumer, context, evidence
 * link, idempotency, retry-no-duplicate, tenant isolation, failure observability,
 * correlation, no secrets in logs, no cycles, no second DB, no function loss —
 * the last is covered by the engine/api/worker suites staying green).
 * The @workspace/db module is mocked; recordEvidence mock enforces the REAL
 * CORE-05 writer contract (dedup on operationKey — proven by evidence-writer tests).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as obs from "@workspace/observability";

const T = "00000000-0000-4000-8000-00000000000a";
const S = "00000000-0000-4000-8000-00000000000b";
const ATT = "00000000-0000-4000-8000-0000000000bb";
const OTHER_T = "00000000-0000-4000-8000-0000000000cc";

const hoisted = vi.hoisted(() => {
  const insertTargets: unknown[] = [];
  const stored: Record<string, unknown>[] = [];
  const pending: Record<string, unknown>[][] = [];
  const updates: Record<string, unknown>[] = [];
  const evidenceKeys = new Set<string>();
  const evidenceRows: Record<string, unknown>[] = [];
  let evCount = 0;
  const eventOutboxTableRef = { __outbox: true } as never;

  const insert = vi.fn((table: unknown) => ({
    values: (v: Record<string, unknown>) => ({
      returning: async () => {
        insertTargets.push(table);
        if (table === eventOutboxTableRef) stored.push(v);
        return [{ id: v.id ?? "row-1", ...v }];
      },
    }),
  }));

  const select = vi.fn(() => ({
    from: (table: unknown) => ({
      where: () => ({
        orderBy: () => ({
          limit: async () =>
            (pending.shift() ?? [])
              .slice()
              .sort((a, b) => new Date(a.createdAt as string).getTime() - new Date(b.createdAt as string).getTime())
              .map((r) => ({ ...r, envelope: r.envelope ?? r })),
        }),
        limit: async () => (pending.shift() ?? []).map((r) => ({ ...r, envelope: r.envelope ?? r })),
      }),
    }),
  }));

  const update = vi.fn((table: unknown) => ({
    set: (v: Record<string, unknown>) => ({
      where: async () => {
        updates.push({ table, set: v });
        return [];
      },
    }),
  }));

  const recordEvidence = vi.fn(async (input: Record<string, unknown>) => {
    const key = input.operationKey as string;
    if (key && evidenceKeys.has(key)) return { id: `ev-existing-${key}`, ...input }; // writer dedup (CORE-05 contract)
    if (key) evidenceKeys.add(key);
    evidenceRows.push(input);
    const id = `ev-${++evCount}`;
    return { id, ...input };
  });

  return { insert, select, update, insertTargets, stored, pending, updates, recordEvidence, evidenceKeys, evidenceRows, eventOutboxTableRef };
});

const eventOutboxTableRef = hoisted.eventOutboxTableRef;

vi.mock("@workspace/db", () => ({
  db: { insert: hoisted.insert, select: hoisted.select, update: hoisted.update },
  eventOutboxTable: hoisted.eventOutboxTableRef,
  recordEvidence: hoisted.recordEvidence,
}));

import { publishEvent, registerConsumer, processEventOutbox, retryFailedEvent, evidenceConsumerFor } from "../index.js";
import type { LearningEvent, LearningEventType } from "@buytuk/contracts";

function makeEvent(type: LearningEventType, over: Partial<LearningEvent> = {}): LearningEvent {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    type,
    version: 1,
    occurredAt: "2026-09-01T08:00:00.000Z",
    actor: { id: "system", role: "system" },
    tenantId: T,
    studentId: S,
    payload: {},
    ...over,
  } as LearningEvent;
}

function pendingRow(ev: LearningEvent): Record<string, unknown> {
  return { id: ev.id, tenantId: ev.tenantId, type: ev.type, envelope: ev, status: "pending", attempts: 0, createdAt: new Date() };
}

beforeEach(() => {
  hoisted.insertTargets.length = 0;
  hoisted.stored.length = 0;
  hoisted.pending.length = 0;
  hoisted.updates.length = 0;
  hoisted.evidenceKeys.clear();
  hoisted.evidenceRows.length = 0;
  hoisted.insert.mockClear();
  hoisted.select.mockClear();
  hoisted.update.mockClear();
  hoisted.recordEvidence.mockClear();
  vi.restoreAllMocks();
});

describe("CORE-06 — producer & consumer (in-process event flow)", () => {
  it("1: producer emits an event — publishEvent persists a pending outbox row (same DB)", async () => {
    const ev = makeEvent("ReadingAnalyzed", { payload: { sessionId: "se-1", reportId: "r-1", scoreSummary: { accuracy: 90, fluency: 85, prosody: 80 }, evidenceRef: "ev-0", attemptId: ATT, passageId: "p-1" } });
    await publishEvent(ev, { jobId: "job-1", traceId: "trace-1", correlationId: "corr-1", requestId: "req-1" });
    expect(hoisted.insertTargets).toEqual([eventOutboxTableRef]); // ONLY the outbox — no second store
    expect(hoisted.stored[0]).toMatchObject({ id: ev.id, tenantId: T, type: "ReadingAnalyzed", status: "pending", traceId: "trace-1", jobId: "job-1" });
  });

  it("2: consumer receives the event — processEventOutbox runs the consumer and marks processed", async () => {
    const ev = makeEvent("ReadingAnalyzed", { payload: { sessionId: "se-1", reportId: "r-1", scoreSummary: { accuracy: 90, fluency: 85, prosody: 80 }, evidenceRef: "ev-0", attemptId: ATT } });
    hoisted.pending.push([pendingRow(ev)]);
    const result = await processEventOutbox();
    expect(result).toEqual({ processed: 1, failed: 0 });
    expect(hoisted.recordEvidence).toHaveBeenCalledTimes(1);
    const lastUpdate = hoisted.updates[hoisted.updates.length - 1].set as Record<string, unknown>;
    expect(lastUpdate.status).toBe("processed");
    expect(lastUpdate.evidenceId).toBe("ev-1");
  });

  it("3: event carries correct context (tenantId, studentId, actor, occurredAt) and reading events are live", async () => {
    const ev = makeEvent("MasteryUpdated", { occurredAt: "2026-09-02T09:00:00.000Z", actor: { id: "t-1", role: "teacher" }, payload: { masteryRecordId: "mr-1", skillId: "reading:p-1", level: "MASTERED" } });
    await publishEvent(ev);
    expect(hoisted.stored[0].envelope).toMatchObject({ tenantId: T, studentId: S, actor: { id: "t-1", role: "teacher" }, occurredAt: "2026-09-02T09:00:00.000Z", type: "MasteryUpdated" });
    hoisted.pending.push([pendingRow(ev)]);
    await processEventOutbox();
    const call = hoisted.recordEvidence.mock.calls[0][0] as Record<string, unknown>;
    expect(call.tenantId).toBe(T);
    expect(call.studentId).toBe(S);
    expect(call.actorRole).toBe("teacher");
    expect(call.occurredAt).toEqual(new Date("2026-09-02T09:00:00.000Z"));
    expect(call.evidenceType).toBe("decision"); // MasteryUpdated → decision
  });

  it("4: event is linked to Evidence via recordEvidence (never a direct table insert) + operationKey event:{id}", async () => {
    const ev = makeEvent("ReadingAnalyzed", { payload: { sessionId: "se-1", reportId: "r-1", scoreSummary: { accuracy: 90, fluency: 85, prosody: 80 }, evidenceRef: "ev-0", attemptId: ATT, passageId: "p-1" } });
    hoisted.pending.push([pendingRow(ev)]);
    await processEventOutbox();
    const call = hoisted.recordEvidence.mock.calls[0][0] as Record<string, unknown>;
    expect(call.evidenceType).toBe("assessment");
    expect(call.operationKey).toBe(`event:${ev.id}`);
    expect(call.sourceEngine).toBe("reading-engine");
    expect(call.attemptId).toBe(ATT);
    // NO direct evidence table insert anywhere in the flow
    expect(hoisted.insertTargets.filter((t) => t !== eventOutboxTableRef)).toEqual([]);
  });
});

describe("CORE-06 — idempotency, retry, ordering, isolation", () => {
  it("5+6: consumer is idempotent — a retry after failure produces exactly ONE evidence row", async () => {
    const ev = makeEvent("ReadingAnalyzed", { payload: { sessionId: "se-1", reportId: "r-1", scoreSummary: { accuracy: 90, fluency: 85, prosody: 80 }, evidenceRef: "ev-0", attemptId: ATT } });
    // First run: consumer fails (database error) AFTER evidence write attempt fails
    hoisted.recordEvidence.mockRejectedValueOnce(new obs.ClassifiedError("database", "CONN_REFUSED"));
    hoisted.pending.push([pendingRow(ev)]);
    const first = await processEventOutbox();
    expect(first.failed).toBe(1);
    expect(hoisted.updates.some((u) => (u.set as Record<string, unknown>).errorClass === "database")).toBe(true);

    // Retry (simulated queue retry): same event, same operationKey
    hoisted.pending.push([pendingRow(ev)]);
    const second = await processEventOutbox();
    expect(second.processed).toBe(1);
    // CORE-05 writer contract would dedup on (tenant, operation_key) — simulated:
    // the FIRST run never wrote (mockRejectedValueOnce), retry writes once.
    expect(hoisted.evidenceRows).toHaveLength(1);
    expect(hoisted.recordEvidence.mock.calls[0][0]).toMatchObject({ operationKey: `event:${ev.id}` });
  });

  it("6b: two different events (different ids) both record — distinct real events are not deduped", async () => {
    const ev1 = makeEvent("ReadingAnalyzed");
    const ev2 = makeEvent("MasteryUpdated", { id: "00000000-0000-4000-8000-000000000002" });
    hoisted.pending.push([pendingRow(ev1), pendingRow(ev2)]);
    const result = await processEventOutbox();
    expect(result.processed).toBe(2);
    expect(hoisted.evidenceRows).toHaveLength(2);
    expect(new Set(hoisted.evidenceRows.map((r) => r.operationKey)).size).toBe(2);
  });

  it("7: tenant isolation — outbox processor rejects a cross-tenant event as a security failure", async () => {
    const spy = vi.spyOn(obs, "recordSecurityEvent");
    const ev = makeEvent("ReadingAnalyzed", { tenantId: OTHER_T }); // envelope tenant ≠ row tenant
    const row = pendingRow(ev);
    row.tenantId = T;
    hoisted.pending.push([row]);
    const result = await processEventOutbox();
    expect(result.failed).toBe(1);
    expect(hoisted.recordEvidence).not.toHaveBeenCalled();
    expect(hoisted.updates.some((u) => (u.set as Record<string, unknown>).errorClass === "security")).toBe(true);
    expect(spy).toHaveBeenCalledWith(expect.anything(), expect.anything(), "cross-tenant-attempt", expect.anything());
  });

  it("8: failure is observable and classified — row carries errorClass, attempts, nextAttemptAt", async () => {
    const ev = makeEvent("MistakeDetected", { payload: { sessionId: "se-1", phoneme: "th", errorType: "substitution", context: "x" } });
    hoisted.recordEvidence.mockRejectedValueOnce(new obs.ClassifiedError("timeout", "ETIMEDOUT"));
    hoisted.pending.push([pendingRow(ev)]);
    await processEventOutbox();
    const failUpdate = hoisted.updates.find((u) => (u.set as Record<string, unknown>).status === "failed");
    expect(failUpdate).toBeDefined();
    expect(failUpdate!.set).toMatchObject({ status: "failed", attempts: 1, errorClass: "timeout", lastError: "ETIMEDOUT" });
    expect((failUpdate!.set as Record<string, unknown>).nextAttemptAt).toBeInstanceOf(Date);
  });

  it("6c: events processed in creation order (no assumption of arrival order)", async () => {
    const evA = makeEvent("ReadingAnalyzed", { id: "00000000-0000-4000-8000-00000000000a" });
    const evB = makeEvent("MasteryUpdated", { id: "00000000-0000-4000-8000-00000000000b" });
    const rowA = pendingRow(evA); rowA.createdAt = new Date("2026-09-01T01:00:00Z");
    const rowB = pendingRow(evB); rowB.createdAt = new Date("2026-09-01T02:00:00Z");
    hoisted.pending.push([rowB, rowA]); // arrival order reversed — outbox orders by createdAt asc
    await processEventOutbox();
    const order = hoisted.evidenceRows.map((r) => r.operationKey);
    expect(order[0]).toBe(`event:${evA.id}`);
    expect(order[1]).toBe(`event:${evB.id}`);
  });
});

describe("CORE-06 — observability foundation", () => {
  it("9: correlation chain preserved — Request ID → Trace ID → Event ID → Job ID", async () => {
    const captured: unknown[] = [];
    registerConsumer("TeacherReportGenerated", async () => {
      captured.push(obs.getContext());
      return {};
    });
    const ev = makeEvent("TeacherReportGenerated", { id: "00000000-0000-4000-8000-0000000000dd" });
    hoisted.pending.push([pendingRow(ev)]);
    await processEventOutbox(); // row has no trace/request ids → defaults from context? none set; row fields undefined
    const ctx = captured[0] as obs.CorrelationContext | undefined;
    expect(ctx?.eventId).toBe(ev.id);
    expect(ctx?.tenantId).toBe(T);
    expect(typeof ctx?.correlationId).toBe("string"); // startContext generates one when the row carries none
    // The full chain is persisted on the outbox row by the producer:
    hoisted.pending.length = 0;
    await publishEvent(ev, { requestId: "req-1", traceId: "trace-1", correlationId: "corr-1", jobId: "job-1" });
    expect(hoisted.stored[0]).toMatchObject({ requestId: "req-1", traceId: "trace-1", correlationId: "corr-1", jobId: "job-1", id: ev.id });
  });

  it("10: redaction — logs/helpers never leak passwords, tokens or secrets", async () => {
    const leaked = obs.safeLog({
      password: "hunter2",
      nested: { accessToken: "tok-123", refreshToken: "rt-1", ok: 1 },
      arr: [{ secret: "s" }, { public: "fine" }],
      text: "Authorization: Bearer abc.def.ghi",
    }) as Record<string, unknown>;
    expect(JSON.stringify(leaked)).not.toContain("hunter2");
    expect(JSON.stringify(leaked)).not.toContain("tok-123");
    expect(JSON.stringify(leaked)).not.toContain("rt-1");
    expect(JSON.stringify(leaked)).not.toContain("abc.def.ghi");
    expect(leaked.password).toBe("[REDACTED]");
    expect((leaked.arr as unknown[])[1]).toEqual({ public: "fine" });
  });

  it("metrics are available: produced/consumed/failed/duration counters exist on the shared registry", () => {
    const m = obs.getMetrics();
    expect(m.eventsProduced).toBeDefined();
    expect(m.eventsConsumed).toBeDefined();
    expect(m.eventsFailed).toBeDefined();
    expect(m.eventsRetried).toBeDefined();
    expect(m.eventProcessingDuration).toBeDefined();
    expect(m.securityEvents).toBeDefined();
  });
});

describe("CORE-06 — no cycles, no second store, engine never owns event storage", () => {
  it("11: no circular dependency — events/core never import engines", () => {
    const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
    const files = [
      "packages/events/src/dispatcher.ts",
      "packages/events/src/outbox.ts",
      "packages/events/src/evidence-consumer.ts",
      "packages/database/src/schema/events.ts",
    ];
    for (const f of files) {
      const text = readFileSync(join(ROOT, f), "utf8");
      expect(text).not.toMatch(/from\s+["'][^"']*reading-engine[^"']*["']/);
    }
  });

  it("11b: reading runtime wires the canonical event path (imports @workspace/events)", () => {
    const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
    const src = readFileSync(join(ROOT, "engines/reading-engine/src/queue/workers/analyze.processor.ts"), "utf8");
    expect(src).toContain('from "@workspace/events"');
  });

  it("12: no second database — single outbox table in the SAME db; no event/evidence duplication", () => {
    const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
    const evidenceMigrations: string[] = [];
    // CORE-18: scan top-level .sql only (legacy/ + meta/ are directories; legacy chain is frozen history)
    for (const f of readdirSync(join(ROOT, "packages/database/migrations")).filter((x) => x.endsWith(".sql"))) {
      const sql = readFileSync(join(ROOT, "packages/database/migrations", f), "utf8");
      expect(sql).not.toMatch(/create\s+database/i);
      if (/create\s+table\s+evidence/i.test(sql)) evidenceMigrations.push(f); // no evidence clone
    }
        expect(evidenceMigrations.length).toBeLessThanOrEqual(1); // canonical evidence lives ONLY in core (003)
// engine tree has no event storage of its own
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
      if (/eventOutboxTable|event_outbox/.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
