/**
 * @workspace/config — runtime.ts
 * Typed runtime configuration assembled from validated env + defaults.
 * Dependent on NOTHING inside the monorepo (dependency leaf).
 */
import {
  validateEnv,
  parsePort,
  parseIntDef,
  parseBool,
  type AppEnv,
} from "./env.js";

export interface RuntimeConfig {
  env: AppEnv;
  server: { port: number; host: string };
  db: { url: string; poolMin: number; poolMax: number; ssl: boolean };
  redis: { url: string; prefix: string };
  jwt: {
    secret: string;
    accessTtlSeconds: number;
    refreshTtlDays: number;
    issuer: string;
    audience: string;
    algorithm: "HS256";
  };
  storage: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
    bucket: string;
    presignedExpires: number;
    kek: string;
    endpointUrl: string;
    forcePathStyle: boolean;
  };
  inference: {
    gatewayUrl: string;
    protoPath: string;
    apiKey: string;
    dfnWorkerPath: string;
  };
  queue: {
    maxJobs: number;
    concurrency: number;
    attempts: number;
    backoffType: "exponential" | "fixed";
    backoffDelay: number;
    removeOnCompleteCount: number;
    removeOnCompleteAge: number;
    removeOnFailCount: number;
    removeOnFailAge: number;
  };
  observability: { logLevel: string };
  security: {
    corsOrigin: string;
    corsMethods: string[];
    corsAllowedHeaders: string[];
    corsCredentials: boolean;
    rateLimitWindowMs: number;
    rateLimitMax: number;
    authRateLimitWindowMs: number;
    authRateLimitMax: number;
    passwordResetTtlMinutes: number;
  };
}

export class ConfigError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Config validation failed: ${errors.join("; ")}`);
    this.name = "ConfigError";
  }
}

export interface LoadConfigOptions {
  strict?: boolean;
  warnings?: string[];
}

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
  opts: LoadConfigOptions = {},
): RuntimeConfig {
  const strict = opts.strict ?? env.NODE_ENV === "production";
  const { errors, warnings } = validateEnv(env, strict);
  if (opts.warnings) opts.warnings.push(...warnings);
  if (errors.length > 0) throw new ConfigError(errors);

  return {
    env: (env.NODE_ENV as AppEnv | undefined) ?? "development",
    server: { port: parsePort(env.PORT, 4000), host: env.HOST || "0.0.0.0" },
    db: {
      url: env.DATABASE_URL ?? "",
      poolMin: parseIntDef(env.DATABASE_POOL_MIN, 5),
      poolMax: parseIntDef(env.DATABASE_POOL_MAX, 20),
      ssl: env.DATABASE_SSL === "true",
    },
    redis: {
      url: env.REDIS_URL || "redis://localhost:6379",
      prefix: env.REDIS_PREFIX || "buytuk",
    },
    jwt: {
      secret: env.JWT_SECRET ?? "dev-secret-change-me",
      accessTtlSeconds: parseIntDef(env.JWT_ACCESS_TTL_SECONDS, 900),
      refreshTtlDays: parseIntDef(env.JWT_REFRESH_TTL_DAYS, 30),
      issuer: env.JWT_ISSUER || "buytuk",
      audience: env.JWT_AUDIENCE || "buytuk-client",
      algorithm: "HS256",
    },
    storage: {
      region: env.AWS_REGION || env.S3_REGION || "us-east-1",
      accessKeyId: env.AWS_ACCESS_KEY_ID ?? env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY ?? env.S3_SECRET_ACCESS_KEY ?? "",
      sessionToken: env.AWS_SESSION_TOKEN ?? env.S3_SESSION_TOKEN ?? "",
      bucket: env.S3_BUCKET || "buytuk-audio",
      presignedExpires: parseIntDef(env.S3_PRESIGNED_EXPIRES, 3600),
      kek: env.AUDIO_KEK ?? "dev-kek-change-me",
      endpointUrl: env.S3_ENDPOINT_URL || env.S3_ENDPOINT || env.AWS_ENDPOINT_URL_S3 || "",
      forcePathStyle: parseBool(env.S3_FORCE_PATH_STYLE, false),
    },
    inference: {
      gatewayUrl: env.INFERENCE_GATEWAY_URL || "localhost:50051",
      protoPath: env.INFERENCE_PROTO_PATH || "./inference-gateway/proto/inference.proto",
      apiKey: env.INFERENCE_API_KEY ?? "",
      dfnWorkerPath: env.DFN_WORKER_PATH || "./dfn-worker",
    },
    queue: {
      maxJobs: 100,
      concurrency: 3,
      attempts: 3,
      backoffType: "exponential",
      backoffDelay: 2000,
      removeOnCompleteCount: 1000,
      removeOnCompleteAge: 7 * 24 * 3600,
      removeOnFailCount: 5000,
      removeOnFailAge: 30 * 24 * 3600,
    },
    observability: { logLevel: env.LOG_LEVEL || "info" },
    security: {
      corsOrigin: env.CORS_ORIGIN || "http://localhost:3000",
      corsMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      corsAllowedHeaders: ["Content-Type", "Authorization", "X-Tenant-Id", "Idempotency-Key"],
      corsCredentials: true,
      rateLimitWindowMs: parseIntDef(env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
      rateLimitMax: parseIntDef(env.RATE_LIMIT_MAX, 100),
      authRateLimitWindowMs: parseIntDef(env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
      authRateLimitMax: parseIntDef(env.AUTH_RATE_LIMIT_MAX, 10),
      passwordResetTtlMinutes: parseIntDef(env.PASSWORD_RESET_TTL_MINUTES, 30),
    },
  };
}
