import { createCipheriv, createDecipheriv, randomBytes, createSecretKey } from "node:crypto";
import { logger } from "../observability/logger.js";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// Key Encryption Key (KEK) from environment
const KEK_HEX = process.env.AUDIO_KEK;
if (!KEK_HEX || KEK_HEX.length !== 64) {
  throw new Error("AUDIO_KEK must be a 64-character hex string (32 bytes)");
}
const KEK = Buffer.from(KEK_HEX, "hex");

/**
 * Encrypts a DEK (Data Encryption Key) with the KEK
 */
function wrapKey(dek: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, KEK, iv);
  const encrypted = Buffer.concat([cipher.update(dek), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

/**
 * Decrypts a wrapped DEK using the KEK
 */
function unwrapKey(wrapped: Buffer): Buffer {
  const iv = wrapped.slice(0, IV_LENGTH);
  const tag = wrapped.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const data = wrapped.slice(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, KEK, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/**
 * Encrypts raw PCM audio with per-file DEK
 * Returns: { encryptedBuffer, encryptedKey (hex) }
 */
export async function encryptAudio(
  pcm: Float32Array
): Promise<{ encryptedBuffer: Buffer; encryptedKey: string }> {
  const dek = randomBytes(KEY_LENGTH);
  const iv = randomBytes(IV_LENGTH);

  const raw = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);

  const cipher = createCipheriv(ALGORITHM, dek, iv);
  const encrypted = Buffer.concat([cipher.update(raw), cipher.final()]);
  const tag = cipher.getAuthTag();

  const encryptedBuffer = Buffer.concat([iv, tag, encrypted]);
  const wrapped = wrapKey(dek);
  const encryptedKey = wrapped.toString("hex");

  logger.debug({ size: raw.length, encryptedSize: encryptedBuffer.length }, "Audio encrypted");

  return { encryptedBuffer, encryptedKey };
}

/**
 * Decrypts audio back to Float32Array PCM
 */
export async function decryptAudio(
  encryptedBuffer: Buffer,
  encryptedKey: string
): Promise<Float32Array> {
  const wrapped = Buffer.from(encryptedKey, "hex");
  const dek = unwrapKey(wrapped);

  const iv = encryptedBuffer.slice(0, IV_LENGTH);
  const tag = encryptedBuffer.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const data = encryptedBuffer.slice(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, dek, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);

  logger.debug({ size: decrypted.length }, "Audio decrypted");

  return new Float32Array(decrypted.buffer, decrypted.byteOffset, decrypted.byteLength / 4);
}
