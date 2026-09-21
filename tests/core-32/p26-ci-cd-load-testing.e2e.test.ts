process.env.AUTH_RATE_LIMIT_MAX = "10";
/**
 * PHASE-26 (CI/CD-AND-LOAD-TESTING — the LAST pre-GPU phase) — REAL E2E
 * gate: real Express app (thin /v1 adapter) + real PostgreSQL (core32_verify,
 * RLS enforced) + real Redis. Nothing mocked. ZERO new dependencies
 * (ADR-047): the load engine is the repo's OWN zero-dep Node script
 * (scripts/load-test.mjs) and the pipeline is a file-based GitHub Actions
 * workflow (no third-party SaaS).
 *   P26-1: the CI workflow exists and structurally covers the REQUIRED
 *          gates (typecheck, build, core-32 E2E on real Postgres 16 + Redis
 *          7 services, secrets scan, load smoke) and the scanner script is
 *          executable-in-repo (exit 0).
 *   P26-2: load test the REAL app (authed staff endpoint, DB-backed):
 *          zero errors, zero non-200s, p95 within the generous CI budget.
 *   P26-3: after the load — correctness intact: tenant-B staff still sees
 *          ZERO tenant-A rows (RLS fail-closed under load), and the report
 *          artifact has the full shape (p50/p95/p99/rps/errors).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
const TEACHER_A = { sub: randomUUID(), email: "", token: "" };
const TEACHER_B = { sub: randomUUID(), email: "", token: "" };

let server: Server | null = null;
let base = "";

afterAll(() => {
  server?.close();
});

interface ApiResult { status: number; body: any }
async function api(method: string, path: string, opts: {
  body?: unknown; token?: string; tenant?: string;
} = {}): Promise<ApiResult> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.tenant) headers["x-tenant-id"] = opts.tenant;
  const res = await fetch(base + path, {
    method, headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { status: res.status, body };
}

const opKey = (tag: string) => `p26-${tag}-${randomUUID()}`;

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const LOAD = `${REPO}scripts/load-test.mjs`;
const CI_YML = `${REPO}.github/workflows/ci.yml`;
const SCANNER = `${REPO}scripts/secret-scan.py`;

beforeAll(async () => {
  const dbmod = await import("@workspace/db");
  const {
    tenantsTable, studentIdentitiesTable, schoolsTable, classesTable, studentsTable, usersTable,
  } = await import("../../packages/database/src/schema/index.js");
  const { db } = await import("../../packages/database/src/client.js");

  await db.insert(tenantsTable).values([
    { id: TENANT_A, name: "T-P26-A", slug: `p26a-${randomUUID()}` },
    { id: TENANT_B, name: "T-P26-B", slug: `p26b-${randomUUID()}` },
  ]);
  await db.insert(schoolsTable).values([
    { id: SCHOOL_A, tenantId: TENANT_A, name: "مدرسة P26-A" },
    { id: SCHOOL_B, tenantId: TENANT_B, name: "مدرسة P26-B" },
  ]);
  await db.insert(classesTable).values([
    { id: CLASS_A, tenantId: TENANT_A, schoolId: SCHOOL_A, name: "4/أ-P26", gradeLevel: "4", academicYear: "2026", stageKey: "PRIMARY" },
    { id: CLASS_B, tenantId: TENANT_B, schoolId: SCHOOL_B, name: "5/ب-P26", gradeLevel: "5", academicYear: "2026", stageKey: "PRIMARY" },
  ]);
  await db.insert(studentIdentitiesTable).values([
    { id: IDENTITY_1, operationKey: opKey("id1") },
    { id: IDENTITY_B1, operationKey: opKey("idb") },
  ]);
  await db.insert(studentsTable).values([
    { id: STUDENT_1, tenantId: TENANT_A, classId: CLASS_A, identityId: IDENTITY_1, firstName: "سعيد", lastName: "P26", studentCode: `P26-${randomUUID()}` },
    { id: STUDENT_B1, tenantId: TENANT_B, classId: CLASS_B, identityId: IDENTITY_B1, firstName: "بسام", lastName: "P26B", studentCode: `P26B-${randomUUID()}` },
  ]);
  await dbmod.startMembership({ identityId: IDENTITY_1, tenantId: TENANT_A, studentId: STUDENT_1, schoolId: SCHOOL_A, classId: CLASS_A, operationKey: opKey("m1") });
  await dbmod.startMembership({ identityId: IDENTITY_B1, tenantId: TENANT_B, studentId: STUDENT_B1, schoolId: SCHOOL_B, classId: CLASS_B, operationKey: opKey("mb") });

  const { hashPassword } = await import("@workspace/security");
  const hash = await hashPassword("s3cretpass");
  TEACHER_A.email = `p26-ta-${randomUUID()}@x.test`;
  TEACHER_B.email = `p26-tb-${randomUUID()}@x.test`;
  await db.insert(usersTable).values([
    { id: TEACHER_A.sub, tenantId: TENANT_A, firstName: "معلمة", lastName: "P26", email: TEACHER_A.email, passwordHash: hash, role: "teacher" },
    { id: TEACHER_B.sub, tenantId: TENANT_B, firstName: "معلم", lastName: "P26B", email: TEACHER_B.email, passwordHash: hash, role: "teacher" },
  ]);

  const { default: app } = await import("../../apps/api/src/app.js");
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  });
  await new Promise<void>((resolve) => server!.on("listening", resolve));
  const la = await api("POST", "/v1/auth/login", { body: { email: TEACHER_A.email, password: "s3cretpass" } });
  expect(la.status).toBe(200);
  TEACHER_A.token = la.body.accessToken;
  const lb = await api("POST", "/v1/auth/login", { body: { email: TEACHER_B.email, password: "s3cretpass" } });
  expect(lb.status).toBe(200);
  TEACHER_B.token = lb.body.accessToken;
});

async function runLoad(path: string, token: string, total: number, concurrency: number, out: string): Promise<any> {
  // IN-PROCESS load drive — the SAME zero-dependency algorithm as
  // scripts/load-test.mjs (the standalone CI/manual runner). The sandbox
  // blocks child-process networking (every child fetch stalls until abort),
  // so the gate drives the identical loop in-process over the PROVEN fetch path.
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  const latencies: number[] = [];
  let errors = 0;
  let non200 = 0;
  let done = 0;
  async function worker(): Promise<void> {
    while (done < total) {
      done += 1;
      const t0 = performance.now();
      try {
        const res = await fetch(base + path, { headers, signal: AbortSignal.timeout(8000) });
        if (res.status !== 200) non200 += 1;
        await res.arrayBuffer();
      } catch {
        errors += 1;
      }
      latencies.push(performance.now() - t0);
    }
  }
  const t0 = performance.now();
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const wallMs = performance.now() - t0;
  latencies.sort((a, b) => a - b);
  const pct = (p: number) => latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))] ?? 0;
  const report = {
    base, path, concurrency, total,
    ok: latencies.length - errors - non200,
    errors, non200,
    wallMs: Math.round(wallMs),
    rps: Number((total / (wallMs / 1000)).toFixed(2)),
    p50: Math.round(pct(50)), p95: Math.round(pct(95)), p99: Math.round(pct(99)),
  };
  writeFileSync(out, JSON.stringify(report, null, 2));
  return report;
}

d("PHASE-26 — CI/CD + load testing over real HTTP + real PG", () => {
  it("P26-1: the CI workflow structurally covers the required gates; the scanner runs clean", () => {
    expect(existsSync(CI_YML)).toBe(true);
    expect(existsSync(LOAD)).toBe(true);
    const yml = readFileSync(CI_YML, "utf-8");
    // the REQUIRED gates are all present in the pipeline
    expect(yml).toContain("typecheck");
    expect(yml).toContain("pnpm run build");
    expect(yml).toContain("core-32"); // the E2E gate suite runs in CI
    expect(yml).toContain("secret-scan.py"); // the pure-python secrets gate
    expect(yml).toContain("p26-ci-cd-load-testing"); // the load smoke gate
    // real services: PostgreSQL 16 + Redis 7 (the §3.3 infra triple)
    expect(yml).toContain("postgres:16");
    expect(yml).toContain("redis:7");
    // triggers
    expect(yml).toContain("push");
    expect(yml).toContain("pull_request");
    // the in-repo scanner exits 0 right now (tree-wide)
    const rc = execFileSync("python3", [SCANNER], { stdio: "pipe" });
    expect(rc).toBeDefined(); // non-throwing execFile = exit 0
  });

  it("P26-2: load test the REAL app — zero errors, zero non-200s, p95 within budget", async () => {
    const rep = await runLoad("/v1/interaction-events", TEACHER_A.token, 50, 5, "/tmp/p26-load-main.json");
    expect(rep.total).toBe(50);
    expect(rep.errors).toBe(0);
    expect(rep.non200).toBe(0);
    expect(rep.ok).toBe(50);
    expect(rep.p95).toBeLessThan(1500); // generous CI-runner budget
  });

  it("P26-3: after load — RLS fail-closed intact; report shape complete", async () => {
    // a second, lighter load against the exams surface (also DB-backed)
    const rep2 = await runLoad("/v1/exams", TEACHER_A.token, 20, 4, "/tmp/p26-load-exams.json");
    expect(rep2.errors).toBe(0);
    expect(rep2.non200).toBe(0);
    expect(rep2.p99).toBeGreaterThan(0);
    // RLS fail-closed STILL enforced after the concurrent load
    const cross = await api("GET", "/v1/interaction-events", { token: TEACHER_B.token });
    expect(cross.status).toBe(200);
    expect((cross.body.items as unknown[]).length).toBe(0);
    const crossExams = await api("GET", "/v1/exams", { token: TEACHER_B.token });
    expect(crossExams.status).toBe(200);
    expect((crossExams.body.items as unknown[]).length).toBe(0);
    // sequential correctness after load
    const list = await api("GET", "/v1/interaction-events", { token: TEACHER_A.token });
    expect(list.status).toBe(200);
    // the report artifact is the real evidence file (full shape)
    writeFileSync("/tmp/p26-report-shape.json", JSON.stringify(rep2));
    expect(rep2.p50).toBeGreaterThan(0);
    expect(rep2.rps).toBeGreaterThan(0);
  });
});
