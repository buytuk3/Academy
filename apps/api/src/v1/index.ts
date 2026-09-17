/**
 * CORE-24 / Wave 3 — /v1 canonical surface aggregator.
 * OpenAPI source of truth: lib/api-spec/v1.yaml (25 paths / 28 operations).
 * Every child router is a THIN ADAPTER over canonical capabilities —
 * NO SQL, NO business rules, NO parallel logic layers.
 */
import { Router, type IRouter } from "express";
import auth from "./auth.js";
import library from "./library.js";
import activity from "./activity.js";
import students from "./students.js";
import oversight from "./oversight.js";
import teacher from "./teacher.js";
import lessons from "./lessons.js";
import parents from "./parents.js";

const router: IRouter = Router();

router.use(auth);
router.use(library);
router.use(activity);
router.use(students);
router.use(oversight);
router.use(teacher);
router.use(lessons);
router.use(parents);

export default router;
