/**
 * CORE-06 — Redaction (secrets / privacy) foundation.
 * NEVER log passwords, tokens, secrets, or sensitive child fields.
 * `safeLog` is the single entry producers/consumers must use before logging.
 */
const SENSITIVE_KEYS = new Set([
  "password", "pass", "pwd", "secret", "accesstoken", "refreshtoken", "token",
  "authorization", "apikey", "api_key", "keyhash", "key_hash", "cookie",
  "credential", "credentials", "creditcard", "ssn", "encryptedkey", "privatekey",
]);;

const BEARER_RE = /(bearer\s+)[a-z0-9._~+/=-]+/gi;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 10) return "[REDACTED]";
  if (typeof value === "string") {
    return value.replace(BEARER_RE, "$1[REDACTED]");
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? "[REDACTED]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Use this before ANY log line that may carry event/request payloads. */
export function safeLog(value: unknown): unknown {
  return redact(value);
}
