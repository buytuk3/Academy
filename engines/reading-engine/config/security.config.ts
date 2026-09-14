/**
 * Security configuration
 */
export const securityConfig = {
  jwt: {
    algorithm: "HS256" as const,
    expiresIn: "7d",
    issuer: "buytuk",
    audience: "buytuk-client",
  },

  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
    message: "Too many requests, please try again later",
    standardHeaders: true,
    legacyHeaders: false,
  },

  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400, // 24 hours
  },

  encryption: {
    algorithm: "aes-256-gcm" as const,
    keyLength: 32,
    ivLength: 16,
    authTagLength: 16,
  },

  s3: {
    presignedExpires: 3600, // 1 hour
    serverSideEncryption: "aws:kms" as const,
    bucketKeyEnabled: true,
  },

  audit: {
    enabled: true,
    logLevel: "info",
    sensitiveFields: [
      "password",
      "passwordHash",
      "token",
      "audioKey",
      "encryptedKey",
    ],
  },

  inference: {
    apiKeyRequired: true,
    allowedIPs: process.env.INFERENCE_ALLOWED_IPS?.split(",") || [],
    timeout: 60000,
  },
} as const;

export type SecurityConfig = typeof securityConfig;
