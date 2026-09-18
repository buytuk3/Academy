/**
 * PHASE-15 (SCHOOL-ONBOARDING-AND-TEACHER-ASSIGNMENT) — /v1 onboarding surface:
 * THIN ADAPTER over the canonical onboarding capability (@workspace/db) —
 * NO SQL, NO business rules here (Architecture Contract).
 * §3.1: pending-by-default school requests; explicit principal/admin decision.
 * §3.2: subject×school claim slots (atomic CAS lock) + audited principal override.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import {
  OnboardingCapabilityError,
  claimTeachingSlot,
  createSchoolRequest,
  decideSchoolRequest,
  ensureTeachingSlots,
  grantSlotOverride,
  listSchoolRequests,
  listTeachingSlots,
  listTenantSchools,
} from "@workspace/db";
import { authenticate, authorize } from "../middleware/auth.js";
import { apiError, mapCapabilityError, paramStr, requiredIdempotencyKey, validateBody } from "./errors.js";
import { z } from "zod";

const router: IRouter = Router();

const ectx = (req: Request, res: Response): { tenantId: string; sub: string } | null => {
  const user = req.user as { tenantId?: string; sub?: string } | undefined;
  if (!user?.tenantId || !user.sub) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return null;
  }
  return { tenantId: user.tenantId, sub: user.sub };
};

const ONBOARDING_STATUS: Record<string, number> = {
  SLOT_ALREADY_CLAIMED: 409,
  OVERRIDE_SLOT_NOT_CLAIMED: 409,
  REQUEST_NOT_PENDING: 409,
  REQUEST_NOT_FOUND: 404,
  SLOT_NOT_FOUND: 404,
  SCHOOL_NOT_FOUND: 404,
};

function onboardingError(res: Response, e: unknown): boolean {
  if (e instanceof OnboardingCapabilityError) {
    apiError(res, ONBOARDING_STATUS[e.code] ?? 400, e.code, e.code);
    return true;
  }
  return false;
}

const SchoolRequestSchema = z.object({
  schoolName: z.string().min(2).max(200),
  governorate: z.string().max(80).optional(),
  stageKey: z.enum(["PRIMARY", "PREPARATORY", "SECONDARY"]),
});
const DecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().max(400).optional(),
});
const EnsureSlotsSchema = z.object({
  schoolId: z.string().uuid(),
  subjects: z.array(z.string().min(2).max(80)).min(1).max(20),
  requestId: z.string().uuid().optional(),
});
const ClaimSchema = z.object({
  schoolId: z.string().uuid(),
  subject: z.string().min(2).max(80),
});
const OverrideSchema = z.object({
  slotId: z.string().uuid(),
  teacherId: z.string().uuid(),
  roleLabel: z.enum(["SECOND", "ASSISTANT", "SPECIALIST"]),
  reason: z.string().min(4).max(400),
});

// ===== §3.1 dropdown: tenant schools (signup source) =====
router.get("/onboarding/schools", authenticate, async (req: Request, res: Response) => {
  const c = ectx(req, res);
  if (!c) return;
  try {
    res.json({ items: await listTenantSchools(c.tenantId) });
  } catch (e) {
    if (!onboardingError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== §3.1 request a missing school → PENDING (never auto-activated) =====
router.post("/school-requests", authenticate, async (req: Request, res: Response) => {
  const c = ectx(req, res);
  if (!c) return;
  const body = validateBody(SchoolRequestSchema, req, res);
  if (!body) return;
  const opKey = requiredIdempotencyKey(req, res);
  if (!opKey) return;
  try {
    const r = await createSchoolRequest({
      tenantId: c.tenantId, requestedBy: c.sub, schoolName: body.schoolName,
      governorate: body.governorate, stageKey: body.stageKey, operationKey: opKey,
    });
    res.status(r.existed ? 200 : 201).json(r);
  } catch (e) {
    if (!onboardingError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== §3.1 approver list =====
router.get("/school-requests", authenticate, authorize("principal", "admin"), async (req: Request, res: Response) => {
  const c = ectx(req, res);
  if (!c) return;
  const status = paramStr(req.query.status as string | undefined) as
    | "PENDING" | "APPROVED" | "REJECTED" | undefined;
  try {
    res.json({ items: await listSchoolRequests(c.tenantId, status) });
  } catch (e) {
    if (!onboardingError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== §3.1 explicit decision (the ONLY activation path) =====
router.post("/school-requests/:id/decision", authenticate, authorize("principal", "admin"), async (req: Request, res: Response) => {
  const c = ectx(req, res);
  if (!c) return;
  const requestId = paramStr(req.params.id);
  const body = validateBody(DecisionSchema, req, res);
  if (!body) return;
  try {
    const r = await decideSchoolRequest({
      tenantId: c.tenantId, requestId, decidedBy: c.sub,
      decision: body.decision, note: body.note,
    });
    res.status(r.existed ? 200 : 201).json(r);
  } catch (e) {
    if (!onboardingError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== §3.2 slot board =====
router.get("/teaching-slots", authenticate, async (req: Request, res: Response) => {
  const c = ectx(req, res);
  if (!c) return;
  const schoolId = paramStr(req.query.schoolId as string | undefined);
  try {
    res.json({ items: await listTeachingSlots(c.tenantId, schoolId || undefined) });
  } catch (e) {
    if (!onboardingError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== §3.2 open slots for a school's subjects (idempotent) =====
router.post("/teaching-slots/ensure", authenticate, authorize("principal", "admin"), async (req: Request, res: Response) => {
  const c = ectx(req, res);
  if (!c) return;
  const body = validateBody(EnsureSlotsSchema, req, res);
  if (!body) return;
  try {
    res.status(201).json(await ensureTeachingSlots(c.tenantId, body.schoolId, body.subjects, body.requestId));
  } catch (e) {
    if (!onboardingError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== §3.2 teacher claims a slot — atomic; loser gets 409 SLOT_ALREADY_CLAIMED =====
router.post("/teaching-slots/claim", authenticate, authorize("teacher"), async (req: Request, res: Response) => {
  const c = ectx(req, res);
  if (!c) return;
  const body = validateBody(ClaimSchema, req, res);
  if (!body) return;
  const opKey = requiredIdempotencyKey(req, res);
  if (!opKey) return;
  try {
    const r = await claimTeachingSlot({
      tenantId: c.tenantId, teacherId: c.sub, schoolId: body.schoolId,
      subject: body.subject, operationKey: opKey,
    });
    res.status(201).json(r);
  } catch (e) {
    if (!onboardingError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== §3.2 principal override (second/assistant teacher) — audited =====
router.post("/teaching-slot-overrides", authenticate, authorize("principal", "admin"), async (req: Request, res: Response) => {
  const c = ectx(req, res);
  if (!c) return;
  const body = validateBody(OverrideSchema, req, res);
  if (!body) return;
  const opKey = requiredIdempotencyKey(req, res);
  if (!opKey) return;
  try {
    const r = await grantSlotOverride({
      tenantId: c.tenantId, slotId: body.slotId, grantedTo: body.teacherId,
      grantedBy: c.sub, roleLabel: body.roleLabel, reason: body.reason, operationKey: opKey,
    });
    res.status(r.existed ? 200 : 201).json(r);
  } catch (e) {
    if (!onboardingError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

export default router;
