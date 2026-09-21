#!/usr/bin/env node
/**
 * PHASE-26 — zero-dependency load test (ADR-047: no k6/artillery/autocannon).
 * Real HTTP against a REAL app instance; latency percentiles + error count
 * written to a JSON report (the P26 gate asserts the report shape and
 * thresholds).
 *   node scripts/load-test.mjs --base URL --path P --token T \
 *     [--tenant TEN] [--concurrency N] [--total N] [--out FILE]
 */
import { parseArgs } from "node:util";
import { writeFileSync } from "node:fs";

const { values } = parseArgs({
  options: {
    base: { type: "string" },
    path: { type: "string" },
    token: { type: "string" },
    tenant: { type: "string" },
    concurrency: { type: "string", default: "8" },
    total: { type: "string", default: "120" },
    out: { type: "string", default: "/tmp/load-report.json" },
  },
});

const base = values.base.replace(/\/$/, "");
const path = values.path;
const concurrency = Math.max(1, Number(values.concurrency));
const total = Math.max(1, Number(values.total));
const headers = { authorization: `Bearer ${values.token}` };
if (values.tenant) headers["x-tenant-id"] = values.tenant;

const latencies = [];
let errors = 0;
let non200 = 0;
let done = 0;

async function worker() {
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
const pct = (p) => latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))] ?? 0;
const report = {
  base,
  path,
  concurrency,
  total,
  ok: latencies.length - errors - non200,
  errors,
  non200,
  wallMs: Math.round(wallMs),
  rps: Number((total / (wallMs / 1000)).toFixed(2)),
  p50: Math.round(pct(50)),
  p95: Math.round(pct(95)),
  p99: Math.round(pct(99)),
};
writeFileSync(values.out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
process.exit(0);
