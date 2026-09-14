import AWS from "aws-sdk";
import { logger } from "../observability/logger.js";

const s3 = new AWS.S3({
  region: process.env.AWS_REGION || "us-east-1",
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  signatureVersion: "v4",
});

const BUCKET = process.env.S3_BUCKET || "buytuk-audio";
const PRESIGNED_EXPIRES = parseInt(process.env.S3_PRESIGNED_EXPIRES || "3600");

export async function uploadAudio(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string = "application/octet-stream",
  metadata: Record<string, string> = {}
): Promise<string> {
  const log = logger.child({ component: "S3", key });

  try {
    await s3.putObject({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      ServerSideEncryption: "aws:kms",
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
  const params: any = {
    Bucket: BUCKET,
    Key: key,
    Expires: PRESIGNED_EXPIRES,
  };

  if (operation === "putObject") {
    params.ContentType = "application/octet-stream";
  }

  return s3.getSignedUrlPromise(operation, params);
}

// Stub: actual audio decryption is in encryption.ts
export async function decryptAudio(
  encryptedBuffer: Buffer,
  encryptedKey: string
): Promise<Float32Array> {
  const { decryptAudio: _decrypt } = await import("./encryption.js");
  return _decrypt(encryptedBuffer, encryptedKey);
}
