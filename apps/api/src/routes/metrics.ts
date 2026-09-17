/**
 * PHASE-12 (PRODUCTION-PERFORMANCE-OBSERVABILITY) — /metrics: canonical
 * Prometheus exposition (OBS-1). REUSE-ONLY: the single metrics owner is
 * @workspace/observability getMetrics() (prom-client registry, CORE-06);
 * this router ONLY exposes it — zero new counters, zero new libraries.
 */
import { Router, type IRouter } from "express";
import { getMetrics } from "@workspace/observability";

const router: IRouter = Router();

router.get("/metrics", async (_req, res) => {
  const metrics = getMetrics();
  res.set("Content-Type", metrics.registry.contentType);
  res.send(await metrics.registry.metrics());
});

export default router;
