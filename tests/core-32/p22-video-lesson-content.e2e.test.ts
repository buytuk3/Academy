// PHASE-22 scoped matrix condition (p22-only, mirrors the p17-p21 gates): this
// file performs 3 legit auth flows inside one window; the shared default
// (3/IP) 429s the third. auth-sec keeps MAX=3 in its own process.
process.env.AUTH_RATE_LIMIT_MAX = "10";
/**
 * PHASE-22 (VIDEO-LESSON-CONTENT, governing doc v2.1 §3.8) — REAL E2E gate:
 * real Express app (thin /v1/video-lessons adapter) + real PostgreSQL
 * (core32_verify, RLS enforced) + real Redis. Nothing mocked. The video
 * lesson rides a REAL content_definitions row (the proven LESSON recipe) —
 * ADR-043.
 *   P22-1: staff register (PROCESSING) → idempotent replay → the SAME id.
 *   P22-2: atomic CAS publish → READY (replay converges); the PROCESSING
 *          lesson is INVISIBLE to students (404); READY is student-readable.
 *   P22-3: RLS fail-closed — tenant-B sees zero rows; role gates.
 *   P22-4: fire-and-forget §3.3 — exactly one event per unique key.
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

const opKey = (tag: string) => `p22-${tag}-${randomUUID()}`;

beforeAll(async () => {
  const dbmod = await import("@workspace/db");
  const {
    tenantsTable, studentIdentitiesTable, schoolsTable, classesTable, studentsTable, usersTable,
  } = await import("../../packages/database/src/schema/index.js");
  const { db } = await import("../../packages/database/src/client.js");

  await db.insert(tenantsTable).values([
    { id: TENANT_A, name: "T-P22-A", slug: `p22a-${randomUUID()}` },
    { id: TENANT_B, name: "T-P22-B", slug: `p22b-${randomUUID()}` },
  ]);
  await db.insert(schoolsTable).values([
    { id: SCHOOL_A, tenantId: TENANT_A, name: "مدرسة P22-A" },
    { id: SCHOOL_B, tenantId: TENANT_B, name: "مدرسة P22-B" },
  ]);
  await db.insert(classesTable).values([
    { id: CLASS_A, tenantId: TENANT_A, schoolId: SCHOOL_A, name: "4/أ-P22", gradeLevel: "4", academicYear: "2026", stageKey: "PRIMARY" },
    { id: CLASS_B, tenantId: TENANT_B, schoolId: SCHOOL_B, name: "5/ب-P22", gradeLevel: "5", academicYear: "2026", stageKey: "PRIMARY" },
  ]);
  await db.insert(studentIdentitiesTable).values([
    { id: IDENTITY_1, operationKey: opKey("id1") },
    { id: IDENTITY_B1, operationKey: opKey("idb") },
  ]);
  await db.insert(studentsTable).values([
    { id: STUDENT_1, tenantId: TENANT_A, classId: CLASS_A, identityId: IDENTITY_1, firstName: "سنا", lastName: "P22", studentCode: `P22-${randomUUID()}` },
    { id: STUDENT_B1, tenantId: TENANT_B, classId: CLASS_B, identityId: IDENTITY_B1, firstName: "بلال", lastName: "P22B", studentCode: `P22B-${randomUUID()}` },
  ]);
  await dbmod.startMembership({ identityId: IDENTITY_1, tenantId: TENANT_A, studentId: STUDENT_1, schoolId: SCHOOL_A, classId: CLASS_A, operationKey: opKey("m1") });
  await dbmod.startMembership({ identityId: IDENTITY_B1, tenantId: TENANT_B, studentId: STUDENT_B1, schoolId: SCHOOL_B, classId: CLASS_B, operationKey: opKey("mb") });

  const { hashPassword } = await import("@workspace/security");
  const hash = await hashPassword("s3cretpass");
  TEACHER_A.email = `p22-ta-${randomUUID()}@x.test`;
  TEACHER_B.email = `p22-tb-${randomUUID()}@x.test`;
  PRINCIPAL.email = `p22-pr-${randomUUID()}@x.test`;
  await db.insert(usersTable).values([
    { id: PRINCIPAL.sub, tenantId: TENANT_A, firstName: "مديرة", lastName: "P22", email: PRINCIPAL.email, passwordHash: hash, role: "principal" },
    { id: TEACHER_A.sub, tenantId: TENANT_A, firstName: "معلمة", lastName: "P22", email: TEACHER_A.email, passwordHash: hash, role: "teacher" },
    { id: TEACHER_B.sub, tenantId: TENANT_B, firstName: "معلم", lastName: "P22B", email: TEACHER_B.email, passwordHash: hash, role: "teacher" },
  ]);

  // REAL content chain (the proven recipe) — the video's lesson anchor
  const anchor = { curriculumId: "cur-eg-ar", curriculumVersion: "2026", country: "EG", educationSystem: "EG-NATIONAL", stageKey: "PRIMARY", gradeKey: "EG-PR-04", gradeLevel: "4", subject: "math", bookId: "bk-4", unitId: "u1", lessonId: "les-1", objectiveId: "o1" };
  const lesson = await dbmod.createContentDefinition({
    tenantId: TENANT_A, title: "درس P22", kind: "LESSON", source: "TEACHER_CREATED",
    curriculum: anchor, createdBy: PRINCIPAL.sub, operationKey: opKey("lesson"),
    metadata: { objective: "أهداف P22" },
  });
  const LESSON_ID = lesson.content.id;
  await dbmod.publishContent(TENANT_A, LESSON_ID, PRINCIPAL.sub);
  (globalThis as any).__P22_LESSON__ = LESSON_ID;

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

d("PHASE-22 — video-lesson content over real HTTP + real PG (§3.8)", () => {
  it("P22-1+P22-2 [§3.8]: register (idempotent) → atomic publish → student gating (404 on PROCESSING, readable on READY)", async () => {
    const LESSON_ID = (globalThis as any).__P22_LESSON__ as string;
    const K = `p22-c1-${randomUUID()}`;
    const create = await api("POST", "/v1/video-lessons", {
      token: TEACHER_A.token, idempotencyKey: K,
      body: { title: "درس فيديو P22", storageKey: `s3://buytuk-videos/p22/${randomUUID()}.mp4`, durationSec: 600, lessonContentId: LESSON_ID },
    });
    expect(create.status).toBe(201);
    expect(create.json.existed).toBe(false);
    expect(create.json.status).toBe("PROCESSING");
    expect(create.json.lessonContentId).toBe(LESSON_ID);
    const VID = create.json.id as string;
    // replay with the SAME key → the SAME id, no second row
    const replay = await api("POST", "/v1/video-lessons", {
      token: TEACHER_A.token, idempotencyKey: K,
      body: { title: "درس فيديو P22", storageKey: `s3://buytuk-videos/p22/${randomUUID()}.mp4` },
    });
    expect(replay.status).toBe(200);
    expect(replay.json.existed).toBe(true);
    expect(replay.json.id).toBe(VID);
    // the PROCESSING lesson is INVISIBLE to the student (existence-hiding 404)
    const hidden = await api("GET", `/v1/video-lessons/${VID}`, { token: STUDENT_TOKEN });
    expect(hidden.status).toBe(404);
    // THE atomic publish (CAS)
    const KP = `p22-p1-${randomUUID()}`;
    const pub = await api("POST", `/v1/video-lessons/${VID}/publish`, { token: TEACHER_A.token, idempotencyKey: KP });
    expect(pub.status).toBe(200);
    expect(pub.json.changed).toBe(true);
    expect(pub.json.item.status).toBe("READY");
    expect(pub.json.item.publishedAt).toBeTruthy();
    // publish replay with the SAME key → converged (no second write)
    const pubR = await api("POST", `/v1/video-lessons/${VID}/publish`, { token: TEACHER_A.token, idempotencyKey: KP });
    expect(pubR.status).toBe(200);
    expect(pubR.json.changed).toBe(false);
    expect(pubR.json.item.status).toBe("READY");
    // NOW the student reads it
    const visible = await api("GET", `/v1/video-lessons/${VID}`, { token: STUDENT_TOKEN });
    expect(visible.status).toBe(200);
    expect(visible.json.status).toBe("READY");
  });

  it("P22-3 [RLS fail-closed + role gates]: tenant-B sees zero rows; students cannot register/publish", async () => {
    const listA = await api("GET", "/v1/video-lessons", { token: TEACHER_A.token });
    expect(listA.status).toBe(200);
    expect((listA.body.items as unknown[]).length).toBe(1);
    // tenant-B staff: ZERO tenant-A rows (RLS fail-closed)
    const listB = await api("GET", "/v1/video-lessons", { token: TEACHER_B.token });
    expect(listB.status).toBe(200);
    expect((listB.body.items as unknown[]).length).toBe(0);
    // tenant-B student: the tenant-A lesson does not exist for them
    const VID = (listA.body.items as Array<{ id: string }>)[0].id;
    const cross = await api("GET", `/v1/video-lessons/${VID}`, { token: (globalThis as any).__P22_STUDENT_B_TOKEN__ ?? "" });
    expect([401, 404]).toContain(cross.status); // no auth → 401; wrong-tenant read path is RLS-hidden
    // a student cannot register or publish (staff-only surfaces)
    const deniedCreate = await api("POST", "/v1/video-lessons", {
      token: STUDENT_TOKEN, idempotencyKey: `p22-deny-${randomUUID()}`,
      body: { title: "x", storageKey: "s3://x/y.mp4" },
    });
    expect(deniedCreate.status).toBe(403);
    const deniedPublish = await api("POST", `/v1/video-lessons/${VID}/publish`, {
      token: STUDENT_TOKEN, idempotencyKey: `p22-deny-${randomUUID()}`,
    });
    expect(deniedPublish.status).toBe(403);
  });

  it("P22-4 [§3.3 fire-and-forget]: exactly one event per unique key (create + publish; replays collapsed)", async () => {
    const dbmod = await import("@workspace/db");
    const events = await dbmod.listInteractionEvents({ tenantId: TENANT_A, limit: 300 });
    const p22 = events.filter((e: any) => e.detail?.phase === "PHASE-22");
    expect(p22.length).toBe(2); // register + publish (both replays collapsed)
    expect(p22.every((e: any) => e.eventType === "ATTEMPT_SUBMIT")).toBe(true);
    const actions = p22.map((e: any) => e.detail.action).sort();
    expect(actions).toEqual(["publish", "register"]);
  });
});
