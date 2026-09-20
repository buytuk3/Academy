/**
 * PHASE-20 (GRAMMAR-PARSING-ENGINE / الإعراب, governing doc v2.1 §3.7) —
 * /v1 surface: THIN ADAPTER over the canonical grammar capability
 * (@workspace/db) — NO SQL, NO business rules here (Architecture Contract).
 *   POST /v1/grammar/parse          (student: own parse — Idempotency-Key required;
 *                                    staff: may pass studentId for a student's exercise)
 *   GET  /v1/grammar/parsings/mine  (student: OWN parses)
 *   GET  /v1/grammar/parsings/:parsingId (staff: single parsing, tenant-scoped)
 * Secondary §3.3 event logging (ATTEMPT_SUBMIT class reused — ADR-041: no
 * new event class) is FIRE-AND-FORGET — it NEVER breaks the request, and
 * the event operation key is derived from the SAME idempotency key so
 * replays collapse to one event.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import {
  GrammarParsingError,
  parseAndRecord,
  getGrammarParsing,
  listGrammarParsings,
} from "@workspace/db";
import { authenticate, authorize, type AuthUser } from "../middleware/auth.js";
import { apiError, mapCapabilityError, paramStr } from "./errors.js";
import { logInteractionEvent } from "./interaction-events.js";
import { z } from "zod";

const router: IRouter = Router();

const GP_STATUS: Record<string, number> = {
  GRAMMAR_PARSING_NOT_FOUND: 404,
};

function gpError(res: Response, e: unknown): boolean {
  if (e instanceof GrammarParsingError) {
    apiError(res, GP_STATUS[e.code] ?? 400, e.code, e.code);
    return true;
  }
  return false;
}

const ParseSchema = z.object({
  text: z.string().min(1).max(2000),
  studentId: z.string().uuid().optional(),
});

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : v);
const viewOut = (r: any) => ({ ...r, createdAt: iso(r.createdAt) });

// ===== POST /v1/grammar/parse (student: own / staff: may target a student) =====
router.post("/grammar/parse", authenticate, authorize("student", "teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.sub) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return;
  }
  const idem = req.headers["idempotency-key"];
  if (typeof idem !== "string" || idem.length < 8 || idem.length > 200) {
    apiError(res, 400, "IDEMPOTENCY_KEY_REQUIRED", "A unique Idempotency-Key header is required");
    return;
  }
  const body = validateParse(req, res);
  if (!body) return;
  // students parse for THEMSELVES; staff may target a student of their tenant
  const studentId = user.role === "student" ? user.studentId : body.studentId ?? null;
  if (user.role === "student" && !studentId) {
    apiError(res, 403, "STUDENT_CONTEXT_REQUIRED", "Student context missing");
    return;
  }
  try {
    const result = await parseAndRecord({
      tenantId: user.tenantId,
      studentId,
      inputText: body.text,
      operationKey: `p20-parse-${idem}`,
    });
    // §3.3 fire-and-forget: ONE event per unique submit (same key → collapse).
    await logInteractionEvent({
      tenantId: user.tenantId,
      actorId: user.sub,
      actorRole: user.role,
      eventType: "ATTEMPT_SUBMIT",
      studentId,
      operationKey: `p20-evt-${idem}`,
      detail: { phase: "PHASE-20", parsingId: result.parsing.id, tokenCount: result.parsing.tokenCount, reviewCount: result.parsing.reviewCount },
    });
    res.status(result.existed ? 200 : 201).json({
      ...viewOut(result.parsing),
      existed: result.existed,
    });
  } catch (e) {
    if (!gpError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

function validateParse(req: Request, res: Response): { text: string; studentId?: string } | null {
  const parsed = ParseSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    apiError(res, 400, "VALIDATION_FAILED", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    return null;
  }
  return parsed.data;
}

// ===== GET /v1/grammar/parsings/mine (student: OWN parses) =====
router.get("/grammar/parsings/mine", authenticate, authorize("student"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.studentId) {
    apiError(res, 403, "STUDENT_CONTEXT_REQUIRED", "Student context missing");
    return;
  }
  try {
    const items = await listGrammarParsings({ tenantId: user.tenantId, studentId: user.studentId });
    res.json({ items: items.map(viewOut) });
  } catch (e) {
    if (!gpError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/grammar/parsings/:parsingId (staff, tenant-scoped) =====
router.get("/grammar/parsings/:parsingId", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return;
  }
  try {
    const row = await getGrammarParsing({ tenantId: user.tenantId, parsingId: paramStr(req.params.parsingId) });
    if (!row) {
      apiError(res, 404, "GRAMMAR_PARSING_NOT_FOUND", "No parsing with this id in the tenant");
      return;
    }
    res.json(viewOut(row));
  } catch (e) {
    if (!gpError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/grammar/parsings (staff: tenant list, optional studentId) =====
router.get("/grammar/parsings", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return;
  }
  try {
    const studentId = typeof req.query.studentId === "string" ? req.query.studentId : undefined;
    const items = await listGrammarParsings({ tenantId: user.tenantId, studentId });
    res.json({ items: items.map(viewOut) });
  } catch (e) {
    if (!gpError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

export default router;
