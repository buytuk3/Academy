import { describe, it, expect } from "vitest";
import { loadConfig, ConfigError } from "../src/runtime.js";
import { validateEnv } from "../src/env.js";

const FULL_ENV = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://localhost/test",
  JWT_SECRET: "unit-test-secret",
  AUDIO_KEK: "unit-test-kek",
  PORT: "8080",
  REDIS_URL: "redis://cache:6379",
  LOG_LEVEL: "debug",
};

describe("config: missing required env (strict)", () => {
  it("throws listing all missing keys", () => {
    expect(() => loadConfig({}, { strict: true })).toThrowError(ConfigError);
    try {
      loadConfig({}, { strict: true });
    } catch (e) {
      const err = e as ConfigError;
      expect(err.errors.join(" ")).toContain("DATABASE_URL");
      expect(err.errors.join(" ")).toContain("JWT_SECRET");
      expect(err.errors.join(" ")).toContain("AUDIO_KEK");
    }
  });
});

describe("config: invalid env", () => {
  it("rejects invalid PORT", () => {
    const v = validateEnv({ ...FULL_ENV, PORT: "abc" }, true);
    expect(v.errors.some((e) => e.includes("PORT"))).toBe(true);
  });
  it("rejects invalid NODE_ENV", () => {
    const v = validateEnv({ ...FULL_ENV, NODE_ENV: "staging" }, true);
    expect(v.errors.some((e) => e.includes("NODE_ENV"))).toBe(true);
  });
  it("rejects inverted pool bounds", () => {
    const v = validateEnv({ ...FULL_ENV, DATABASE_POOL_MIN: "20", DATABASE_POOL_MAX: "5" }, true);
    expect(v.errors.some((e) => e.includes("DATABASE_POOL"))).toBe(true);
  });
});

describe("config: valid env", () => {
  it("returns typed values", () => {
    const c = loadConfig(FULL_ENV, { strict: true });
    expect(c.env).toBe("test");
    expect(c.server.port).toBe(8080);
    expect(c.redis.url).toBe("redis://cache:6379");
    expect(c.jwt.accessTtlSeconds).toBe(900);
    expect(c.observability.logLevel).toBe("debug");
  });
});

describe("config: G5-A.1 / GAP-003 — production secret hardening", () => {
  const PROD = { NODE_ENV: "production", DATABASE_URL: "postgres://prod/db" } as const;

  it("rejects production boot with development JWT placeholder", () => {
    expect(() => loadConfig({ ...PROD, JWT_SECRET: "dev-secret-change-me", AUDIO_KEK: "real-kek-value-32-chars-minimum" }, { strict: true }))
      .toThrowError(ConfigError);
    try {
      loadConfig({ ...PROD, JWT_SECRET: "dev-secret-change-me", AUDIO_KEK: "real-kek-value-32-chars-minimum" }, { strict: true });
    } catch (e) {
      expect((e as ConfigError).errors.join(" ")).toContain("JWT_SECRET");
    }
  });

  it("rejects production boot with development AUDIO_KEK placeholder", () => {
    expect(() => loadConfig({ ...PROD, JWT_SECRET: "real-jwt-secret-strong-enough", AUDIO_KEK: "dev-kek-change-me" }, { strict: true }))
      .toThrowError(ConfigError);
    try {
      loadConfig({ ...PROD, JWT_SECRET: "real-jwt-secret-strong-enough", AUDIO_KEK: "dev-kek-change-me" }, { strict: true });
    } catch (e) {
      expect((e as ConfigError).errors.join(" ")).toContain("AUDIO_KEK");
    }
  });

  it("accepts production boot with real secrets (no false positives)", () => {
    const c = loadConfig({ ...PROD, JWT_SECRET: "real-jwt-secret-strong-enough", AUDIO_KEK: "real-kek-value-32-chars-minimum" }, { strict: true });
    expect(c.jwt.secret).toBe("real-jwt-secret-strong-enough");
    expect(c.storage.kek).toBe("real-kek-value-32-chars-minimum");
  });

  it("dev/test behavior unchanged — placeholders still fall back (non-strict)", () => {
    const c = loadConfig({ PORT: "3000" }, { strict: false });
    expect(c.jwt.secret).toBe("dev-secret-change-me");
    expect(c.storage.kek).toBe("dev-kek-change-me");
    const w = validateEnv({ NODE_ENV: "development", JWT_SECRET: "dev-secret-change-me", AUDIO_KEK: "dev-kek-change-me" }, false);
    expect(w.errors).toHaveLength(0); // value check is strict-mode ONLY
  });

  it("validateEnv(strict) flags insecure values in errors (unit surface)", () => {
    const v = validateEnv({ NODE_ENV: "production", DATABASE_URL: "x", JWT_SECRET: "dev-secret-change-me", AUDIO_KEK: "dev-kek-change-me" }, true);
    expect(v.errors.some((e) => e.includes("JWT_SECRET"))).toBe(true);
    expect(v.errors.some((e) => e.includes("AUDIO_KEK"))).toBe(true);
  });
});

describe("config: dev defaults (non-strict)", () => {
  it("applies defaults instead of throwing", () => {
    const c = loadConfig({ PORT: "3000" }, { strict: false });
    expect(c.jwt.secret).toBe("dev-secret-change-me");
    expect(c.db.url).toBe("");
    expect(c.server.port).toBe(3000);
    expect(c.queue.attempts).toBe(3);
    expect(c.queue.backoffType).toBe("exponential");
  });
});
