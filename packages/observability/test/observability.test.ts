import { describe, it, expect } from "vitest";
import { createLogger } from "../src/logger.js";
import {
  startContext,
  runWithContext,
  getContext,
  newRequestId,
} from "../src/correlation.js";
import { startSpan, endSpan } from "../src/trace.js";
import { createMetrics } from "../src/metrics.js";

describe("observability: logger initialization", () => {
  it("creates a logger at the requested level", () => {
    const log = createLogger({ level: "debug", name: "unit" });
    expect(log.level).toBe("debug");
    expect(log).toBeDefined();
    expect(() => log.info("hello")).not.toThrow();
  });
});

describe("observability: request id + correlation", () => {
  it("exposes requestId inside the context", () => {
    const rid = newRequestId();
    let seen: string | undefined;
    runWithContext(startContext({ requestId: rid }), () => {
      seen = getContext()?.requestId;
    });
    expect(seen).toBe(rid);
  });

  it("defaults to fresh ids outside context calls", () => {
    const ctx = startContext();
    expect(ctx.requestId).toBeTruthy();
    expect(ctx.correlationId).toBeTruthy();
  });
});

describe("observability: metrics", () => {
  it("counters increment and registry exposes them", async () => {
    const m = createMetrics();
    m.httpRequests.inc({ route: "/health", status: 200 });
    m.errors.inc({ component: "unit" });
    // prom-client v15: getSingleMetric returns a Promise
    const metric = await m.registry.getSingleMetric("buytuk_http_requests_total");
    expect(metric).toBeDefined();
    const obj = await metric!.get();
    expect(obj.values).toHaveLength(1);
    expect(obj.values[0].value).toBe(1);
  });
});

describe("observability: trace propagation", () => {
  it("child span inherits traceId and reports duration", () => {
    const root = startSpan("root");
    const child = startSpan("child", root);
    expect(child.traceId).toBe(root.traceId);
    expect(child.parentSpanId).toBe(root.spanId);
    const r = endSpan(child);
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });
});
