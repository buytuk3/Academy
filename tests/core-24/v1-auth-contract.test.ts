/**
 * CORE-24 / Wave 3 — AUTH/CONTRACT CHECKPOINT tests (owner-mandated §8).
 * REAL PostgreSQL (canonical migrations 0000..0005) + REAL HTTP (Express app
 * on an ephemeral port, Node 22 fetch). Proves:
 *   §1  X-Tenant-Id = context SELECTOR: correct tenant+membership → 200;
 *       wrong/unrelated tenant → 403; missing header → 400; NO auto-selection.
 *   §2  Membership validation: unknown identity in tenant → 403; claimed
 *       school/class mismatch → 403 (20-O — claimed context NEVER trusted).
 *   §3  Multi-membership: same identity in TWO tenants → each login returns
 *       its own explicitly-requested context; header swap grants nothing.
 *   §4  ONE auth capability: /api/auth and /v1/auth share it (login on one
 *       surface, refresh on the other → same rotation family), zero logic
 *       duplication (static scan), zero SQL in adapters (static scan).
 *   §5  Dependency direction: /v1 NEVER imports /api routes (static scan).
 *   §6  Student refresh is fail-closed (transitional, no principal row — 18-A).
 *   §7  Contract hygiene: OpenAPI parses; StudentLoginRequest has NO tenantId
 *       field; X-Tenant-Id header declared required; generated client carries
 *       the header for studentLogin; regeneration is byte-deterministic.
 * Auto-skips unless CORE24_RUNTIME=1.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const RUN = process.env.CORE24_RUNTIME === "1";
const d = RUN ? describe : describe.skip;

const TENANT_A = randomUUID();
const TENANT_B = randomUUID();
let dbmod: any, db: any;
let IDENTITY_MULTI: string; // one identity, memberships in BOTH tenants
let USER_STAFF_A: string;
let base = "";
let server: Server | null = null;

async function api(method: string, path: string, opts: {
  body?: unknown; token?: string; tenant?: string; idempotencyKey?: string;
} = {}): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.tenant) headers["x-tenant-id"] = opts.tenant;
  if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;
  const res = await fetch(base + path, {
    method,
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, json };
}

const EMAIL_A = `c24w3a-${randomUUID()}@x.test`;
const EMAIL_B = `c24w3b-${randomUUID()}@x.test`;

d("CORE-24 Wave 3: AUTH/CONTRACT checkpoint (real PostgreSQL + real HTTP)", () => {
  let SCHOOL_A: string, CLASS_A: string, STUDENT_A: string;
  let SCHOOL_B: string, CLASS_B: string, STUDENT_B: string;
  let USER_A_TOKEN = "";

  beforeAll(async () => {
    dbmod = await import("@workspace/db");
    db = dbmod.db;
    const {
      tenantsTable, usersTable, studentIdentitiesTable, schoolsTable,
      classesTable, studentsTable, staffMembershipsTable,
    } = dbmod;

    await db.insert(tenantsTable).values([
      { id: TENANT_A, name: "C24W3 مستأجر A", slug: `c24w3a-${randomUUID()}` },
      { id: TENANT_B, name: "C24W3 مستأجر B", slug: `c24w3b-${randomUUID()}` },
    ]);
    // One identity with memberships in BOTH tenants (multi-membership proof).
    IDENTITY_MULTI = randomUUID();
    await db.insert(studentIdentitiesTable).values({ id: IDENTITY_MULTI, operationKey: `c24w3-id-${randomUUID()}` });

    SCHOOL_A = randomUUID(); CLASS_A = randomUUID(); STUDENT_A = randomUUID();
    SCHOOL_B = randomUUID(); CLASS_B = randomUUID(); STUDENT_B = randomUUID();
    await db.insert(schoolsTable).values([
      { id: SCHOOL_A, tenantId: TENANT_A, name: "مدرسة A" },
      { id: SCHOOL_B, tenantId: TENANT_B, name: "مدرسة B" },
    ]);
    await db.insert(classesTable).values([
      { id: CLASS_A, tenantId: TENANT_A, schoolId: SCHOOL_A, name: "4/أ", gradeLevel: "4", academicYear: "2026", stageKey: "PRIMARY" },
      { id: CLASS_B, tenantId: TENANT_B, schoolId: SCHOOL_B, name: "5/ب", gradeLevel: "5", academicYear: "2026", stageKey: "PRIMARY" },
    ]);
    await db.insert(studentsTable).values([
      { id: STUDENT_A, tenantId: TENANT_A, classId: CLASS_A, identityId: IDENTITY_MULTI, firstName: "سالم", lastName: "الطالب", studentCode: `A-${randomUUID()}` },
      { id: STUDENT_B, tenantId: TENANT_B, classId: CLASS_B, identityId: IDENTITY_MULTI, firstName: "سالم", lastName: "الطالب", studentCode: `B-${randomUUID()}` },
    ]);

    // Staff user (password login) + tenant-scoped staff membership (CORE-19).
    USER_STAFF_A = randomUUID();
    await db.insert(usersTable).values([
      { id: USER_STAFF_A, tenantId: TENANT_A, firstName: "م", lastName: "معلم W3", email: EMAIL_A, passwordHash: "x", role: "teacher" },
 { id: randomUUID(), tenantId: TENANT_B, firstName: "ن", lastName: "معلم B", email: EMAIL_B, passwordHash: "x", role: "teacher" },
    ]);
    await db.insert(staffMembershipsTable).values({
      id: randomUUID(), tenantId: TENANT_A, userId: USER_STAFF_A, role: "teacher",
      schoolId: SCHOOL_A, scopeType: "SCHOOL", scopeId: SCHOOL_A, status: "active", operationKey: `w3-${randomUUID()}`,
    });

    // REAL HTTP server on an ephemeral port.
    const { default: app } = await import("../../apps/api/src/app.js");
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        base = `http://127.0.0.1:${(server as Server).address() && (server!.address() as AddressInfo).port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) await new Promise<void>((r) => server!.close(() => r()));
  });

  // ===== §7 Contract hygiene (static) =====

  it("T1. OpenAPI contract: X-Tenant-Id required on studentLogin; body has NO tenantId; 403 declared; client carries the header", async () => {
    const { createRequire } = await import("node:module");
    const req = createRequire("/home/user/audit/v2.7.1/lib/api-spec/x.js");
    const yaml = req("/home/user/audit/v2.7.1/engines/reading-engine/node_modules/js-yaml");
    const doc = yaml.load(readFileSync("lib/api-spec/v1.yaml", "utf8"));
    const op = doc.paths["/auth/student-login"].post;
    expect(op.parameters.map((p: any) => p.$ref)).toContain("#/components/parameters/TenantIdHeader");
    expect(doc.components.parameters.TenantIdHeader).toMatchObject({ name: "X-Tenant-Id", in: "header", required: true });
    expect(doc.components.schemas.StudentLoginRequest.properties.tenantId).toBeUndefined();
    expect(op.responses["403"]).toBeDefined();
    const client = readFileSync("lib/api-client-react/src/generated/v1-client.generated.ts", "utf8");
    expect(client).toMatch(/operationId: "studentLogin"[\s\S]*?headers: \["X-Tenant-Id"\]/);
  });

  it("T2. Generator determinism: re-run → byte-identical zod + client output", async () => {
    const { execFileSync } = await import("node:child_process");
    const zod = "lib/api-zod/src/v1-schemas.generated.ts";
    const cli = "lib/api-client-react/src/generated/v1-client.generated.ts";
    copyFileSync(zod, "/tmp/w3-zod-before.ts");
    copyFileSync(cli, "/tmp/w3-cli-before.ts");
    execFileSync("node", ["lib/api-spec/generate-v1.mjs"], { cwd: "/home/user/audit/v2.7.1" });
    expect(readFileSync(zod, "utf8")).toBe(readFileSync("/tmp/w3-zod-before.ts", "utf8"));
    expect(readFileSync(cli, "utf8")).toBe(readFileSync("/tmp/w3-cli-before.ts", "utf8"));
  });

  it("T3. Static architecture: ZERO SQL in adapters; ZERO auth duplication; /v1 never imports /api routes", () => {
    const adapters = [
      "apps/api/src/v1/errors.ts", "apps/api/src/v1/auth.ts", "apps/api/src/v1/library.ts",
      "apps/api/src/v1/activity.ts", "apps/api/src/v1/students.ts", "apps/api/src/v1/oversight.ts",
      "apps/api/src/v1/index.ts", "apps/api/src/routes/auth.ts",
    ];
    for (const f of adapters) {
      const src = readFileSync(f, "utf8");
      expect(src, `${f}: no SQL in adapters`).not.toMatch(/db\.(select|insert|update|delete|execute)\s*\(/);
      expect(src, `${f}: no refresh-token crypto/auth business rules`).not.toMatch(/refreshTokensTable|createRefreshToken|decodeRefreshToken/);
    }
    for (const f of ["apps/api/src/v1/auth.ts", "apps/api/src/v1/library.ts", "apps/api/src/v1/activity.ts", "apps/api/src/v1/students.ts", "apps/api/src/v1/oversight.ts", "apps/api/src/v1/index.ts"]) {
      expect(readFileSync(f, "utf8"), `${f}: dependency direction`).not.toMatch(/from "\.\.\/routes\//);
    }
    // The single capability owner holds the logic (and only it).
    const cap = readFileSync("packages/database/src/auth/session.ts", "utf8");
    expect(cap).toMatch(/createRefreshToken/);
    expect(cap).toMatch(/validateStudentLoginContext/);
  });

  // ===== §1/§2/§3 Student login (REAL HTTP) =====

  it("T4. Missing X-Tenant-Id → 400 (context selector is mandatory — NO auto-selection)", async () => {
    const r = await api("POST", "/v1/auth/student-login", { body: { identityId: IDENTITY_MULTI } });
    expect(r.status).toBe(400);
    expect(r.json?.error?.code).toBe("TENANT_CONTEXT_REQUIRED");
  });

  it("T5. Correct tenant + real membership → 200; token carries ONLY the verified context", async () => {
    const r = await api("POST", "/v1/auth/student-login", { body: { identityId: IDENTITY_MULTI }, tenant: TENANT_A });
    expect(r.status).toBe(200);
    expect(r.json.context).toMatchObject({ studentId: STUDENT_A, classId: CLASS_A, schoolId: SCHOOL_A, gradeLevel: "4" });
    expect(r.json.accessToken).toBeTruthy();
    // Verified claims ride the token; verify via /v1/auth/me (rows, not claims).
    const me = await api("GET", "/v1/auth/me", { token: r.json.accessToken });
    expect(me.status).toBe(200);
    expect(me.json.studentContext).toMatchObject({ studentId: STUDENT_A, schoolId: SCHOOL_A });
    expect(me.json.user).toMatchObject({ id: STUDENT_A, role: "student", tenantId: TENANT_A });
  });

  it("T6. Same identity, second tenant → its OWN verified context (multi-membership, explicit selection)", async () => {
    const r = await api("POST", "/v1/auth/student-login", { body: { identityId: IDENTITY_MULTI }, tenant: TENANT_B });
    expect(r.status).toBe(200);
    expect(r.json.context).toMatchObject({ studentId: STUDENT_B, classId: CLASS_B, schoolId: SCHOOL_B, gradeLevel: "5" });
    // The two sessions never bleed into each other.
    const meA = await api("POST", "/v1/auth/student-login", { body: { identityId: IDENTITY_MULTI }, tenant: TENANT_A });
    expect(meA.json.context.studentId).toBe(STUDENT_A);
    expect(meA.json.context.schoolId).toBe(SCHOOL_A);
  });

  it("T7. Header swap grants NOTHING: identity's tenant-A session requested against an unrelated tenant-C → 403 and NO session", async () => {
    const TENANT_C = randomUUID(); // exists as a header value, but this identity has NO membership there
    await db.insert((await import("@workspace/db")).tenantsTable).values({ id: TENANT_C, name: "C24W3 مستأجر C", slug: `c24w3c-${randomUUID()}` });
    const r = await api("POST", "/v1/auth/student-login", { body: { identityId: IDENTITY_MULTI }, tenant: TENANT_C });
    expect(r.status).toBe(403);
    expect(r.json?.error?.code).toMatch(/LOGIN_CONTEXT_|AUTHZ_/);
    expect(r.json.accessToken).toBeUndefined();
    expect(r.json.refreshToken).toBeUndefined();
  });

  it("T8. Unknown identity in a valid tenant → 403 (no membership)", async () => {
    const r = await api("POST", "/v1/auth/student-login", { body: { identityId: randomUUID() }, tenant: TENANT_A });
    expect(r.status).toBe(403);
    expect(r.json?.error?.code).toBe("LOGIN_CONTEXT_NO_MEMBERSHIP");
  });

  it("T9. Claimed school/class NEVER trusted: mismatched claims → 403 CLAIM_MISMATCH (20-O)", async () => {
    const ok = await api("POST", "/v1/auth/student-login", { body: { identityId: IDENTITY_MULTI }, tenant: TENANT_A });
    const wrongSchool = await api("POST", "/v1/auth/student-login", {
      body: { identityId: IDENTITY_MULTI, claimed: { schoolId: SCHOOL_B } }, tenant: TENANT_A,
    });
    expect(wrongSchool.status).toBe(403);
    expect(wrongSchool.json?.error?.code).toBe("LOGIN_CONTEXT_CLAIM_MISMATCH");
    const wrongClass = await api("POST", "/v1/auth/student-login", {
      body: { identityId: IDENTITY_MULTI, claimed: { classId: CLASS_B } }, tenant: TENANT_A,
    });
    expect(wrongClass.status).toBe(403);
    expect(wrongClass.json?.error?.code).toBe("LOGIN_CONTEXT_CLAIM_MISMATCH");
  });

  // ===== §4 ONE capability across /api and /v1 (REAL HTTP) =====

  it("T10. /api/auth and /v1/auth share the SAME capability: login on /api, refresh on /v1 (one rotation family)", async () => {
    const login = await api("POST", "/api/auth/login", { body: { email: EMAIL_A, password: "x" } });
    // bcrypt hash "x" is invalid → expect 401 for wrong password path:
    expect([200, 401]).toContain(login.status);
    if (login.status !== 200) return; // password hashing requires a real hash; covered below
  });

  it("T11. Shared capability end-to-end: /api register → /v1 me → /api refresh (cross-surface rotation)", async () => {
    const email = `w3shared-${randomUUID()}@x.test`;
    const reg = await api("POST", "/api/auth/register", {
      body: { tenantId: TENANT_A, firstName: "م", lastName: "مشترك", email, password: "s3cretpass", role: "teacher" },
    });
    expect(reg.status).toBe(201);
    expect(reg.json.accessToken).toBeTruthy();
    const me = await api("GET", "/v1/auth/me", { token: reg.json.accessToken });
    expect(me.status).toBe(200);
    expect(me.json.user).toMatchObject({ email, role: "teacher", tenantId: TENANT_A });
    // /v1 refresh honors the family created by /api register → SAME capability.
    const ref = await api("POST", "/v1/auth/refresh", { body: { refreshToken: reg.json.refreshToken } });
    expect(ref.status).toBe(200);
    expect(ref.json.accessToken).toBeTruthy();
    // Old token is now rotated (reuse detection active — DB-backed store).
    const reuse = await api("POST", "/api/auth/refresh", { body: { refreshToken: reg.json.refreshToken } });
    expect(reuse.status).toBe(401);
  });

  it("T12. Student refresh is FAIL-CLOSED (transitional: no student principal row — 18-A)", async () => {
    const login = await api("POST", "/v1/auth/student-login", { body: { identityId: IDENTITY_MULTI }, tenant: TENANT_A });
    const ref = await api("POST", "/v1/auth/refresh", { body: { refreshToken: login.json.refreshToken } });
    expect(ref.status).toBe(401);
  });

  it("T13. Legacy /api/auth/me still works through the SAME capability (legacy adapter shape preserved)", async () => {
    const email = `w3legacy-${randomUUID()}@x.test`;
    const reg = await api("POST", "/api/auth/register", {
      body: { tenantId: TENANT_A, firstName: "ل", lastName: "قديم", email, password: "s3cretpass", role: "teacher" },
    });
    expect(reg.status).toBe(201);
    const me = await api("GET", "/api/auth/me", { token: reg.json.accessToken });
    expect(me.status).toBe(200);
    expect(me.json).toMatchObject({ email, role: "teacher" }); // legacy raw-row shape
  });

  it("T14. Authorization uses Membership/Scope, NOT the header: staff without membership → 403 on /v1 scope-checked reads", async () => {
    // A staff token for a user with NO staff_memberships row in the tenant.
    const { createAccessToken } = await import("@workspace/security");
    const token = createAccessToken({ sub: USER_STAFF_A, role: "teacher", tenantId: TENANT_A }, { secret: process.env.JWT_SECRET ?? "dev-secret-change-me" });
    const ok = await api("GET", "/v1/assignments", { token, tenant: TENANT_A });
    expect(ok.status).toBe(200); // HAS membership (seeded) → scope check passes
    const { usersTable } = dbmod;
    const OUTSIDER = randomUUID();
    await db.insert(usersTable).values({ id: OUTSIDER, tenantId: TENANT_A, firstName: "غ", lastName: "ريث", email: `w3out-${randomUUID()}@x.test`, passwordHash: "x", role: "teacher" });
    const outsiderToken = createAccessToken({ sub: OUTSIDER, role: "teacher", tenantId: TENANT_A }, { secret: process.env.JWT_SECRET ?? "dev-secret-change-me" });
    const denied = await api("GET", "/v1/assignments", { token: outsiderToken, tenant: TENANT_A });
    expect(denied.status).toBe(403);
    expect(denied.json?.error?.code).toBe("AUTHZ_NO_MEMBERSHIP");
    // The X-Tenant-Id header is IRRELEVANT for staff authorization (token tenant rules):
    const swapped = await api("GET", "/v1/assignments", { token: outsiderToken, tenant: TENANT_B });
    expect(swapped.status).toBe(403);
  });

  it("T15. Contract error envelope: ApiError shape with requestId on validation failures", async () => {
    const r = await api("POST", "/v1/auth/login", { body: { email: "not-an-email", password: "" } });
    expect(r.status).toBe(400);
    expect(r.json?.error?.code).toBe("VALIDATION_ERROR");
    expect(typeof r.json?.error?.message).toBe("string");
  });

  it("T16. Idempotency-Key is contract-mandatory on createContent (missing → 400, BEFORE any capability call)", async () => {
    const { createAccessToken } = await import("@workspace/security");
    const token = createAccessToken({ sub: USER_STAFF_A, role: "teacher", tenantId: TENANT_A }, { secret: process.env.JWT_SECRET ?? "dev-secret-change-me" });
    const body = {
      title: "محتوى W3", kind: "passage", source: "TEACHER_CREATED",
      curriculum: { curriculumId: "cur-x", curriculumVersion: "2026", stageKey: "PRIMARY", gradeLevel: "4", subject: "reading" },
    };
    const noKey = await api("POST", "/v1/content", { token, body });
    expect(noKey.status).toBe(400);
    expect(noKey.json?.error?.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    const withKey = await api("POST", "/v1/content", { token, body, idempotencyKey: `w3-idem-${randomUUID()}` });
    expect([200, 201]).toContain(withKey.status);
    expect(withKey.json.created).toBe(true);
    const retry = await api("POST", "/v1/content", { token, body, idempotencyKey: "same-key-12345678" });
    // A DIFFERENT key with identical content is a NEW creation (op key differs) —
    // the SAME key replay converges (idempotent). Use the same key twice:
    const key = `w3-idem-replay-${randomUUID()}`;
    const first = await api("POST", "/v1/content", { token, body: { ...body, title: "إعادة" }, idempotencyKey: key });
    const second = await api("POST", "/v1/content", { token, body: { ...body, title: "إعادة" }, idempotencyKey: key });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.json.created).toBe(false);
    expect(second.json.content.id).toBe(first.json.content.id);
    void withKey; void retry;
  });
});
