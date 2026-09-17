import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "@workspace/config";
import { createLogger, requestContext, httpLogger, getMetrics } from "@workspace/observability";
import router from "./routes/index.js";
import healthRouter from "./routes/health.js";
import metricsRouter from "./routes/metrics.js";
import v1Router from "./v1/index.js";

const app: Express = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin: config.security.corsOrigin
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    methods: config.security.corsMethods,
    allowedHeaders: config.security.corsAllowedHeaders,
    credentials: config.security.corsCredentials,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestContext as any);
app.use(
  httpLogger(createLogger({ level: config.observability.logLevel, name: "buytuk-api" })) as any
);
app.use(
  rateLimit({
    windowMs: config.security.rateLimitWindowMs,
    max: config.security.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
  }) as any
);

const authRateLimiter = rateLimit({
  windowMs: config.security.authRateLimitWindowMs,
  max: config.security.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  keyGenerator: (req) => `${req.ip}:${req.path}`,
  message: { error: { code: "AUTH_RATE_LIMITED", message: "Too many authentication attempts" } },
});
app.use(["/api/auth", "/v1/auth"], authRateLimiter as any);

// PHASE-12 (OBS-1): REAL traffic into the canonical counter — one increment
// per completed request (route=path, status), reuse-only (no new metrics).
const appMetrics = getMetrics();
app.use((req, res, next) => {
  res.on("finish", () => {
    try { appMetrics.httpRequests.inc({ route: req.path, status: String(res.statusCode) }); } catch {}
  });
  next();
});
app.use("/", metricsRouter);

// PHASE-4 (API-GATEWAY-ALIGNMENT): root liveness alias — GET /healthz is
// documented at the root in lib/api-spec/openapi.yaml; same single handler
// (HealthCheckResponse) as /api/healthz — no duplication, additive only.
app.use("/", healthRouter);
app.use("/api", router);
app.use("/v1", v1Router);

const uiDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
app.use("/ui", express.static(uiDir));
app.get("/", (_req, res) => {
  res.sendFile(path.join(uiDir, "index.html"));
});
app.get("/index.html", (_req, res) => {
  res.sendFile(path.join(uiDir, "index.html"));
});

export default app;
