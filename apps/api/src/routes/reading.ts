/**
 * CORE-02 — apps/api Reading transport (canonical HTTP boundary).
 *
 * Thin Express 5 router: request parsing, auth/RBAC and response mapping ONLY.
 * Domain work is delegated to @reading-engine/service.
 *
 * Identity contract (CORE-02A): all reading params, body ids and the
 * authenticated user identity are uuid/text strings — no Number() coercion.
 * Tenant contract (CORE-02C): tenantId/schoolId/organizationId claims flow
 * from the D-03 access token into ReadingContext for every route.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.js";
import {
  createPassage,
  enqueueAnalysis,
  getAnalysisJob,
  getAttempt,
  getHealth,
  getPassage,
  getReport,
  listPassages,
  listReportsByStudent,
  listSessionsByStudent,
  metricsText,
  presignAudio,
  type ReadingContext,
} from "../../../../engines/reading-engine/src/service/reading-service.js";

const router: IRouter = Router();

const uuid = z.string().uuid();

const passageSchema = z.object({
  title: z.string().min(1),
  text: z.string().min(1),
  difficulty: z.number().int().min(1).max(10).optional(),
  grade: z.string().optional(),
  classroomId: uuid.optional(),
  teacherId: uuid.optional(),
});

const analyzeSchema = z.object({
  studentId: uuid,
  passageId: uuid,
  sessionId: uuid,
  audioKey: z.string().min(1),
  expectedText: z.string().optional(),
});

function ctxOf(req: Request): ReadingContext {
  return {
    userId: String(req.user?.sub ?? ""),
    role: req.user?.role ?? "student",
    tenantId: req.user?.tenantId ?? "",
    schoolId: req.user?.schoolId,
    organizationId: req.user?.organizationId,
  };
}

// Health & metrics (public — mirror legacy /health + /metrics)
router.get("/health", async (_req: Request, res: Response) => {
  res.json(await getHealth());
});

router.get("/metrics", async (_req: Request, res: Response) => {
  res.type("text/plain").send(await metricsText());
});

// Passages
router.get("/passages", authenticate, async (req: Request, res: Response) => {
  const rows = await listPassages(ctxOf(req), {
    classroomId: req.query.classroomId ? String(req.query.classroomId) : undefined,
    grade: req.query.grade ? String(req.query.grade) : undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
    offset: req.query.offset ? Number(req.query.offset) : undefined,
  });
  res.json(rows);
});

router.post(
  "/passages",
  authenticate,
  authorize("admin", "principal", "teacher"),
  async (req: Request, res: Response) => {
    const parsed = passageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_BODY" });
      return;
    }
    const row = await createPassage(ctxOf(req), parsed.data);
    res.status(201).json(row);
  },
);

router.get("/passages/:id", authenticate, async (req: Request, res: Response) => {
  const row = await getPassage(String(req.params.id), ctxOf(req).tenantId);
  if (!row) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  res.json(row);
});

// Sessions & attempts
router.get("/sessions/student/:studentId", authenticate, async (req: Request, res: Response) => {
  res.json(await listSessionsByStudent(String(req.params.studentId), ctxOf(req).tenantId));
});

router.get("/attempts/:id", authenticate, async (req: Request, res: Response) => {
  const row = await getAttempt(String(req.params.id), ctxOf(req).tenantId);
  if (!row) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  res.json(row);
});

// Async analysis (REST path — mirrors socket flow; pipeline untouched)
router.post(
  "/analyze",
  authenticate,
  authorize("admin", "principal", "teacher"),
  async (req: Request, res: Response) => {
    const parsed = analyzeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_BODY" });
      return;
    }
    const result = await enqueueAnalysis(ctxOf(req), parsed.data);
    res.status(202).json(result);
  },
);

router.get("/analyze/:jobId", authenticate, async (req: Request, res: Response) => {
  const status = await getAnalysisJob(String(req.params.jobId));
  if (!status) {
    res.status(404).json({ error: "JOB_NOT_FOUND" });
    return;
  }
  res.json(status);
});

// Reports
router.get("/reports/student/:studentId", authenticate, async (req: Request, res: Response) => {
  res.json(await listReportsByStudent(String(req.params.studentId)));
});

router.get("/reports/:id", authenticate, async (req: Request, res: Response) => {
  const row = await getReport(String(req.params.id));
  if (!row) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  res.json(row);
});

// S3 presigned URLs
router.get("/audio/presign", authenticate, async (req: Request, res: Response) => {
  const key = String(req.query.key || "");
  const op = String(req.query.op || "getObject") as "getObject" | "putObject";
  if (!key) {
    res.status(400).json({ error: "key required" });
    return;
  }
  try {
    const url = await presignAudio(key, op);
    res.json({ url });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "PRESIGN_FAILED" });
  }
});

export default router;
