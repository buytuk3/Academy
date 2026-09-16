/**
 * PHASE-5 (SHARED-INFRA-AND-INFERENCE) — gateway smoke: transport-level proof.
 *
 * The REAL inference gateway (gateway.py + Whisper workers) needs CUDA/GPU,
 * unavailable in this environment — documented in ADR-030. The smoke proof is
 * therefore TRANSPORT-LEVEL against the CANONICAL contract: a real gRPC server
 * is run in-process, serving the SAME legal proto file
 * (inference-gateway/proto/inference.proto — 6 RPCs), and the REAL production
 * client (inference-client.ts: callInferenceGateway/healthCheck) drives it:
 *   - Health + Feedback succeed (real round-trip),
 *   - metadata is captured: authorization Bearer, x-correlation-id, and
 *     x-tenant-id when options.tenantId is passed (ACR-E6-001 — the PHASE-2
 *     tenancy thread travels on inference calls),
 *   - the enforced deadline (ACR-E6-001) rejects a hung handler with
 *     DEADLINE_EXCEEDED (code 4).
 * Zero new dependencies (@grpc/grpc-js + @grpc/proto-loader are existing
 * reading-engine deps). No production code is modified.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

const PROTO = process.env.INFERENCE_PROTO_PATH ?? "./inference-gateway/proto/inference.proto";

let server: grpc.Server | null = null;
let address = "";
const captured: Record<string, string> = {};

type Handler = (call: any, cb: (err: unknown, res?: any) => void) => void;

function makeHandlers(): Record<string, Handler> {
  return {
    Health: (_call: any, cb: (err: unknown, res?: any) => void) => cb(null, { ok: true, workers: { whisper: "up", g2p: "up" } }),
    Transcribe: (_call: any, cb: (err: unknown, res?: any) => void) =>
      cb(null, { text: "ص", segments: [], language: "ar" }),
    AlignWord: (_call: any, _cb: (err: unknown, res?: any) => void) => {
      /* never responds — used for the deadline proof */
    },
    AlignPhoneme: (_call: any, cb: (err: unknown, res?: any) => void) => cb(null, { phonemes: [], starts: [], ends: [], confidences: [] }),
    G2P: (_call: any, cb: (err: unknown, res?: any) => void) => cb(null, { diacritized: "مُثَلَّث", morphology: "" }),
    Feedback: (call: any, cb: (err: unknown, res?: any) => void) => {
      for (const k of ["authorization", "x-correlation-id", "x-tenant-id"]) {
        const v = (call.metadata as grpc.Metadata).get(k);
        if (v.length > 0) captured[k] = String(v[0]);
      }
      cb(null, { text: "أحسنت", model_used: "test-model", tokens_used: 3 });
    },
  };
}

let client: typeof import("../inference-client.js");

beforeAll(async () => {
  const pd = await protoLoader.load(PROTO, {
    keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
  });
  const proto = grpc.loadPackageDefinition(pd) as any;
  server = new grpc.Server();
  // UntypedServiceImplementation cast: the service definition comes from a
  // dynamically loaded proto (no generated types) — grpc-js' own untyped
  // server contract. Handlers below match the canonical inference.proto.
  server.addService(
    proto.inference.InferenceService.service,
    makeHandlers() as unknown as grpc.UntypedServiceImplementation,
  );
  const port = await new Promise<number>((resolve, reject) => {
    server!.bindAsync("127.0.0.1:0", grpc.ServerCredentials.createInsecure(), (err, bound) =>
      err ? reject(err) : resolve(bound as number));
  });
  address = `127.0.0.1:${port}`;
  // The client bakes GATEWAY_URL at import time — set env BEFORE first import.
  process.env.INFERENCE_GATEWAY_URL = address;
  process.env.INFERENCE_API_KEY = process.env.INFERENCE_API_KEY ?? "phase5-smoke-key";
  client = await import("../inference-client.js");
});

afterAll(() => {
  server?.forceShutdown();
});

describe("PHASE-5 — gateway smoke (real gRPC transport over the canonical proto)", () => {
  it("Health round-trip succeeds via the production client (healthCheck → true)", async () => {
    expect(address).toMatch(/^127\.0\.0\.1:\d+$/);
    await expect(client.healthCheck()).resolves.toBe(true);
  });

  it("Feedback round-trip returns the response shape of the canonical contract", async () => {
    const res = await client.callInferenceGateway<any>(
      "Feedback",
      { prompt: "قيّم قراءة الطالب", model: "test-model", temperature: 0.2, correlation_id: "corr-p5" },
    );
    expect(res.text).toBe("أحسنت");
    expect(res.model_used).toBe("test-model");
    expect(res.tokens_used).toBe(3);
  });

  it("metadata travels: authorization + x-correlation-id + x-tenant-id (ACR-E6-001 options path)", async () => {
    await client.callInferenceGateway<any>(
      "Feedback",
      { prompt: "p", model: "m", temperature: 0.1, correlation_id: "corr-tenant", correlationId: "corr-tenant" },
      { tenantId: "T-P5", deadlineMs: 3000 },
    );
    expect(captured["authorization"]).toMatch(/^Bearer /);
    expect(captured["x-correlation-id"]).toBe("corr-tenant");
    expect(captured["x-tenant-id"]).toBe("T-P5");
  });

  it("enforced deadline rejects a hung handler with DEADLINE_EXCEEDED (code 4)", async () => {
    let err: any = null;
    try {
      await client.callInferenceGateway<any>(
        "AlignWord",
        { audio: [], sample_rate: 16000, transcript: "t", correlation_id: "corr-deadline" },
        { deadlineMs: 150 },
      );
    } catch (e) {
      err = e;
    }
    expect(err).not.toBeNull();
    expect((err as any).code).toBe(4); // grpc status DEADLINE_EXCEEDED
  });
});
