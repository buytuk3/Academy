/**
 * CORE-06 — Security events foundation.
 * Recordable security events (failed auth, authorization failure, rate-limit
 * violation, suspicious access, cross-tenant attempt). No SIEM: these are
 * structured logs + a metric counter that later tools can consume.
 */
import type { Logger } from "./logger.js";
import type { AppMetrics } from "./metrics.js";
import { safeLog } from "./redact.js";

export type SecurityEventType =
  | "failed-authentication"
  | "authorization-failure"
  | "rate-limit-violation"
  | "suspicious-access"
  | "cross-tenant-attempt";

export interface SecurityEventContext {
  tenantId?: string;
  studentId?: string;
  actorId?: string;
  detail?: unknown;
}

export function recordSecurityEvent(
  logger: Logger,
  metrics: AppMetrics,
  type: SecurityEventType,
  ctx: SecurityEventContext = {},
): void {
  metrics.securityEvents.inc({ type });
  logger.error(safeLog({ event: "security", securityEventType: type, ...ctx }), "Security event");
}
