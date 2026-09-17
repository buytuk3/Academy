/**
 * PHASE-9 (PRINCIPAL-ADMIN-CAPABILITIES) — /v1 admin surface: THIN ADAPTER over
 * the canonical principal/admin READ capabilities (@workspace/db principal/admin)
 * — NO SQL, NO business rules here (Architecture Contract). RBAC: principal+
 * admin for the roster/classes oversight views; ADMIN-only for user accounts
 * and the audit trail. All reads are tenant-scoped (withTenant → RLS, 0007).
 */
import { Router, type IRouter, type Request, type Response } from "express";
import {
  listTenantStaff,
  listTenantClasses,
  listTenantUsers,
  listAuditEvents,
} from "@workspace/db";
import { authenticate, authorize, type AuthUser } from "../middleware/auth.js";
import { apiError, mapCapabilityError } from "./errors.js";

const router: IRouter = Router();

const actx = (req: Request, res: Response): { tenantId: string; sub: string } | null => {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.sub) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return null;
  }
  return { tenantId: user.tenantId, sub: user.sub };
};

// ===== GET /v1/admin/staff (PHASE-9: principal/admin staff roster) =====
router.get("/admin/staff", authenticate, authorize("principal", "admin"), async (req: Request, res: Response) => {
  const c = actx(req, res);
  if (!c) return;
  try {
    const staff = await listTenantStaff(c.tenantId, c.sub);
    res.json({ staff });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/admin/classes (PHASE-9: principal/admin class list) =====
router.get("/admin/classes", authenticate, authorize("principal", "admin"), async (req: Request, res: Response) => {
  const c = actx(req, res);
  if (!c) return;
  try {
    const classes = await listTenantClasses(c.tenantId, c.sub);
    res.json({ classes });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/admin/users (PHASE-9: ADMIN ONLY user accounts) =====
router.get("/admin/users", authenticate, authorize("admin"), async (req: Request, res: Response) => {
  const c = actx(req, res);
  if (!c) return;
  try {
    const users = await listTenantUsers(c.tenantId, c.sub);
    res.json({ users });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/admin/audit (PHASE-9: ADMIN ONLY audit trail) =====
router.get("/admin/audit", authenticate, authorize("admin"), async (req: Request, res: Response) => {
  const c = actx(req, res);
  if (!c) return;
  try {
    const events = await listAuditEvents(c.tenantId, 50);
    res.json({
      events: events.map((ev) => ({
        ...ev,
        createdAt: ev.createdAt instanceof Date ? ev.createdAt.toISOString() : ev.createdAt,
      })),
    });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

export default router;
