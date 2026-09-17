/**
 * CORE-24 / Wave 3 — /v1 error taxonomy + contract validation helpers.
 * ADAPTER ONLY: maps typed capability errors to HTTP (ApiError contract);
 * carries ZERO business rules and ZERO SQL.
 */
import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { ClassifiedError, getContext } from "@workspace/observability";
import {
  AuthCapabilityError,
  ContentLibraryError,
  ActivityStateError,
} from "@workspace/db";
import { createLogger, getMetrics, recordSecurityEvent } from "@workspace/observability";

const CONTENT_404 = new Set([
  "CONTENT_NOT_FOUND_IN_TENANT",
  "EXERCISE_NOT_FOUND_IN_TENANT",
  "EXERCISE_NOT_PUBLISHED_IN_TENANT",
]);
const CONTENT_409 = new Set([
  "CONTENT_SUPERSEDED_IMMUTABLE",
  "EXERCISE_SUPERSEDED_IMMUTABLE",
  "SUPERSEDE_REQUIRES_PUBLISHED",
  "SUPERSEDE_RACE_LOST",
  "CONTENT_IDEMPOTENCY_UNRESOLVED",
  "EXERCISE_IDEMPOTENCY_UNRESOLVED",
]);
const ACTIVITY_404 = new Set([
  "ASSIGNMENT_NOT_FOUND_IN_TENANT",
  "ATTEMPT_NOT_FOUND_IN_TENANT",
  "EVIDENCE_REF_NOT_FOUND_IN_TENANT",
]);
const ACTIVITY_409 = new Set([
  "ASSIGNMENT_IDEMPOTENCY_UNRESOLVED",
  "ATTEMPT_IDEMPOTENCY_UNRESOLVED",
  "ASSIGNMENT_STATUS_CONFLICT",
  "INVALID_TRANSITION",
]);
// E1 — decision-state conflicts surface as 409 (retry with the SAME key stays
// idempotent 200 existed:true inside the capability; a DIFFERENT action on a
// FINAL proposal is a real conflict, never a 500).
const CLASSIFIED_409 = new Set(["DECISION_ALREADY_FINAL", "DECISION_CANNOT_REMAIN_PENDING"]);
const CLASSIFIED_404 = new Set(["INTERVENTION_NOT_FOUND"]);

const secLog = createLogger({ name: "buytuk-api:errors" });

/** PHASE-12 (OBS-2): real 403-class denials surface on the canonical security counter. */
function noteSecurityDenial(reason: string, status: number): void {
  if (status === 403) recordSecurityEvent(secLog, getMetrics(), "authorization-failure", { detail: reason });
}

/** ApiError envelope (OpenAPI components/schemas/ApiError) with request tracing. */
export function apiError(res: Response, status: number, code: string, message: string): void {
  const ctx = getContext();
  res.status(status).json({
    error: {
      code,
      message,
      ...(ctx?.requestId ? { requestId: ctx.requestId } : {}),
      ...(ctx?.correlationId ? { correlationId: ctx.correlationId } : {}),
    },
  });
}

/** Typed capability error → HTTP status (single mapping owner for /v1). */
export function mapCapabilityError(res: Response, e: unknown): boolean {
  // E1 — ClassifiedError (decisions/learning-loop capabilities): code is the
  // stable reason; class picks the fallback status.
  if (e instanceof ClassifiedError) {
    const code = e.message;
    const status = CLASSIFIED_409.has(code) ? 409 : CLASSIFIED_404.has(code) ? 404 : e.errorClass === "authorization" || e.errorClass === "security" ? 403 : e.errorClass === "validation" ? 400 : 500;
    apiError(res, status, code, code);
    return true;
  }
  if (e instanceof AuthCapabilityError) {
    noteSecurityDenial(e.reason, e.status);
    apiError(res, e.status, e.reason, e.reason);
    return true;
  }
  if (e instanceof ContentLibraryError) {
    const status = CONTENT_409.has(e.reason) ? 409 : CONTENT_404.has(e.reason) ? 404 : 400;
    apiError(res, status, e.reason, e.reason);
    return true;
  }
  if (e instanceof ActivityStateError) {
    const status = ACTIVITY_409.has(e.reason) ? 409 : ACTIVITY_404.has(e.reason) ? 404 : 400;
    apiError(res, status, e.reason, e.reason);
    return true;
  }
  // AuthorizationError (oversight detail gate): NOT_FOUND reasons → 404, denials → 403.
  if (e instanceof Error && e.name === "AuthorizationError") {
    const status = e.message.includes("NOT_FOUND") ? 404 : 403;
    noteSecurityDenial(e.message, status);
    apiError(res, status, e.message, e.message);
    return true;
  }
  // LoginContextError (20-O unified student login): context/membership denial → 403.
  if (e instanceof Error && e.name === "LoginContextError") {
    apiError(res, 403, e.message, e.message);
    return true;
  }
  // CORE-26B/C — engine-owned input validators (NumeracyEngineInputError /
  // AssessmentEngineInputError): strict boundary rejections happen BEFORE the
  // measurement core → 400 INVALID_ENGINE_INPUT (never a 500).
  if (e instanceof Error && (e.name === "NumeracyEngineInputError" || e.name === "AssessmentEngineInputError")) {
    apiError(res, 400, "INVALID_ENGINE_INPUT", e.message);
    return true;
  }
  // ExecutionError (CORE-25 runtime capability): context/curriculum/binding
  // pre-check failures → 400; authorization denials → 403.
  if (e instanceof Error && e.name === "ExecutionError") {
    const reason = (e as Error & { reason?: string }).reason ?? "EXECUTION_FAILED";
    const status = reason === "EXECUTION_DENIED" || reason === "STUDENT_CONTEXT_MISMATCH" ? 403 : 400;
    apiError(res, status, reason, reason);
    return true;
  }
  // ActivityAccessError (21-M access predicate via the 23-H chain): denials → 403.
  if (e instanceof Error && e.name === "ActivityAccessError") {
    const msg = e.message;
    const status = msg.includes("NOT_FOUND") ? 404 : 403;
    apiError(res, status, msg, msg);
    return true;
  }
  return false;
}

/** Zod body validation (contract-mandatory) — 400 VALIDATION_ERROR on failure. */
export function validateBody<T>(schema: ZodType<T>, req: Request, res: Response): T | null {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    apiError(res, 400, "VALIDATION_ERROR", "Request body failed contract validation");
    return null;
  }
  return parsed.data;
}

/** Idempotency-Key header (contract-mandatory for the flagged mutations). */
export function requiredIdempotencyKey(req: Request, res: Response): string | null {
  const raw = req.headers["idempotency-key"];
  const key = typeof raw === "string" ? raw.trim() : "";
  if (key.length < 8 || key.length > 200) {
    apiError(res, 400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header (8..200 chars) is required for this operation");
    return null;
  }
  return key;
}

/** Express 5 path params are typed `string | string[]` — normalize to string. */
export function paramStr(v: unknown): string {
  if (Array.isArray(v)) return String(v[0] ?? "");
  return String(v ?? "");
}
