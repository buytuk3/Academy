import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { logger } from "../observability/logger.js";
import { metrics } from "../observability/metrics.js";

const PROTO_PATH = process.env.INFERENCE_PROTO_PATH || "./inference-gateway/proto/inference.proto";
const GATEWAY_URL = process.env.INFERENCE_GATEWAY_URL || "localhost:50050";
const API_KEY = process.env.INFERENCE_API_KEY || "";

let client: any = null;

async function getClient() {
  if (client) return client;

  const packageDefinition = await protoLoader.load(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  const proto = grpc.loadPackageDefinition(packageDefinition) as any;

  client = new proto.inference.InferenceService(
    GATEWAY_URL,
    grpc.credentials.createInsecure(),
    {
      "grpc.max_receive_message_length": 100 * 1024 * 1024, // 100MB
      "grpc.max_send_message_length": 100 * 1024 * 1024,
    }
  );

  return client;
}

export async function callInferenceGateway<T>(
  method: string,
  request: any,
  /** ACR-E6-001 (P2) — ADDITIVE options: enforced deadline + tenant metadata.
   * Omitted = exact legacy behavior (existing STT/Align/G2P callers untouched). */
  options?: { deadlineMs?: number; tenantId?: string }
): Promise<T> {
  const startTime = Date.now();
  const log = logger.child({ method, correlationId: request.correlationId });

  try {
    const c = await getClient();

    return new Promise((resolve, reject) => {
      const metadata = new grpc.Metadata();
      metadata.add("authorization", `Bearer ${API_KEY}`);
      metadata.add("x-correlation-id", request.correlationId || "");
      if (options?.tenantId) metadata.add("x-tenant-id", options.tenantId);

      // grpc-js: (request, metadata, [options], callback). The options form
      // (with an enforced deadline) is used ONLY when a deadline is provided.
      const callArgs: unknown[] = [request, metadata];
      if (options?.deadlineMs && options.deadlineMs > 0) {
        callArgs.push({ deadline: Date.now() + options.deadlineMs });
      }
      callArgs.push((err: any, response: any) => {
        const duration = (Date.now() - startTime) / 1000;

        metrics.modelLatency
          .labels(method, "latest")
          .observe(duration);

        if (err) {
          log.error({ err, duration }, "Inference call failed");
          metrics.pipelineErrors
            .labels(method, err.code || "UNKNOWN")
            .inc();
          reject(err);
        } else {
          log.info({ duration }, "Inference call succeeded");
          resolve(response);
        }
      });
      (c[method] as (...a: unknown[]) => void)(...callArgs);
    });
  } catch (err) {
    log.error({ err }, "Failed to call inference gateway");
    throw err;
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    await callInferenceGateway("Health", {});
    return true;
  } catch {
    return false;
  }
}
