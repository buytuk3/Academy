/**
 * lib/api-zod — auth contract types (P4.7 / C-A5).
 * Hand-written mirror of the expanded openapi section; the automated orval
 * regeneration runs in CI once orval is installed (documented in the P4 report).
 */
import { z } from "zod";

/**
 * CORE-24 Wave 3: LoginRequest / RefreshRequest / LogoutRequest now live in the
 * canonical GENERATED v1 contract (v1-schemas.generated.js, sourced from
 * lib/api-spec/v1.yaml) — shapes verified identical to the former hand-written
 * mirrors below. Re-exported here to keep the legacy surface stable with a
 * single definition (no parallel API layers).
 */
export type { LoginRequest, RefreshRequest, LogoutRequest } from "../v1-schemas.generated.js";

export const RoleEnum = z.enum(["admin", "principal", "teacher", "student", "parent"]);

export const RegisterRequest = z.object({
  tenantId: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: RoleEnum.default("teacher"),
});

export const UserResponse = z.object({
  id: z.string(),
  tenantId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  role: RoleEnum,
  isActive: z.boolean().optional(),
  createdAt: z.string().optional(),
});

export const TokenPair = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export const RegisterResponse = TokenPair.extend({
  user: UserResponse.omit({ isActive: true, createdAt: true }),
});

export const AuthError = z.object({
  error: z.string(),
});

/** Type twins for the zod VALUE exports above (client signatures consume types). */
export type RegisterRequestT = z.infer<typeof RegisterRequest>;
export type TokenPairT = z.infer<typeof TokenPair>;
export type UserResponseT = z.infer<typeof UserResponse>;
export type AuthErrorT = z.infer<typeof AuthError>;
