/**
 * CORE-17 — Runtime infrastructure verification against REAL infrastructure.
 * PostgreSQL 16 (canonical drizzle schema pushed) + Redis 7 (canonical queue client).
 * Suites auto-skip unless CORE17_RUNTIME=1.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";

const RUN = process.env.CORE17_RUNTIME === "1";
const d = RUN ? describe : describe.skip;

let dbmod: any;
let qmod: any;

d("CORE-17 runtime infrastructure (real PostgreSQL + real Redis)", () => {
  beforeAll(async () => {
    dbmod = await import("@workspace/db");
    qmod = await import("@workspace/queue");
  });

  it("PostgreSQL: canonical client connects (healthCheck)", async () => {
    expect(await dbmod.healthCheck()).toBe(true);
  });

  it("PostgreSQL: canonical schema present (evidence/outbox/loop/decision/audit tables)", async () => {
    const { sql } = await import("drizzle-orm");
    const res = await dbmod.db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`);
    const rows = Array.isArray(res) ? res : res.rows;
    const tables = rows.map((r: any) => r.table_name ?? r.TABLE_NAME);
    for (const t of [
      "tenants", "schools", "classes", "students", "reading_sessions", "attempts", "passages",
      "evidence", "event_outbox", "learning_diagnoses", "intervention_proposals",
      "learning_reassessments", "learning_outcomes", "audit_logs", "refresh_tokens",
    ]) {
      expect(tables, `missing table ${t}`).toContain(t);
    }
  });

  it("PostgreSQL: evidence idempotency — unique (tenant_id, operation_key) index", async () => {
    const { sql } = await import("drizzle-orm");
    const idx = await dbmod.db.execute(sql`SELECT indexname FROM pg_indexes WHERE tablename='evidence' AND indexname='evidence_operation_key_uniq'`);
    const rows = Array.isArray(idx) ? idx : idx.rows;
    expect(rows.length).toBe(1);
  });

  it("PostgreSQL: FK web (>50 constraints) incl. evidence → tenants/students", async () => {
    const { sql } = await import("drizzle-orm");
    const fks = await dbmod.db.execute(sql`SELECT count(*)::int AS c FROM information_schema.table_constraints WHERE constraint_type='FOREIGN KEY'`);
    const rows = Array.isArray(fks) ? fks : fks.rows;
    expect(rows[0].c).toBeGreaterThan(50);
    const fkEvidence = await dbmod.db.execute(sql`SELECT conname FROM pg_constraint WHERE conrelid='evidence'::regclass AND contype='f'`);
    const names = (Array.isArray(fkEvidence) ? fkEvidence : fkEvidence.rows).map((r: any) => r.conname);
    expect(names.some((n: string) => n.includes("tenants"))).toBe(true);
    expect(names.some((n: string) => n.includes("students"))).toBe(true);
  });

  it("PostgreSQL: evidence canonical columns (tenant/student/type/occurred_at/operation_key)", async () => {
    const { sql } = await import("drizzle-orm");
    const cols = await dbmod.db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name='evidence'`);
    const names = (Array.isArray(cols) ? cols : cols.rows).map((r: any) => r.column_name);
    for (const c of ["tenant_id", "student_id", "evidence_type", "occurred_at", "operation_key", "source_engine"]) {
      expect(names, `missing evidence column ${c}`).toContain(c);
    }
  });

  it("Redis: canonical queue client connects (queueHealthCheck)", async () => {
    expect(await qmod.queueHealthCheck()).toBe(true);
  });

  it("Redis/BullMQ: job enqueue → real worker processes → completed with result", async () => {
    const name = `core17-ok-${randomUUID()}`;
    const queue = qmod.createQueue(name);
    const seen: any[] = [];
    const worker = qmod.createWorker(name, async (job: any) => {
      seen.push(job.data);
      return { ok: true };
    }, { autorun: true });
    await queue.add("core17", { n: 42 }, { jobId: randomUUID() });
    for (let i = 0; i < 100 && seen.length === 0; i++) await new Promise((r) => setTimeout(r, 100));
    expect(seen).toEqual([{ n: 42 }]);
    await worker.close();
    await queue.close();
  });

  it("Redis/BullMQ: failing job (attempts:1) → observable failed state, not lost", async () => {
    const name = `core17-fail-${randomUUID()}`;
    const queue = qmod.createQueue(name, { defaultJobOptions: { attempts: 1 } });
    const worker = qmod.createWorker(name, async () => {
      throw new Error("core17-intentional-failure");
    }, { autorun: true });
    const job = await queue.add("core17", { x: 1 }, { jobId: randomUUID() });
    let state = "";
    for (let i = 0; i < 100; i++) {
      state = await job.getState();
      if (state === "failed") break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(state).toBe("failed");
    await worker.close();
    await queue.close();
  });

  it("Redis/BullMQ: idempotent re-submission — same correlationId → same job, never duplicated", async () => {
    const name = `core17-dedupe-${randomUUID()}`;
    const queue = qmod.createQueue(name, { defaultJobOptions: { removeOnComplete: false, removeOnFail: false } });
    const correlationId = randomUUID();
    const data = { correlationId, sessionId: randomUUID(), text: "نص" };
    const j1 = await queue.add("analyze", data, { jobId: qmod.makeJobId(correlationId) });
    // idempotent re-submission of the SAME logical job → BullMQ keeps the original
    const j2 = await queue.add("analyze", data, { jobId: qmod.makeJobId(correlationId) });
    expect(j2.id).toBe(j1.id); // same job identity — no second copy
    expect(await queue.count()).toBe(1);
    await queue.close();
  });
});
