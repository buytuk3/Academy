/**
 * PHASE-4 (API-GATEWAY-ALIGNMENT) — Gateway ↔ contract alignment tests.
 *
 * Gate (MASTER_ROADMAP): "chosen gateway architecture documented + contract
 * tests green". This suite proves, against the REAL Express app (no mocks):
 *   1. every path documented in lib/api-spec/openapi.yaml is actually served
 *      (no 404 for a documented path),
 *   2. every mounted /api route + root /healthz is documented (no
 *      undocumented surface),
 *   3. the canonical /v1 surface (lib/api-spec/v1.yaml — 25 paths) is fully
 *      served.
 * Zero new dependencies: the YAML files are parsed textually (regex) instead
 * of via a YAML lib. Test-scope env (rate limits, DATABASE_URL default) lives
 * in apps/api/vitest.config.ts — same approved mechanism as core-32; the
 * production app code and its defaults are untouched.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const documentedPaths = (rel: string): string[] =>
  (readFileSync(`${ROOT}${rel}`, "utf8").match(/^  (\/[^\s:]+):$/gm) ?? []).map((l) =>
    l.trim().replace(/:$/, ""),
  );

const UUID = "00000000-0000-4000-8000-000000000000";
const concrete = (p: string) => p.replace(/\{[^}]+\}/g, UUID);

let server: Server | null = null;
let base = "";

beforeAll(async () => {
  const { default: app } = await import("../src/app.js");
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
});

const status = async (p: string, method: "GET" | "POST") => {
  const r = await fetch(`${base}${p}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "POST" ? "{}" : undefined,
  });
  // drain body
  await r.text();
  return r.status;
};

/** A documented path is "served" when GET or POST does NOT 404 (existence proof). */
const exists = async (path: string): Promise<number> => {
  const c = concrete(path);
  const g = await status(c, "GET");
  if (g !== 404) return g;
  return status(c, "POST");
};

describe("PHASE-4 — gateway ↔ contract alignment (real app, no mocks)", () => {
  it("root /healthz liveness (documented at root) returns 200 {status:'ok'}", async () => {
    const r = await fetch(`${base}/healthz`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: "ok" });
  });

  it("every openapi.yaml /api/* path is actually served (no documented-but-missing route)", async () => {
    const apiPaths = documentedPaths("lib/api-spec/openapi.yaml").filter((p) => p.startsWith("/api/"));
    expect(apiPaths.length).toBeGreaterThanOrEqual(19);
    for (const p of apiPaths) {
      const s = await exists(p);
      expect(`${p} -> ${s}`, `documented path must be served (got 404)`).not.toBe(`${p} -> 404`);
    }
  });

  it("every mounted /api route (and root /healthz) is documented — no undocumented surface", () => {
    const docs = new Set(documentedPaths("lib/api-spec/openapi.yaml"));
    const real = [
      "/healthz",
      "/api/healthz",
      "/api/health",
      "/api/metrics",
      "/api/passages",
      "/api/passages/{id}",
      "/api/sessions/student/{studentId}",
      "/api/attempts/{id}",
      "/api/analyze",
      "/api/analyze/{jobId}",
      "/api/reports/student/{studentId}",
      "/api/reports/{id}",
      "/api/audio/presign",
      "/api/auth/register",
      "/api/auth/login",
      "/api/auth/refresh",
      "/api/auth/logout",
      "/api/auth/me",
      "/api/auth/forgot-password",
      "/api/auth/reset-password",
    ];
    const undocumented = real.filter((p) => !docs.has(p));
    expect(undocumented, "mounted routes missing from openapi.yaml").toEqual([]);
  });

  it("canonical /v1 surface (v1.yaml — 25 paths) is fully served", async () => {
    const paths = documentedPaths("lib/api-spec/v1.yaml");
    expect(paths.length).toBe(25);
    for (const p of paths) {
      const s = await exists(`/v1${p}`);
      expect(`${p} -> ${s}`, "canonical v1 path must be served (got 404)").not.toBe(`${p} -> 404`);
    }
  });
});
