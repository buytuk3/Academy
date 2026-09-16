/**
 * PHASE-5 (SHARED-INFRA-AND-INFERENCE) — storage contracts (S3 client startup
 * modes + presign), per ADR-030.
 *
 * Proves the legal s3-client contract with NO network:
 *   - no credentials & no endpoint  → ready=false, assertS3Ready throws
 *     (fail-closed — the exact message documented in the client),
 *   - local endpoint fallback (S3_ENDPOINT_URL, the PHASE-1-approved local S3
 *     mode) → ready=true, assertS3Ready passes, usingLocalEndpointFallback,
 *   - partial credentials (key without secret) → hasPartialCredentials, not ready,
 *   - presign (put/get) generates local v4 URLs containing bucket/key/signature
 *     (aws-sdk v4 signing is computed locally — no network).
 * Module-level consts in s3-client.ts are baked at import time, so each
 * scenario uses vi.resetModules() + a fresh dynamic import with its own env.
 */
import { describe, it, expect, afterEach, afterAll, vi } from "vitest";

type S3ClientModule = typeof import("../s3-client.js");

const ENV_KEYS = [
  "AWS_REGION", "S3_REGION", "AWS_ACCESS_KEY_ID", "S3_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY", "S3_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "S3_SESSION_TOKEN",
  "S3_BUCKET", "S3_PRESIGNED_EXPIRES", "AUDIO_KEK",
  "S3_ENDPOINT_URL", "S3_ENDPOINT", "AWS_ENDPOINT_URL_S3", "S3_FORCE_PATH_STYLE",
] as const;

const savedEnv = new Map<string, string | undefined>();

function clearStorageEnv(): void {
  for (const k of ENV_KEYS) {
    if (!savedEnv.has(k)) savedEnv.set(k, process.env[k]);
    delete process.env[k];
  }
}

function setEnv(k: string, v: string | undefined): void {
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
}

afterEach(() => {
  vi.resetModules(); // s3-client bakes config consts at import — fresh import per scenario
});

afterAll(() => {
  for (const [k, v] of savedEnv) setEnv(k, v);
});

async function freshClient(): Promise<S3ClientModule> {
  return (await import("../s3-client.js")) as S3ClientModule;
}

describe("PHASE-5 — storage contracts (S3 startup modes + presign, no network)", () => {
  it("no credentials and no endpoint → not ready (fail-closed), assertS3Ready throws", async () => {
    clearStorageEnv();
    const s3 = await freshClient();
    const st = s3.getS3StartupStatus();
    expect(st.ready).toBe(false);
    expect(st.mode).toBe("aws");
    expect(st.hasPartialCredentials).toBe(false);
    expect(st.usingLocalEndpointFallback).toBe(false);
    expect(st.message).toContain("S3 credentials missing");
    expect(() => s3.assertS3Ready()).toThrow(/S3 credentials missing/);
  });

  it("local endpoint fallback (S3_ENDPOINT_URL) → ready via fallback (PHASE-1 local S3 mode)", async () => {
    clearStorageEnv();
    setEnv("S3_ENDPOINT_URL", "http://127.0.0.1:9000");
    setEnv("S3_FORCE_PATH_STYLE", "true");
    const s3 = await freshClient();
    const st = s3.getS3StartupStatus();
    expect(st.ready).toBe(true);
    expect(st.mode).toBe("custom-endpoint");
    expect(st.usingLocalEndpointFallback).toBe(true);
    expect(st.endpointUrl).toBe("http://127.0.0.1:9000");
    expect(st.bucket).toBe("buytuk-audio");
    expect(() => s3.assertS3Ready()).not.toThrow();
  });

  it("partial credentials (access key without secret) → rejected at config validation (fail-closed)", async () => {
    clearStorageEnv();
    setEnv("S3_ACCESS_KEY_ID", "key-only");
    // packages/config loadConfig validates the AWS credential pair strictly —
    // a partial pair fails the import itself (even earlier than the client's
    // own hasPartialCredentials path). That rejection IS the legal contract.
    await expect(freshClient()).rejects.toThrow(
      /access key and secret key must be provided together/,
    );
  });

  it("presign (put/get) generates local v4 URLs with bucket, key and signature", async () => {
    clearStorageEnv();
    setEnv("S3_ENDPOINT_URL", "http://127.0.0.1:9000");
    setEnv("S3_FORCE_PATH_STYLE", "true");
    const s3 = await freshClient();
    const put = await s3.presignUrl("students/stu-1/audio.wav", "putObject");
    expect(typeof put).toBe("string");
    expect(put.startsWith("http://127.0.0.1:9000/buytuk-audio/")).toBe(true);
    expect(put).toContain("students/stu-1/audio.wav");
    expect(put).toContain("X-Amz-Signature=");
    const get = await s3.presignUrl("students/stu-1/audio.wav", "getObject");
    expect(get).toContain("X-Amz-Signature=");
    expect(get).toContain("students/stu-1/audio.wav");
  });
});
