/**
 * @workspace/config — env.ts
 * Strict environment validation. Infrastructure/runtime keys only.
 * Business configuration (audio/scoring/pipeline/models) stays in the
 * owning Engines, per P3.1 contract.
 */
export type AppEnv = "development" | "test" | "production";

/** Keys that MUST be present when strict mode is on (production). */
export const REQUIRED_KEYS = ["DATABASE_URL", "JWT_SECRET", "AUDIO_KEK"] as const;
export type RequiredKey = (typeof REQUIRED_KEYS)[number];

/**
 * G5-A.1 / GAP-003 — development placeholder values that are FORBIDDEN in
 * strict/production mode. Presence-only validation previously accepted these
 * known-insecure secrets in production; strict mode now rejects them exactly
 * like a missing key. Dev/test (non-strict) fallbacks stay untouched.
 */
export const INSECURE_PRODUCTION_VALUES: Readonly<
  Record<"JWT_SECRET" | "AUDIO_KEK", readonly string[]>
> = {
  JWT_SECRET: ["dev-secret-change-me"],
  AUDIO_KEK: ["dev-kek-change-me"],
};

export interface EnvShape {
  NODE_ENV?: string;
  DATABASE_URL?: string;
  DATABASE_POOL_MIN?: string;
  DATABASE_POOL_MAX?: string;
  DATABASE_SSL?: string;
  REDIS_URL?: string;
  REDIS_PREFIX?: string;
  JWT_SECRET?: string;
  JWT_ACCESS_TTL_SECONDS?: string;
  JWT_REFRESH_TTL_DAYS?: string;
  JWT_ISSUER?: string;
  JWT_AUDIENCE?: string;
  CORS_ORIGIN?: string;
  LOG_LEVEL?: string;
  RATE_LIMIT_WINDOW_MS?: string;
  RATE_LIMIT_MAX?: string;
  AUTH_RATE_LIMIT_WINDOW_MS?: string;
  AUTH_RATE_LIMIT_MAX?: string;
  PASSWORD_RESET_TTL_MINUTES?: string;
  PORT?: string;
  HOST?: string;
  S3_REGION?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  S3_BUCKET?: string;
  S3_PRESIGNED_EXPIRES?: string;
  INFERENCE_GATEWAY_URL?: string;
  INFERENCE_PROTO_PATH?: string;
  INFERENCE_API_KEY?: string;
  DFN_WORKER_PATH?: string;
}

export interface EnvValidation {
  errors: string[];
  warnings: string[];
}

/**
 * Validates an env object. In strict mode missing required keys are errors;
 * in non-strict (dev/test) they become warnings with safe defaults.
 */
export function validateEnv(
  env: Record<string, string | undefined>,
  strict = false,
): EnvValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const key of REQUIRED_KEYS) {
    if (!env[key] || env[key]!.trim() === "") {
      const msg = `Missing required env: ${key}`;
      if (strict) errors.push(msg);
      else warnings.push(`${msg} (using dev default)`);
    }
  }
  // G5-A.1 / GAP-003 — value-level hardening (strict/production ONLY):
  // a PRESENT development-placeholder secret is rejected exactly like a
  // missing one. Non-strict (dev/test) keeps its fallbacks unchanged.
  if (strict) {
    for (const key of ["JWT_SECRET", "AUDIO_KEK"] as const) {
      if (env[key] && INSECURE_PRODUCTION_VALUES[key].includes(env[key]!)) {
        errors.push(`Insecure production secret for ${key}: development placeholder rejected`);
      }
    }
  }
  if (env.PORT !== undefined && env.PORT !== "" && !/^\d+$/.test(env.PORT)) {
    errors.push(`Invalid PORT: ${env.PORT}`);
  }
  if (env.DATABASE_POOL_MIN || env.DATABASE_POOL_MAX) {
    const min = Number(env.DATABASE_POOL_MIN ?? "5");
    const max = Number(env.DATABASE_POOL_MAX ?? "20");
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max < min) {
      errors.push(`Invalid DATABASE_POOL_MIN/MAX: ${env.DATABASE_POOL_MIN}/${env.DATABASE_POOL_MAX}`);
    }
  }
  if (env.NODE_ENV && !["development", "test", "production"].includes(env.NODE_ENV)) {
    errors.push(`Invalid NODE_ENV: ${env.NODE_ENV}`);
  }
  return { errors, warnings };
}

export function parsePort(v: string | undefined, def: number): number {
  const n = Number(v ?? def);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : def;
}

export function parseIntDef(v: string | undefined, def: number): number {
  const n = Number(v ?? def);
  return Number.isFinite(n) ? n : def;
}

export function parseBool(v: string | undefined, def: boolean): boolean {
  if (v === undefined) return def;
  return v === "true" || v === "1";
}
