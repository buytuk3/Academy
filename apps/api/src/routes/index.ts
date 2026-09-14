import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import readingRouter from "./reading.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
// P5.3 Wave 2: canonical Reading transport (engine service facade behind Express 5 boundary)
router.use(readingRouter);

export default router;
