/**
 * PHASE-5 (SHARED-INFRA-AND-INFERENCE) — @workspace/observability contracts.
 *
 * Gate (MASTER_ROADMAP): "gateway smoke / observability / storage contracts
 * green". This suite proves the observability contracts on the REAL package:
 *   - redact/safeLog: secrets never survive a log line (CORE-06),
 *   - correlation: requestId/correlationId generation + AsyncLocalStorage
 *     propagation (trace chain Request→API→Engine→Queue→Worker→Inference),
 *   - trace: span lifecycle,
 *   - errors: the eight canonical error classes (CORE-06) with the actual
 *     hint precedence (security → authorization → validation → timeout →
 *     database → queue → dependency → application),
 *   - metrics: canonical Prometheus registry (prom-client),
 *   - security: structured security-event recording,
 *   - logger: single-owner pino instance.
 * Pure unit scope — no DB, no network.
 */
import { describe, it, expect } from "vitest";
import {
  redact,
  safeLog,
  newRequestId,
  newCorrelationId,
  startContext,
  runWithContext,
  getContext,
  startSpan,
  endSpan,
  classifyError,
  ClassifiedError,
  ERROR_CLASSES,
  createMetrics,
  createLogger,
  recordSecurityEvent,
} from "../index.js";

describe("PHASE-5 — observability contracts (CORE-06)", () => {
  it("redact/safeLog removes secrets and bearer tokens before any log line", () => {
    const out = redact({
      password: "hunter2",
      token: "abc",
      apiKey: "xyz",
      nested: { authorization: "Bearer abc.def.ghi", refreshtoken: "z" },
      bearerText: "Bearer sk-1234567890",
      keep: "visible",
    }) as Record<string, any>;
    expect(out.password).toBe("[REDACTED]");
    expect(out.token).toBe("[REDACTED]");
    expect(out.apiKey).toBe("[REDACTED]");
    expect(out.nested.authorization).toBe("[REDACTED]");
    expect(out.nested.refreshtoken).toBe("[REDACTED]");
    expect(out.bearerText).toBe("Bearer [REDACTED]");
    expect(out.keep).toBe("visible");
    const sl = safeLog({ secret: "s" }) as Record<string, any>;
    expect(sl.secret).toBe("[REDACTED]");
  });

  it("correlation: unique ids + AsyncLocalStorage propagation (trace chain)", () => {
    expect(newRequestId()).not.toBe(newRequestId());
    expect(newCorrelationId()).not.toBe(newCorrelationId());
    const ctx = startContext({ tenantId: "T-1" });
    expect(ctx.requestId).toBeTruthy();
    expect(ctx.correlationId).toBeTruthy();
    expect(ctx.tenantId).toBe("T-1");
    runWithContext(ctx, () => {
      expect(getContext()?.correlationId).toBe(ctx.correlationId);
      expect(getContext()?.tenantId).toBe("T-1");
    });
    expect(getContext()).toBeUndefined();
  });

  it("trace: span lifecycle yields traceId/spanId/duration", () => {
    const parent = startSpan("op-parent");
    const child = startSpan("op-child", parent);
    expect(child.traceId).toBe(parent.traceId);
    expect(child.parentSpanId).toBe(parent.spanId);
    const ended = endSpan(child);
    expect(ended.traceId).toBe(parent.traceId);
    expect(ended.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("errors: every thrown value classifies into the 8 canonical classes (actual hint precedence)", () => {
    expect(ERROR_CLASSES).toHaveLength(8);
    expect(classifyError(new ClassifiedError("validation", "bad"))).toBe("validation");
    expect(classifyError(new Error("TENANT_MISMATCH leak"))).toBe("security");
    expect(classifyError(new Error("HTTP 403 FORBIDDEN"))).toBe("authorization");
    expect(classifyError(new Error("INVALID_BODY"))).toBe("validation");
    expect(classifyError(new Error("operation TIMEOUT"))).toBe("timeout");
    expect(classifyError(new Error("relation does not exist SQLSTATE 42P01"))).toBe("database");
    expect(classifyError(new Error("bullmq job stalled"))).toBe("queue");
    // DB hints precede dependency hints — 'econnrefused' classifies as database.
    expect(classifyError(new Error("redis connect ECONNREFUSED"))).toBe("database");
    // A dependency failure without any database-hint vocabulary.
    expect(classifyError(new Error("fetch failed: upstream unreachable"))).toBe("dependency");
    expect(classifyError("anything else")).toBe("application");
  });

  it("metrics: canonical registry exposes counters/histograms", async () => {
    const m = createMetrics();
    m.httpRequests.inc({ route: "/x", status: "200" });
    m.inferenceLatency.observe(0.2);
    const json = await m.registry.getMetricsAsJSON();
    expect(json.length).toBeGreaterThan(0);
  });

  it("security + logger: structured event recording (redacted) without throwing", () => {
    const logger = createLogger({ name: "phase5-test", level: "silent" });
    const m = createMetrics();
    expect(() =>
      recordSecurityEvent(logger, m, "cross-tenant-attempt", { tenantId: "T-1", detail: { password: "x" } }),
    ).not.toThrow();
    expect(m.securityEvents).toBeDefined();
  });
});
