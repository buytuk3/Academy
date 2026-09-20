/**
 * PHASE-23 (STUDENT-ENGAGEMENT-EXTRAS: صرف النقاط / الملاحظات / الدعم) —
 * /v1 surface: THIN ADAPTER over the canonical extras capability
 * (@workspace/db) — NO SQL, NO business rules here (Architecture Contract).
 *   POST /v1/points/redeem                 (student: OWN wallet — Idempotency-Key; atomic debit)
 *   GET  /v1/points/redemptions/mine       (student: OWN redemption history)
 *   POST /v1/notes                         (staff: add a note for a tenant student)
 *   GET  /v1/notes?studentId=              (staff: student notes)
 *   POST /v1/support/tickets               (any member: open a ticket)
 *   GET  /v1/support/tickets               (staff: tenant list; ?mine=1 for own)
 *   POST /v1/support/tickets/:id/resolve   (staff: atomic CAS — Idempotency-Key)
 * Secondary §3.3 event logging (ATTEMPT_SUBMIT class reused — ADR-044) is
 * FIRE-AND-FORGET and collapses on the same idempotency key.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import {
  EngagementExtrasError,
  redeemPoints,
  listRedemptions,
  addStudentNote,
  listStudentNotes,
  createSupportTicket,
  listSupportTickets,
  resolveSupportTicket,
} from "@workspace/db";
import { authenticate, authorize, type AuthUser } from "../middleware/auth.js";
import { apiError, mapCapabilityError, paramStr } from "./errors.js";
import { logInteractionEvent } from "./interaction-events.js";
import { z } from "zod";

const router: IRouter = Router();

const EX_STATUS: Record<string, number> = {
  INSUFFICIENT_BALANCE: 409,
  REDEMPTION_IDEMPOTENCY_UNRESOLVED: 409,
  TICKET_NOT_FOUND: 404,
};

function exError(res: Response, e: unknown): boolean {
  if (e instanceof EngagementExtrasError) {
    apiError(res, EX_STATUS[e.code] ?? 400, e.code, e.code);
    return true;
  }
  return false;
}

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : v);
const isoOrNull = (v: Date | string | null): string | null => (v instanceof Date ? v.toISOString() : v);

function idemKey(req: Request, res: Response): string | null {
  const idem = req.headers["idempotency-key"];
  if (typeof idem !== "string" || idem.length < 8 || idem.length > 200) {
    apiError(res, 400, "IDEMPOTENCY_KEY_REQUIRED", "A unique Idempotency-Key header is required");
    return null;
  }
  return idem;
}

// ===== POST /v1/points/redeem (student: OWN wallet; atomic debit) =====
router.post("/points/redeem", authenticate, authorize("student"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.studentId) {
    apiError(res, 403, "STUDENT_CONTEXT_REQUIRED", "Student context missing");
    return;
  }
  const idem = idemKey(req, res);
  if (!idem) return;
  const parsed = z.object({ item: z.string().min(1).max(200), cost: z.number().int().min(1).max(1_000_000) }).safeParse(req.body ?? {});
  if (!parsed.success) {
    apiError(res, 400, "VALIDATION_FAILED", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    return;
  }
  try {
    const result = await redeemPoints({
      tenantId: user.tenantId,
      studentId: user.studentId,
      item: parsed.data.item,
      cost: parsed.data.cost,
      operationKey: `p23-redeem-${idem}`,
    });
    // §3.3 fire-and-forget: ONE event per unique key (replays collapse).
    await logInteractionEvent({
      tenantId: user.tenantId,
      actorId: user.sub,
      actorRole: user.role,
      eventType: "ATTEMPT_SUBMIT",
      studentId: user.studentId,
      operationKey: `p23-evt-redeem-${idem}`,
      detail: { phase: "PHASE-23", redemptionId: result.redemption.id, cost: result.redemption.cost, balance: result.balance },
    });
    res.status(result.existed ? 200 : 201).json({
      redemption: { ...result.redemption, createdAt: iso(result.redemption.createdAt) },
      balance: result.balance,
      existed: result.existed,
    });
  } catch (e) {
    if (!exError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/points/redemptions/mine (student) =====
router.get("/points/redemptions/mine", authenticate, authorize("student"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.studentId) {
    apiError(res, 403, "STUDENT_CONTEXT_REQUIRED", "Student context missing");
    return;
  }
  try {
    const items = await listRedemptions({ tenantId: user.tenantId, studentId: user.studentId });
    res.json({ items: items.map((r) => ({ ...r, createdAt: iso(r.createdAt) })) });
  } catch (e) {
    if (!exError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== POST /v1/notes (staff: add a note for a tenant student) =====
router.post("/notes", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.sub) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return;
  }
  const idem = idemKey(req, res);
  if (!idem) return;
  const parsed = z.object({
    studentId: z.string().uuid(),
    category: z.enum(["ACADEMIC", "BEHAVIORAL", "GENERAL"]).default("GENERAL"),
    body: z.string().min(1).max(4000),
  }).safeParse(req.body ?? {});
  if (!parsed.success) {
    apiError(res, 400, "VALIDATION_FAILED", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    return;
  }
  try {
    const result = await addStudentNote({
      tenantId: user.tenantId,
      studentId: parsed.data.studentId,
      authorId: user.sub,
      category: parsed.data.category,
      body: parsed.data.body,
      operationKey: `p23-note-${idem}`,
    });
    await logInteractionEvent({
      tenantId: user.tenantId,
      actorId: user.sub,
      actorRole: user.role,
      eventType: "ATTEMPT_SUBMIT",
      studentId: parsed.data.studentId,
      operationKey: `p23-evt-note-${idem}`,
      detail: { phase: "PHASE-23", noteId: result.note.id },
    });
    res.status(result.existed ? 200 : 201).json({ note: { ...result.note, createdAt: iso(result.note.createdAt) }, existed: result.existed });
  } catch (e) {
    if (!exError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/notes?studentId= (staff) =====
router.get("/notes", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return;
  }
  try {
    const studentId = paramStr(req.query.studentId as string | undefined);
    const items = await listStudentNotes({ tenantId: user.tenantId, studentId });
    res.json({ items: items.map((n) => ({ ...n, createdAt: iso(n.createdAt) })) });
  } catch (e) {
    if (!exError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== POST /v1/support/tickets (any authenticated member) =====
router.post("/support/tickets", authenticate, authorize("student", "teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.sub) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return;
  }
  const idem = idemKey(req, res);
  if (!idem) return;
  const parsed = z.object({
    subject: z.string().min(1).max(200),
    body: z.string().min(1).max(8000),
  }).safeParse(req.body ?? {});
  if (!parsed.success) {
    apiError(res, 400, "VALIDATION_FAILED", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    return;
  }
  try {
    const result = await createSupportTicket({
      tenantId: user.tenantId,
      createdBy: user.sub,
      creatorRole: user.role,
      subject: parsed.data.subject,
      body: parsed.data.body,
      operationKey: `p23-ticket-${idem}`,
    });
    await logInteractionEvent({
      tenantId: user.tenantId,
      actorId: user.sub,
      actorRole: user.role,
      eventType: "ATTEMPT_SUBMIT",
      operationKey: `p23-evt-ticket-${idem}`,
      detail: { phase: "PHASE-23", ticketId: result.ticket.id },
    });
    res.status(result.existed ? 200 : 201).json({ ticket: { ...result.ticket, resolvedAt: isoOrNull(result.ticket.resolvedAt), createdAt: iso(result.ticket.createdAt) }, existed: result.existed });
  } catch (e) {
    if (!exError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/support/tickets (staff list; ?mine=1 own) =====
router.get("/support/tickets", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return;
  }
  try {
    const mine = req.query.mine === "1";
    const items = await listSupportTickets({ tenantId: user.tenantId, createdBy: mine ? user.sub : undefined });
    res.json({ items: items.map((t) => ({ ...t, resolvedAt: isoOrNull(t.resolvedAt), createdAt: iso(t.createdAt) })) });
  } catch (e) {
    if (!exError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== POST /v1/support/tickets/:id/resolve (staff; atomic CAS) =====
router.post("/support/tickets/:ticketId/resolve", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.sub) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return;
  }
  const idem = idemKey(req, res);
  if (!idem) return;
  try {
    const result = await resolveSupportTicket({
      tenantId: user.tenantId,
      ticketId: paramStr(req.params.ticketId),
      resolverId: user.sub,
      operationKey: `p23-resolve-${idem}`,
    });
    if (result.changed) {
      await logInteractionEvent({
        tenantId: user.tenantId,
        actorId: user.sub,
        actorRole: user.role,
        eventType: "ATTEMPT_SUBMIT",
        operationKey: `p23-evt-resolve-${idem}`,
        detail: { phase: "PHASE-23", ticketId: result.ticket.id, resolved: true },
      });
    }
    res.json({ ticket: { ...result.ticket, resolvedAt: isoOrNull(result.ticket.resolvedAt), createdAt: iso(result.ticket.createdAt) }, changed: result.changed, existed: result.existed });
  } catch (e) {
    if (!exError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

export default router;
