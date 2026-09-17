/**
 * PHASE-13 (DEPLOYMENT-TARGET-AND-COVERAGE) — production/deployment/coverage
 * gates. REAL built artifact cold boot + REAL /metrics exposition + REAL
 * container-target contract + REAL coverage evidence + governance alignment.
 * No mocks.
 *   P13-1 DEPL-1 continuity: the BUILT artifact boots cold → 200 /healthz ≤ 5s.
 *   P13-2 OBS continuity: /metrics (root) + /api/metrics expose the canonical
 *         registry of the booted artifact (buytuk_ series present).
 *   P13-3 DEPL-2 container target: pinned multi-stage Dockerfile contract
 *         (non-root, HEALTHCHECK, canonical start cmd, env contract, honest
 *         live-deployment disclosure in the runbook).
 *   P13-4 COV-1: committed coverage evidence meets the enforced thresholds.
 *   P13-5 governance: STAGE_STATUS PHASE-13 CLOSED/PASS (+DEPL-2 disclosure),
 *         CDR coverage row CLOSED at PHASE-13, PROJECT_VERSION 1.17.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RUN = process.env.CORE32_E2E === "1";
const d = RUN ? describe : describe.skip;

const root = fileURLToPath(new URL("../../", import.meta.url));
const DIST = `${root}apps/api/dist/index.mjs`;
const PORT = 48081;
const base = `http://127.0.0.1:${PORT}`;

let child: ChildProcess | null = null;

function waitHealth(url: string, budgetMs: number): Promise<{ ok: boolean; ms: number }> {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const tick = async (): Promise<void> => {
      try {
        const r = await fetch(`${url}/healthz`);
        if (r.ok) return resolve({ ok: true, ms: Date.now() - t0 });
      } catch {
        /* not up yet */
      }
      if (Date.now() - t0 > budgetMs) return resolve({ ok: false, ms: Date.now() - t0 });
      setTimeout(tick, 100);
    };
    void tick();
  });
}

beforeAll(() => {
  child = spawn(process.execPath, [DIST], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: "ignore",
  });
});

afterAll(() => {
  child?.kill("SIGTERM");
});

d("PHASE-13 — production deployment target + coverage gates", () => {
  it("P13-1 [DEPL-1 continuity]: the BUILT artifact boots cold and serves /healthz within 5s", async () => {
    expect(existsSync(DIST)).toBe(true);
    const h = await waitHealth(base, 5000);
    expect(h.ok).toBe(true);
    expect(h.ms).toBeLessThanOrEqual(5000);
  });

  it("P13-2 [OBS continuity]: /metrics and /api/metrics expose the canonical registry of the booted artifact", async () => {
    const a = await fetch(`${base}/metrics`);
    expect(a.status).toBe(200);
    const ta = await a.text();
    expect(ta).toContain("buytuk_");
    const b = await fetch(`${base}/api/metrics`);
    expect(b.status).toBe(200);
    expect(await b.text()).toContain("buytuk_");
  });

  it("P13-3 [DEPL-2 container target]: pinned multi-stage Dockerfile contract (non-root + HEALTHCHECK + canonical start cmd + env contract + honest live-disclosure)", () => {
    const df = readFileSync(`${root}deploy/Dockerfile`, "utf8");
    expect(df).toContain("FROM node:22-bookworm-slim");
    expect(df).toContain("USER node");
    expect(df).toContain("HEALTHCHECK");
    expect(df).toContain('CMD ["node", "dist/index.mjs"]');
    const rb = readFileSync(`${root}deploy/DEPLOYMENT-RUNBOOK.md`, "utf8");
    for (const env of ["PORT", "DATABASE_URL", "JWT_SECRET", "AUDIO_KEK", "REDIS_URL", "INFERENCE_GATEWAY_URL"]) {
      expect(rb).toContain(env);
    }
    expect(rb).toContain("NOT performed"); // live deployment never claimed from the sandbox
  });

  it("P13-4 [COV-1]: committed coverage evidence meets the enforced thresholds (real v8 measurement, committed this phase)", () => {
    const sum = JSON.parse(readFileSync(`${root}docs/evidence/PHASE-13/coverage-summary.json`, "utf8"));
    const th = JSON.parse(readFileSync(`${root}docs/evidence/PHASE-13/coverage-thresholds.json`, "utf8"));
    for (const k of ["lines", "functions", "statements", "branches"] as const) {
      expect(sum.total[k].pct).toBeGreaterThanOrEqual(th.thresholds[k]);
    }
    // at least the meaningful dimensions must have a non-trivial enforced floor
    expect(th.thresholds.lines).toBeGreaterThan(0);
    expect(th.thresholds.statements).toBeGreaterThan(0);
  });

  it("P13-5 [governance]: STAGE_STATUS PHASE-13 CLOSED/PASS (with DEPL-2 disclosure) + CDR coverage row CLOSED at PHASE-13 + PROJECT_VERSION 1.17", () => {
    const ss = readFileSync(`${root}docs/buytuk-master/STAGE_STATUS.md`, "utf8");
    expect(ss).toMatch(/PHASE-13[^\n]*CLOSED \/ PASS/);
    expect(ss).toContain("DEPLOYMENT-TARGET-AND-COVERAGE");
    const cdr = readFileSync(`${root}docs/buytuk-master/CHANGE_DEVIATION_RECORD.md`, "utf8");
    expect(cdr).toMatch(/RESOLVED at the PHASE-13 closeout[^\n]*coverage/i);
    const pv = readFileSync(`${root}docs/reference/PROJECT_VERSION.md`, "utf8");
    expect(pv).toContain("BuyTuk Academy 1.17");
  });
});
