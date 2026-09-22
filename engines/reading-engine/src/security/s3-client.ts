import AWS from "aws-sdk";
import { config } from "@workspace/config";
import { logger } from "../observability/logger.js";

const S3_ENDPOINT_URL = config.storage.endpointUrl || "";
const S3_FORCE_PATH_STYLE = config.storage.forcePathStyle;
const HAS_ACCESS_KEY = Boolean(config.storage.accessKeyId);
const HAS_SECRET_KEY = Boolean(config.storage.secretAccessKey);
const HAS_PARTIAL_CREDS = HAS_ACCESS_KEY !== HAS_SECRET_KEY;
const HAS_EXPLICIT_CREDS = HAS_ACCESS_KEY && HAS_SECRET_KEY;
const HAS_SESSION_TOKEN = Boolean(config.storage.sessionToken);
const USING_LOCAL_ENDPOINT_FALLBACK = Boolean(S3_ENDPOINT_URL) && !HAS_EXPLICIT_CREDS;
const EFFECTIVE_ACCESS_KEY_ID = HAS_EXPLICIT_CREDS ? config.storage.accessKeyId : (USING_LOCAL_ENDPOINT_FALLBACK ? "test" : undefined);
const EFFECTIVE_SECRET_ACCESS_KEY = HAS_EXPLICIT_CREDS ? config.storage.secretAccessKey : (USING_LOCAL_ENDPOINT_FALLBACK ? "test" : undefined);
const EFFECTIVE_SESSION_TOKEN = HAS_EXPLICIT_CREDS ? (config.storage.sessionToken || undefined) : undefined;
const BUCKET = config.storage.bucket || "buytuk-audio";
const PRESIGNED_EXPIRES = config.storage.presignedExpires;

const s3 = new AWS.S3({
  region: config.storage.region,
  accessKeyId: EFFECTIVE_ACCESS_KEY_ID,
  secretAccessKey: EFFECTIVE_SECRET_ACCESS_KEY,
  ...(EFFECTIVE_SESSION_TOKEN ? { sessionToken: EFFECTIVE_SESSION_TOKEN } : {}),
  signatureVersion: "v4",
  ...(S3_ENDPOINT_URL ? { endpoint: S3_ENDPOINT_URL } : {}),
  ...(S3_FORCE_PATH_STYLE ? { s3ForcePathStyle: true } : {}),
});

export interface S3StartupStatus {
  ready: boolean;
  mode: "aws" | "custom-endpoint";
  region: string;
  bucket: string;
  endpointUrl: string | null;
  hasExplicitCredentials: boolean;
  hasPartialCredentials: boolean;
  hasSessionToken: boolean;
  usingLocalEndpointFallback: boolean;
  message: string;
}

export function getS3StartupStatus(): S3StartupStatus {
  const mode = S3_ENDPOINT_URL ? "custom-endpoint" : "aws";
  const ready = Boolean(BUCKET && EFFECTIVE_ACCESS_KEY_ID && EFFECTIVE_SECRET_ACCESS_KEY);
  const message = HAS_PARTIAL_CREDS
    ? (USING_LOCAL_ENDPOINT_FALLBACK
      ? "S3 using local endpoint fallback because the AWS credential pair is incomplete"
      : "S3 credentials invalid: access key and secret key must be provided together")
    : ready
      ? (USING_LOCAL_ENDPOINT_FALLBACK
        ? "S3 ready via custom endpoint fallback credentials"
        : (HAS_SESSION_TOKEN ? "S3 ready with AWS session token" : "S3 ready"))
      : "S3 credentials missing; configure AWS vars or set S3_ENDPOINT_URL for local S3-compatible testing";
  return {
    ready,
    mode,
    region: config.storage.region,
    bucket: BUCKET,
    endpointUrl: S3_ENDPOINT_URL || null,
    hasExplicitCredentials: HAS_EXPLICIT_CREDS,
    hasPartialCredentials: HAS_PARTIAL_CREDS,
    hasSessionToken: HAS_SESSION_TOKEN,
    usingLocalEndpointFallback: USING_LOCAL_ENDPOINT_FALLBACK,
    message,
  };
}

export function assertS3Ready(): void {
  const status = getS3StartupStatus();
  if (!status.ready) {
    throw new Error(status.message);
  }
}

export async function uploadAudio(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string = "application/octet-stream",
  metadata: Record<string, string> = {}
): Promise<string> {
  assertS3Ready();
  const log = logger.child({ component: "S3", key });

  try {
    await s3.putObject({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      ...(USING_LOCAL_ENDPOINT_FALLBACK ? {} : { ServerSideEncryption: "aws:kms" }),
      Metadata: metadata,
    }).promise();

    log.info({ size: body.length }, "Audio uploaded");
    return key;
  } catch (err) {
    log.error({ err }, "S3 upload failed");
    throw err;
  }
}

export async function downloadAudio(key: string): Promise<{
  encryptedBuffer: Buffer;
  encryptedKey: string;
}> {
  assertS3Ready();
  const log = logger.child({ component: "S3", key });

  try {
    const result = await s3.getObject({
      Bucket: BUCKET,
      Key: key,
    }).promise();

    const encryptedBuffer = result.Body as Buffer;
    const encryptedKey = result.Metadata?.["x-amz-key"] || "";

    log.info({ size: encryptedBuffer.length }, "Audio downloaded");
    return { encryptedBuffer, encryptedKey };
  } catch (err) {
    log.error({ err }, "S3 download failed");
    throw err;
  }
}

export async function deleteAudio(key: string): Promise<void> {
  assertS3Ready();
  const log = logger.child({ component: "S3", key });

  try {
    await s3.deleteObject({ Bucket: BUCKET, Key: key }).promise();
    log.info("Audio deleted");
  } catch (err) {
    log.error({ err }, "S3 delete failed");
    throw err;
  }
}

export async function presignUrl(key: string, operation: "getObject" | "putObject"): Promise<string> {
  assertS3Ready();
  const params: Record<string, unknown> = {
    Bucket: BUCKET,
    Key: key,
    Expires: PRESIGNED_EXPIRES,
  };

  if (operation === "putObject") {
    params.ContentType = "application/octet-stream";
  }

  logger.info({
    operation,
    key,
    bucket: BUCKET,
    endpoint: S3_ENDPOINT_URL || null,
    forcePathStyle: S3_FORCE_PATH_STYLE,
    fallbackCredentials: USING_LOCAL_ENDPOINT_FALLBACK,
    hasSessionToken: HAS_SESSION_TOKEN,
  }, "S3 presign request");
  return s3.getSignedUrlPromise(operation, params as never);
}

export async function decryptAudio(
  encryptedBuffer: Buffer,
  encryptedKey: string
): Promise<Float32Array> {
  const { decryptAudio: _decrypt } = await import("./encryption.js");
  return _decrypt(encryptedBuffer, encryptedKey);
}
