/**
 * TEMPORARY COMPATIBILITY (P4.5 / C-A4) — the worker runtime now lives in
 * apps/worker; this file keeps the processor reachable from the old engine
 * path during migration. Removal target: P5 (zero importers).
 */
export { processAnalyzeJob, analyzeConcurrency } from "./analyze.processor.js";
