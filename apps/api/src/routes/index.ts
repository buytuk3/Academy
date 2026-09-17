import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import readingRouter from "./reading.js";
import metricsRouter from "./metrics.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
// P5.3 Wave 2: canonical Reading transport (engine service facade behind Express 5 boundary)
router.use(readingRouter);
// PHASE-12 (OBS-1): canonical Prometheus exposition (documented at /api/metrics since PHASE-4 spec)
router.use(metricsRouter);

export default router;
