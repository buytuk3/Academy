/**
 * @workspace/observability — http.ts
 * Express middleware: request context (requestId/correlationId) + pino-http.
 */
import type { Request, Response, NextFunction } from "express";
import pinoHttp from "pino-http";
import type { Logger } from "./logger.js";
import { startContext, runWithContext, getContext } from "./correlation.js";

/** Assigns requestId/correlationId and runs the rest in context. */
export function requestContext(req: Request, _res: Response, next: NextFunction): void {
  const incoming =
    (req.headers["x-request-id"] as string | undefined) ?? undefined;
  const ctx = startContext({ requestId: incoming });
  runWithContext(ctx, () => next());
}

/** pino-http logger that reuses the context requestId. */
export function httpLogger(logger: Logger) {
  return pinoHttp({
    logger: logger as never,
    genReqId: (req) =>
      getContext()?.requestId ??
      (req.headers["x-request-id"] as string | undefined) ??
      "",
  });
}
