/**
 * PHASE-11 (GAMIFICATION-MESSAGING-ATTENDANCE) — /v1 engagement surface: THIN
 * ADAPTER over the canonical wallet/messaging/attendance/ratings capabilities
 * (@workspace/db engagement/*) — NO SQL, NO business rules here (Architecture
 * Contract). RBAC: wallet credit + attendance + ratings = staff roles; wallet
 * view = the authenticated student's OWN account; messages = any authenticated
 * tenant member (same-tenant recipients only, enforced in the capability).
 */
import { Router, type IRouter, type Request, type Response } from "express";
import {
  getWalletView, creditWallet, sendMessage, listMessagesForUser,
  markAttendance, listAttendanceForStaff, rateStudent, listRatingsForStaff,
} from "@workspace/db";
import { authenticate, authorize, type AuthUser } from "../middleware/auth.js";
import { apiError, mapCapabilityError, paramStr, requiredIdempotencyKey, validateBody } from "./errors.js";
import { z } from "zod";

const router: IRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ectx = (req: Request, res: Response): { tenantId: string; sub: string; studentId?: string } | null => {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.sub) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return null;
  }
  return { tenantId: user.tenantId, sub: user.sub, studentId: (user as { studentId?: string }).studentId };
};

const CreditSchema = z.object({ points: z.number().int().min(1).max(100000), reason: z.string().min(1).max(500) });
const MessageSchema = z.object({ toUserId: z.string().uuid(), body: z.string().min(1).max(2000) });
const RatingSchema = z.object({ studentId: z.string().uuid(), score: z.number().int().min(1).max(5), note: z.string().max(500).optional() });
const AttendanceSchema = z.object({
  studentId: z.string().uuid(),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]),
  note: z.string().max(500).optional(),
});

// ===== GET /v1/wallet (PHASE-11: the student's OWN points wallet — real) =====
router.get("/wallet", authenticate, authorize("student"), async (req: Request, res: Response) => {
  const c = ectx(req, res);
  if (!c) return;
  if (!c.studentId) { apiError(res, 403, "STUDENT_CONTEXT_REQUIRED", "Student context missing"); return; }
  try {
    res.json(await getWalletView(c.tenantId, c.studentId));
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== POST /v1/wallet/:studentId/credit (PHASE-11: staff credit, idempotent) =====
router.post("/wallet/:studentId/credit", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const c = ectx(req, res);
  if (!c) return;
  const studentId = paramStr(req.params.studentId);
  if (!UUID_RE.test(studentId)) { apiError(res, 400, "INVALID_STUDENT_ID", "studentId must be a UUID"); return; }
  const body = validateBody(CreditSchema, req, res);
  if (!body) return;
  const opKey = requiredIdempotencyKey(req, res);
  if (!opKey) return;
  try {
    const result = await creditWallet({ tenantId: c.tenantId, actorId: c.sub, studentId, points: body.points, reason: body.reason, operationKey: opKey });
    res.status(result.created ? 201 : 200).json(result);
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/messages (PHASE-11: own inbox+sent — real) =====
router.get("/messages", authenticate, async (req: Request, res: Response) => {
  const c = ectx(req, res);
  if (!c) return;
  try {
    const items = await listMessagesForUser(c.tenantId, c.sub);
    res.json({ items: items.map((m) => ({ ...m, createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt })) });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== POST /v1/messages (PHASE-11: send to a same-tenant user) =====
router.post("/messages", authenticate, async (req: Request, res: Response) => {
  const c = ectx(req, res);
  if (!c) return;
  const body = validateBody(MessageSchema, req, res);
  if (!body) return;
  const idem = (req.headers["idempotency-key"] as string | undefined) ?? crypto.randomUUID();
  try {
    const m = await sendMessage({ tenantId: c.tenantId, senderId: c.sub, recipientId: body.toUserId, body: body.body, operationKey: idem });
    res.status(201).json({ ...m, createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/attendance (PHASE-11: staff coverage-scoped records — real) =====
router.get("/attendance", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const c = ectx(req, res);
  if (!c) return;
  try {
    const items = await listAttendanceForStaff(c.tenantId, c.sub);
    res.json({
      items: items.map((a) => ({
        ...a,
        sessionDate: a.sessionDate instanceof Date ? a.sessionDate.toISOString().slice(0, 10) : String(a.sessionDate).slice(0, 10),
        createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
      })),
    });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== POST /v1/attendance (PHASE-11: daily-idempotent mark by staff) =====
router.post("/attendance", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const c = ectx(req, res);
  if (!c) return;
  const body = validateBody(AttendanceSchema, req, res);
  if (!body) return;
  try {
    const r = await markAttendance({
      tenantId: c.tenantId, actorId: c.sub, studentId: body.studentId,
      sessionDate: body.sessionDate, status: body.status, note: body.note,
    });
    res.status(r.created ? 201 : 200).json({
      ...r,
      sessionDate: r.sessionDate instanceof Date ? r.sessionDate.toISOString().slice(0, 10) : String(r.sessionDate).slice(0, 10),
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/ratings (PHASE-11: staff coverage-scoped ratings — real; ADR-033 re-target) =====
router.get("/ratings", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const c = ectx(req, res);
  if (!c) return;
  try {
    const items = await listRatingsForStaff(c.tenantId, c.sub);
    res.json({
      items: items.map((r0) => ({ ...r0, createdAt: r0.createdAt instanceof Date ? r0.createdAt.toISOString() : r0.createdAt })),
    });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== POST /v1/ratings (PHASE-11: staff rate a student, idempotent) =====
router.post("/ratings", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const c = ectx(req, res);
  if (!c) return;
  const body = validateBody(RatingSchema, req, res);
  if (!body) return;
  const idem = (req.headers["idempotency-key"] as string | undefined) ?? crypto.randomUUID();
  try {
    const r0 = await rateStudent({
      tenantId: c.tenantId, actorId: c.sub, studentId: body.studentId,
      score: body.score, note: body.note, operationKey: idem,
    });
    res.status(201).json({ ...r0, createdAt: r0.createdAt instanceof Date ? r0.createdAt.toISOString() : r0.createdAt });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

export default router;
