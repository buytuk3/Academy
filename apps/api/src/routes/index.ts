import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import metricsRouter from "./metrics.js";
import readingRouter from "./reading.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
// PHASE-12 (OBS-1): canonical Prometheus exposition — mounted BEFORE the
// reading facade so the PHASE-4-spec /api/metrics entry serves the platform
// registry (text/plain) consistently with the root /metrics alias.
router.use(metricsRouter);
// P5.3 Wave 2: canonical Reading transport (engine service facade behind Express 5 boundary)
router.use(readingRouter);

export default router;
