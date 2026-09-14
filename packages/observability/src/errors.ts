/**
 * CORE-06 — Error classification foundation (shared).
 * Eight canonical error classes; `classifyError` maps any thrown value to one.
 */
export type ErrorClass =
  | "validation"
  | "authorization"
  | "database"
  | "queue"
  | "timeout"
  | "dependency"
  | "application"
  | "security";

export const ERROR_CLASSES: readonly ErrorClass[] = [
  "validation", "authorization", "database", "queue", "timeout", "dependency", "application", "security",
];

export class ClassifiedError extends Error {
  readonly errorClass: ErrorClass;
  constructor(errorClass: ErrorClass, message: string, readonly cause?: unknown) {
    super(message);
    this.name = "ClassifiedError";
    this.errorClass = errorClass;
  }
}

const SECURITY_HINTS = ["TENANT_MISMATCH", "STUDENT_MISMATCH", "cross-tenant", "CROSS_TENANT"];
const AUTH_HINTS = ["AUTH", "AUTHORIZATION", "FORBIDDEN", "UNAUTHORIZED", "401", "403"];
const VALIDATION_HINTS = ["VALIDATION", "INVALID_", "_MISSING", "_REQUIRED", "not-a-uuid", "parse", "zod"];
const DB_HINTS = ["ECONNREFUSED", "postgres", "pg_", "relation ", "database", "query", "pool", "SQLSTATE", "duplicate key"];
const QUEUE_HINTS = ["bullmq", "queue", "job ", "jobId"];
const TIMEOUT_HINTS = ["TIMEOUT", "ETIMEDOUT", "timeout"];
const DEP_HINTS = ["redis", "connect", "dependency", "ENOTFOUND", "fetch failed"];

/** Best-effort classification from message/code/cause. Deterministic and testable. */
export function classifyError(err: unknown): ErrorClass {
  if (err instanceof ClassifiedError) return err.errorClass;
  const msg = `${err instanceof Error ? err.message : String(err)} ${err instanceof Error && err.cause ? String(err.cause) : ""}`;
  const hit = (hints: string[]) => hints.some((h) => msg.toLowerCase().includes(h.toLowerCase()));
  if (hit(SECURITY_HINTS)) return "security";
  if (hit(AUTH_HINTS)) return "authorization";
  if (hit(VALIDATION_HINTS)) return "validation";
  if (hit(TIMEOUT_HINTS)) return "timeout";
  if (hit(DB_HINTS)) return "database";
  if (hit(QUEUE_HINTS)) return "queue";
  if (hit(DEP_HINTS)) return "dependency";
  return "application";
}
