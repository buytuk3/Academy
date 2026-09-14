import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const JWT_SECRET = process.env.SESSION_SECRET;
const JWT_EXPIRES_IN = "15m";
const REFRESH_TOKEN_BYTES = 48;
const BCRYPT_ROUNDS = 12;

if (!JWT_SECRET) {
  throw new Error("SESSION_SECRET must be set");
}

// ─── Password ────────────────────────────────────────────────
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ─── Access Token (JWT) ──────────────────────────────────────
export interface TokenPayload {
  sub: string;       // user ID
  tenantId: string;
  role: string;
  email: string;
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET!, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET!) as TokenPayload;
}

// ─── Refresh Token ───────────────────────────────────────────
/** Returns a random opaque token string */
export function generateRefreshToken(): string {
  return crypto.randomBytes(REFRESH_TOKEN_BYTES).toString("hex");
}

/** Store only the hash — never the raw token */
export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function refreshTokenExpiresAt(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 30); // 30-day refresh window
  return d;
}
