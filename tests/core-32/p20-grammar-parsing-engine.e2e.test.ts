// PHASE-20 scoped matrix condition (p20-only, mirrors the p17-p19 gates): this
// file performs 3 legit auth flows inside one window; the shared default
// (3/IP) 429s the third. auth-sec keeps MAX=3 in its own process.
process.env.AUTH_RATE_LIMIT_MAX = "10";
/**
 * PHASE-20 (GRAMMAR-PARSING-ENGINE / الإعراب, governing doc v2.1 §3.7) — REAL
 * E2E gate: real Express app (thin /v1/grammar adapter) + real PostgreSQL
 * (core32_verify, RLS enforced) + real Redis. Nothing mocked. The parse is
 * the REAL deterministic rules engine (ADR-041) — no external NLP, no mocks.
 *   P20-1: real parse via HTTP → exact §3.7 i'rab semantics; replay with the
 *          SAME Idempotency-Key → the SAME id (one row; existed=true).
 *   P20-2: no-fake-data — an out-of-scope token is NEEDS_REVIEW (never
 *          guessed); staff may parse for a student of their tenant.
 *   P20-3: RLS fail-closed — tenant-B sees zero tenant-A rows; role gates.
 *   P20-4: §3.3 fire-and-forget — ONE ATTEMPT_SUBMIT event per unique
 *          submit (replays collapse on the same operation key).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const RUN = process.env.CORE32_E2E === "1";
const d = RUN ? describe : describe.skip;

const TENANT_A = randomUUID();
const TENANT_B = randomUUID();
const SCHOOL_A = randomUUID(), CLASS_A = randomUUID();
const SCHOOL_B = randomUUID(), CLASS_B = randomUUID();
const IDENTITY_1 = randomUUID(), STUDENT_1 = randomUUID();
const IDENTITY_B1 = randomUUID(), STUDENT_B1 = randomUUID();
const PRINCIPAL = { sub: randomUUID(), email: "", token: "" };
const TEACHER_A = { sub: randomUUID(), email: "", token: "" };
const TEACHER_B = { sub: randomUUID(), email: "", token: "" };
let STUDENT_TOKEN = "";

let server: Server | null = null;
let base = "";

afterAll(() => {
  server?.close();
});

interface ApiResult { status: number; body: any; json: any }
async function api(method: string, path: string, opts: {
  body?: unknown; token?: string; tenant?: string; idempotencyKey?: string;
} = {}): Promise<ApiResult> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.tenant) headers["x-tenant-id"] = opts.tenant;
  if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;
  const res = await fetch(base + path, {
    method, headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, body: json, json };
}

const opKey = (tag: string) => `p20-${tag}-${randomUUID()}`;

beforeAll(async () => {
  const dbmod = await import("@workspace/db");
  const {
    tenantsTable, studentIdentitiesTable, schoolsTable, classesTable, studentsTable, usersTable,
  } = await import("../../packages/database/src/schema/index.js");
  const { db } = await import("../../packages/database/src/client.js");

  await db.insert(tenantsTable).values([
    { id: TENANT_A, name: "T-P20-A", slug: `p20a-${randomUUID()}` },
    { id: TENANT_B, name: "T-P20-B", slug: `p20b-${randomUUID()}` },
  ]);
  await db.insert(schoolsTable).values([
    { id: SCHOOL_A, tenantId: TENANT_A, name: "مدرسة P20-A" },
    { id: SCHOOL_B, tenantId: TENANT_B, name: "مدرسة P20-B" },
  ]);
  await db.insert(classesTable).values([
    { id: CLASS_A, tenantId: TENANT_A, schoolId: SCHOOL_A, name: "4/أ-P20", gradeLevel: "4", academicYear: "2026", stageKey: "PRIMARY" },
    { id: CLASS_B, tenantId: TENANT_B, schoolId: SCHOOL_B, name: "5/ب-P20", gradeLevel: "5", academicYear: "2026", stageKey: "PRIMARY" },
  ]);
  await db.insert(studentIdentitiesTable).values([
    { id: IDENTITY_1, operationKey: opKey("id1") },
    { id: IDENTITY_B1, operationKey: opKey("idb") },
  ]);
  await db.insert(studentsTable).values([
    { id: STUDENT_1, tenantId: TENANT_A, classId: CLASS_A, identityId: IDENTITY_1, firstName: "صخر", lastName: "P20", studentCode: `P20-${randomUUID()}` },
    { id: STUDENT_B1, tenantId: TENANT_B, classId: CLASS_B, identityId: IDENTITY_B1, firstName: "بلال", lastName: "P20B", studentCode: `P20B-${randomUUID()}` },
  ]);
  await dbmod.startMembership({ identityId: IDENTITY_1, tenantId: TENANT_A, studentId: STUDENT_1, schoolId: SCHOOL_A, classId: CLASS_A, operationKey: opKey("m1") });
  await dbmod.startMembership({ identityId: IDENTITY_B1, tenantId: TENANT_B, studentId: STUDENT_B1, schoolId: SCHOOL_B, classId: CLASS_B, operationKey: opKey("mb") });

  const { hashPassword } = await import("@workspace/security");
  const hash = await hashPassword("s3cretpass");
  TEACHER_A.email = `p20-ta-${randomUUID()}@x.test`;
  TEACHER_B.email = `p20-tb-${randomUUID()}@x.test`;
  PRINCIPAL.email = `p20-pr-${randomUUID()}@x.test`;
  await db.insert(usersTable).values([
    { id: PRINCIPAL.sub, tenantId: TENANT_A, firstName: "مديرة", lastName: "P20", email: PRINCIPAL.email, passwordHash: hash, role: "principal" },
    { id: TEACHER_A.sub, tenantId: TENANT_A, firstName: "معلمة", lastName: "P20", email: TEACHER_A.email, passwordHash: hash, role: "teacher" },
    { id: TEACHER_B.sub, tenantId: TENANT_B, firstName: "معلم", lastName: "P20B", email: TEACHER_B.email, passwordHash: hash, role: "teacher" },
  ]);

  const { default: app } = await import("../../apps/api/src/app.js");
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  });
  await new Promise<void>((resolve) => server!.on("listening", resolve));
  const la = await api("POST", "/v1/auth/login", { body: { email: TEACHER_A.email, password: "s3cretpass" } });
  expect(la.status).toBe(200);
  TEACHER_A.token = la.json.accessToken;
  const lb = await api("POST", "/v1/auth/login", { body: { email: TEACHER_B.email, password: "s3cretpass" } });
  expect(lb.status).toBe(200);
  TEACHER_B.token = lb.json.accessToken;
  const ls = await api("POST", "/v1/auth/student-login", { body: { identityId: IDENTITY_1 }, tenant: TENANT_A });
  expect(ls.status).toBe(200);
  STUDENT_TOKEN = ls.json.accessToken;
});

d("PHASE-20 — grammar-parsing engine (الإعراب) over real HTTP + real PG (§3.7)", () => {
  it("P20-1 [§3.7 REAL parse]: the covered sentence parses exactly; replay converges to the SAME id", async () => {
    const K = `p20-p1-${randomUUID()}`;
    const res = await api("POST", "/v1/grammar/parse", {
      token: STUDENT_TOKEN,
      body: { text: "ذهبَ الطالبُ إلى المدرسةِ في الصباحِ" },
      idempotencyKey: K,
    });
    expect(res.status).toBe(201);
    expect(res.json.existed).toBe(false);
    expect(res.json.reviewCount).toBe(0); // fully covered by the rules scope
    expect(res.json.tokenCount).toBe(6);
    expect(res.json.engineVersion).toBe("1.0.0-rules");
    const tokens = res.json.tokens as Array<{ word: string; type: string; role: string; position: string; mark: string }>;
    expect(tokens.length).toBe(6);
    // exact i'rab per the §3.7 semantics (ADR-041)
    expect(tokens[0]).toMatchObject({ word: "ذهب", type: "fel", role: "فعل ماضٍ", position: "مبني", mark: "على الفتح" });
    expect(tokens[1]).toMatchObject({ word: "الطالب", type: "sem", role: "فاعل", position: "مرفوع", mark: "بالضمة الظاهرة" });
    expect(tokens[2]).toMatchObject({ word: "إلى", type: "harf", role: "حرف جر" });
    expect(tokens[3]).toMatchObject({ word: "المدرسة", position: "مجرور", mark: "بالكسرة الظاهرة" });
    expect(tokens[4]).toMatchObject({ word: "في", type: "harf" });
    expect(tokens[5]).toMatchObject({ word: "الصباح", position: "مجرور" });
    // replay with the SAME key → the SAME id, no second row
    const replay = await api("POST", "/v1/grammar/parse", {
      token: STUDENT_TOKEN,
      body: { text: "ذهبَ الطالبُ إلى المدرسةِ في الصباحِ" },
      idempotencyKey: K,
    });
    expect(replay.status).toBe(200);
    expect(replay.json.existed).toBe(true);
    expect(replay.json.id).toBe(res.json.id);
    // exactly ONE row for the student
    const dbmod = await import("@workspace/db");
    const mine = await dbmod.listGrammarParsings({ tenantId: TENANT_A, studentId: STUDENT_1 });
    expect(mine.length).toBe(1);
  });

  it("P20-2 [no-fake-data]: out-of-scope tokens are NEEDS_REVIEW (never guessed); staff may parse for a student", async () => {
    const res = await api("POST", "/v1/grammar/parse", {
      token: TEACHER_A.token,
      body: { text: "وقف الطالبُ قُبيلَ الفصلِ", studentId: STUDENT_1 },
      idempotencyKey: `p20-p2-${randomUUID()}`,
    });
    expect(res.status).toBe(201);
    expect(res.json.studentId).toBe(STUDENT_1);
    const tokens = res.json.tokens as Array<{ word: string; position: string }>;
    const qabila = tokens.find((t) => t.word === "قُبيل".replace(/[\u064B-\u0652\u0640]/g, ""));
    expect(qabila).toBeTruthy();
    expect(qabila!.position).toBe("NEEDS_REVIEW"); // flagged — NOT fabricated
    const fasl = tokens.find((t) => t.word === "الفصل");
    expect(fasl!.position).toBe("NEEDS_REVIEW"); // ALSO out of scope — honest flagging
    expect(res.json.reviewCount).toBe(2);
    // the student sees both parses on /mine
    const mine = await api("GET", "/v1/grammar/parsings/mine", { token: STUDENT_TOKEN });
    expect(mine.status).toBe(200);
    expect((mine.body.items as unknown[]).length).toBe(2);
  });

  it("P20-3 [RLS fail-closed + role gates]: tenant-B sees zero tenant-A rows; staff surfaces are role-gated", async () => {
    const listA = await api("GET", "/v1/grammar/parsings", { token: TEACHER_A.token });
    expect(listA.status).toBe(200);
    expect((listA.body.items as unknown[]).length).toBe(2);
    // tenant-B list is EMPTY (existence-hiding via RLS)
    const listB = await api("GET", "/v1/grammar/parsings", { token: TEACHER_B.token });
    expect(listB.status).toBe(200);
    expect((listB.body.items as unknown[]).length).toBe(0);
    // a student cannot use the staff list surface
    const denied = await api("GET", "/v1/grammar/parsings", { token: STUDENT_TOKEN });
    expect(denied.status).toBe(403);
    // parse without an Idempotency-Key is rejected
    const noIdem = await api("POST", "/v1/grammar/parse", {
      token: STUDENT_TOKEN, body: { text: "ذهب" },
    });
    expect(noIdem.status).toBe(400);
  });

  it("P20-4 [§3.3 fire-and-forget]: ONE event per unique submit (replays collapse)", async () => {
    const dbmod = await import("@workspace/db");
    const events = await dbmod.listInteractionEvents({ tenantId: TENANT_A, studentId: STUDENT_1, limit: 300 });
    const p20 = events.filter((e: any) => e.detail?.phase === "PHASE-20");
    expect(p20.length).toBe(2); // P20-1 submit + P20-2 submit (the P20-1 replay collapsed)
    expect(p20.every((e: any) => e.eventType === "ATTEMPT_SUBMIT")).toBe(true);
  });
});
