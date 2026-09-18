/**
 * PHASE-15 (SCHOOL-ONBOARDING-AND-TEACHER-ASSIGNMENT, governing doc v2.1 §3.1+§3.2)
 * — REAL E2E gate: real Express app (thin /v1 adapter) + real PostgreSQL
 * (core32_verify, RLS enforced) + real Redis. Nothing mocked.
 *   P15-1 §3.1 request → PENDING by default; idempotent retry; NO auto-activation.
 *   P15-2 §3.1 approval flow: explicit principal decision → school created+linked;
 *          idempotent re-decision 200; conflicting decision 409.
 *   P15-3 §3.2 exclusivity: claim wins once (201); second teacher 409
 *          SLOT_ALREADY_CLAIMED; different subject still claimable.
 *   P15-4 §3.2 CONCURRENCY: two simultaneous claims on ONE slot → exactly one
 *          201 and one 409 (the atomic CAS lock, proven under real concurrency).
 *   P15-5 multi-school teacher + audited principal override (duplicate 200;
 *          override on an OPEN slot 409).
 *   P15-6 RLS fail-closed: tenant-B sees zero slots; claim against tenant-A's
 *          school from tenant-B → 404 (invisible, never leaky).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { createAccessToken } from "@workspace/security";

const RUN = process.env.CORE32_E2E === "1";
const d = RUN ? describe : describe.skip;

const TENANT_A = randomUUID();
const TENANT_B = randomUUID();
const S1 = randomUUID(); // pre-existing school (tenant A)
const S2 = randomUUID(); // second school (tenant A) — multi-school proof
const SCHOOL_B = randomUUID();

interface Creds { sub: string; email: string; token: string }
const PRINCIPAL: Creds = { sub: randomUUID(), email: "", token: "" };
const T1: Creds = { sub: randomUUID(), email: "", token: "" };
const T2: Creds = { sub: randomUUID(), email: "", token: "" };
const T3: Creds = { sub: randomUUID(), email: "", token: "" };
const TB: Creds = { sub: randomUUID(), email: "", token: "" };

let server: Server | null = null;
let base = "";
const JWT = process.env.JWT_SECRET ?? "dev-secret-change-me";

afterAll(() => {
  server?.close();
});

interface ApiResult { status: number; body: any }
async function api(
  method: string,
  path: string,
  token: string,
  body?: unknown,
  idemKey?: string,
): Promise<ApiResult> {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(idemKey ? { "Idempotency-Key": idemKey } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: unknown = null;
  try {
    json = await r.json();
  } catch {
    json = null;
  }
  return { status: r.status, body: json };
}

beforeAll(async () => {
  const dbmod = await import("../../packages/database/src/index.js");
  const {
    tenantsTable, schoolsTable, usersTable, staffMembershipsTable,
  } = await import("../../packages/database/src/schema/index.js");
  const { db } = await import("../../packages/database/src/client.js");
  const { hashPassword } = await import("@workspace/security");

  await db.insert(tenantsTable).values([
    { id: TENANT_A, name: "T-P15-A", slug: `p15a-${randomUUID()}` },
    { id: TENANT_B, name: "T-P15-B", slug: `p15b-${randomUUID()}` },
  ]);
  await db.insert(schoolsTable).values([
    { id: S1, tenantId: TENANT_A, name: "مدرسة P15 القائمة", operationKey: `p15-s1-${randomUUID()}` },
    { id: S2, tenantId: TENANT_A, name: "مدرسة P15 الثانية", operationKey: `p15-s2-${randomUUID()}` },
    { id: SCHOOL_B, tenantId: TENANT_B, name: "مدرسة P15-B", operationKey: `p15-sb-${randomUUID()}` },
  ]);

  const hash = await hashPassword("s3cretpass");
  const mk = (c: Creds, first: string, role: string, tenantId: string, schoolId: string) => ({
    id: c.sub, tenantId, firstName: first, lastName: "P15",
    email: `p15-${c.sub.slice(0, 8)}@x.test`, passwordHash: hash, role,
  });
  await db.insert(usersTable).values([
    mk(PRINCIPAL, "مديرة", "principal", TENANT_A, S1),
    mk(T1, "معلم أول", "teacher", TENANT_A, S1),
    mk(T2, "معلم ثان", "teacher", TENANT_A, S1),
    mk(T3, "معلم ثالث", "teacher", TENANT_A, S1),
    mk(TB, "معلم ب", "teacher", TENANT_B, SCHOOL_B),
  ]);
  await db.insert(staffMembershipsTable).values([
    { id: randomUUID(), tenantId: TENANT_A, userId: PRINCIPAL.sub, schoolId: S1, role: "principal", scopeType: "SCHOOL", scopeId: S1, status: "active", operationKey: `p15-m-${randomUUID()}` },
    { id: randomUUID(), tenantId: TENANT_A, userId: T1.sub, schoolId: S1, role: "teacher", scopeType: "SCHOOL", scopeId: S1, status: "active", operationKey: `p15-m-${randomUUID()}` },
    { id: randomUUID(), tenantId: TENANT_A, userId: T2.sub, schoolId: S1, role: "teacher", scopeType: "SCHOOL", scopeId: S1, status: "active", operationKey: `p15-m-${randomUUID()}` },
    { id: randomUUID(), tenantId: TENANT_A, userId: T3.sub, schoolId: S1, role: "teacher", scopeType: "SCHOOL", scopeId: S1, status: "active", operationKey: `p15-m-${randomUUID()}` },
    { id: randomUUID(), tenantId: TENANT_B, userId: TB.sub, schoolId: SCHOOL_B, role: "teacher", scopeType: "SCHOOL", scopeId: SCHOOL_B, status: "active", operationKey: `p15-m-${randomUUID()}` },
  ]);

  const mint = (c: Creds, role: string, tenantId: string, schoolId: string) => {
    c.token = createAccessToken(
      { sub: c.sub, role, tenantId, schoolId, email: `p15-${c.sub.slice(0, 8)}@x.test` },
      { secret: JWT },
      900,
    );
  };
  mint(PRINCIPAL, "principal", TENANT_A, S1);
  mint(T1, "teacher", TENANT_A, S1);
  mint(T2, "teacher", TENANT_A, S1);
  mint(T3, "teacher", TENANT_A, S1);
  mint(TB, "teacher", TENANT_B, SCHOOL_B);

  const { default: app } = await import("../../apps/api/src/app.js");
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  });
  await new Promise<void>((resolve) => server!.on("listening", resolve));
});

d("PHASE-15 — school onboarding + teacher claim engine (real app + real PG/Redis)", () => {
  it("P15-1 [§3.1]: school request → PENDING by default; idempotent retry; NO auto-activation", async () => {
    const name = `مدرسة P15 المطلوبة ${randomUUID().slice(0, 6)}`;
    const key = `p15-req-${randomUUID()}`;
    const first = await api("POST", "/v1/school-requests", T1.token,
      { schoolName: name, stageKey: "PRIMARY", governorate: "القاهرة" }, key);
    expect(first.status).toBe(201);
    expect(first.body.status).toBe("PENDING");
    expect(first.body.existed).toBe(false);

    const retry = await api("POST", "/v1/school-requests", T1.token,
      { schoolName: name, stageKey: "PRIMARY" }, key);
    expect(retry.status).toBe(200);
    expect(retry.body.existed).toBe(true);
    expect(retry.body.id).toBe(first.body.id);

    // no auto-activation anywhere: the requested school must NOT appear as a school
    const schools = await api("GET", "/v1/onboarding/schools", T1.token);
    expect(schools.status).toBe(200);
    const names = JSON.stringify(schools.body);
    expect(names).not.toContain(name);

    // pending visibility for the approver
    const pending = await api("GET", "/v1/school-requests?status=PENDING", PRINCIPAL.token);
    expect(pending.status).toBe(200);
    expect(JSON.stringify(pending.body)).toContain(name);
  });

  it("P15-2 [§3.1]: explicit principal approval → school created+linked; idempotent 200; conflicting decision 409", async () => {
    const name = `مدرسة P15 المعتمدة ${randomUUID().slice(0, 6)}`;
    const created = await api("POST", "/v1/school-requests", T2.token,
      { schoolName: name, stageKey: "PREPARATORY" }, `p15-req-${randomUUID()}`);
    expect(created.status).toBe(201);
    const requestId = created.body.id as string;

    const approve = await api("POST", `/v1/school-requests/${requestId}/decision`, PRINCIPAL.token,
      { decision: "APPROVED", note: "اعتماد إداري" });
    expect(approve.status).toBe(201);
    expect(approve.body.status).toBe("APPROVED");
    expect(approve.body.schoolId).toBeTruthy();

    // the approved school is now real (dropdown source)
    const schools = await api("GET", "/v1/onboarding/schools", T1.token);
    expect(JSON.stringify(schools.body)).toContain(name);

    // idempotent same decision → 200; conflicting decision → 409
    const again = await api("POST", `/v1/school-requests/${requestId}/decision`, PRINCIPAL.token,
      { decision: "APPROVED" });
    expect(again.status).toBe(200);
    expect(again.body.existed).toBe(true);
    const conflict = await api("POST", `/v1/school-requests/${requestId}/decision`, PRINCIPAL.token,
      { decision: "REJECTED" });
    expect(conflict.status).toBe(409);
  });

  it("P15-3 [§3.2]: exclusivity — first claim 201; second teacher 409 SLOT_ALREADY_CLAIMED; other subject claimable", async () => {
    const ensure = await api("POST", "/v1/teaching-slots/ensure", PRINCIPAL.token,
      { schoolId: S1, subjects: ["Math", "English"] });
    expect(ensure.status).toBe(201);

    const c1 = await api("POST", "/v1/teaching-slots/claim", T1.token,
      { schoolId: S1, subject: "Math" }, `p15-cl-${randomUUID()}`);
    expect(c1.status).toBe(201);

    const c2 = await api("POST", "/v1/teaching-slots/claim", T2.token,
      { schoolId: S1, subject: "Math" }, `p15-cl-${randomUUID()}`);
    expect(c2.status).toBe(409);
    expect(c2.body?.error?.code).toBe("SLOT_ALREADY_CLAIMED");

    const c3 = await api("POST", "/v1/teaching-slots/claim", T2.token,
      { schoolId: S1, subject: "English" }, `p15-cl-${randomUUID()}`);
    expect(c3.status).toBe(201); // different slot, same school — fine
  });

  it("P15-4 [§3.2 atomic lock]: two SIMULTANEOUS claims on one slot → exactly one 201 + one 409", async () => {
    const ensure = await api("POST", "/v1/teaching-slots/ensure", PRINCIPAL.token,
      { schoolId: S1, subjects: ["Science"] });
    expect(ensure.status).toBe(201);

    const [r1, r2] = await Promise.all([
      api("POST", "/v1/teaching-slots/claim", T2.token,
        { schoolId: S1, subject: "Science" }, `p15-cl-${randomUUID()}`),
      api("POST", "/v1/teaching-slots/claim", T3.token,
        { schoolId: S1, subject: "Science" }, `p15-cl-${randomUUID()}`),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 409]); // both-winning is structurally impossible
    const winner = r1.status === 201 ? r1 : r2;
    expect(winner.body.schoolId).toBe(S1);
  });

  it("P15-5 [§3.2]: teacher stays multi-school + audited principal override (dup 200; OPEN-slot override 409)", async () => {
    // T1 already holds Math@S1 — claiming Math@S2 must succeed (non-exclusive across schools)
    const ensure2 = await api("POST", "/v1/teaching-slots/ensure", PRINCIPAL.token,
      { schoolId: S2, subjects: ["Math"] });
    expect(ensure2.status).toBe(201);
    const cross = await api("POST", "/v1/teaching-slots/claim", T1.token,
      { schoolId: S2, subject: "Math" }, `p15-cl-${randomUUID()}`);
    expect(cross.status).toBe(201);

    // find the claimed Math@S1 slot and grant an audited override to T3
    const slots = await api("GET", `/v1/teaching-slots?schoolId=${S1}`, PRINCIPAL.token);
    const mathSlot = (slots.body.items as Array<{ subject: string; claimStatus: string; id: string }>)
      .find((s) => s.subject === "Math");
    expect(mathSlot?.claimStatus).toBe("CLAIMED");

    const opKey = `p15-ovr-${randomUUID()}`;
    const grant = await api("POST", "/v1/teaching-slot-overrides", PRINCIPAL.token,
      { slotId: mathSlot!.id, teacherId: T3.sub, roleLabel: "SECOND", reason: "معلم ثانٍ بقرار المديرة" }, opKey);
    expect(grant.status).toBe(201);
    const dup = await api("POST", "/v1/teaching-slot-overrides", PRINCIPAL.token,
      { slotId: mathSlot!.id, teacherId: T3.sub, roleLabel: "SECOND", reason: "معلم ثانٍ بقرار المديرة" }, opKey);
    expect(dup.status).toBe(200);
    expect(dup.body.existed).toBe(true);

    // override on an OPEN slot is rejected (nothing to override): "Arabic" is
    // ensured but never claimed by anyone (English got claimed in P15-3)
    const ensureAr = await api("POST", "/v1/teaching-slots/ensure", PRINCIPAL.token,
      { schoolId: S1, subjects: ["Arabic"] });
    expect(ensureAr.status).toBe(201);
    const slotsAfter = await api("GET", `/v1/teaching-slots?schoolId=${S1}`, PRINCIPAL.token);
    const openSlot = (slotsAfter.body.items as Array<{ subject: string; claimStatus: string; id: string }>)
      .find((s) => s.subject === "Arabic");
    expect(openSlot?.claimStatus).toBe("OPEN");
    const bad = await api("POST", "/v1/teaching-slot-overrides", PRINCIPAL.token,
      { slotId: openSlot!.id, teacherId: T3.sub, roleLabel: "SPECIALIST", reason: "خانة مفتوحة أصلاً" }, `p15-ovr-${randomUUID()}`);
    expect(bad.status).toBe(409);
    expect(bad.body?.error?.code).toBe("OVERRIDE_SLOT_NOT_CLAIMED");
  });

  it("P15-6 [RLS fail-closed]: tenant-B sees zero slots; claim against tenant-A's school → 404 (invisible)", async () => {
    const cross = await api("GET", "/v1/teaching-slots", TB.token);
    expect(cross.status).toBe(200);
    expect(cross.body.items).toEqual([]); // tenant-A slots invisible (fail-closed)

    const leak = await api("POST", "/v1/teaching-slots/claim", TB.token,
      { schoolId: S1, subject: "Math" }, `p15-cl-${randomUUID()}`);
    expect(leak.status).toBe(404); // the school/slot cannot even be resolved cross-tenant
  });
});
