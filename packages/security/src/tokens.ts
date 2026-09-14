/**
 * @workspace/security — tokens.ts
 * D-03 unified token policy: Access 15 min (ver 2) + rotating Refresh (family + jti).
 * C-A2 grace period: ver-2 tokens assert issuer/audience; legacy (ver-less)
 * tokens verify signature only, so old tokens keep working until they expire.
 */
import jwt, { type SignOptions } from "jsonwebtoken";
import { randomUUID } from "node:crypto";

export interface TokenUser {
  sub: string;
  role: string;
  tenantId?: string;
  schoolId?: string;
  organizationId?: string;
  email?: string;
  /** CORE-24 Wave 3 (additive): present on STUDENT tokens — the platform-minted
   *  student id verified at unified login (20-O context binding). Absent for staff. */
  studentId?: string;
}

export interface AccessPayload extends TokenUser {
  type: "access";
  ver?: 1 | 2;
}

export interface RefreshPayload {
  type: "refresh";
  ver: 2;
  sub: string;
  familyId: string;
  jti: string;
  rot: number;
}

export interface TokenOptions {
  secret: string;
  issuer?: string;
  audience?: string;
  algorithm?: "HS256";
}

const DEFAULT_ISSUER = "buytuk";
const DEFAULT_AUDIENCE = "buytuk-client";

export function createAccessToken(
  user: TokenUser,
  opts: TokenOptions,
  ttlSeconds = 900,
): string {
  const payload: AccessPayload = { ...user, type: "access", ver: 2 };
  return jwt.sign(payload, opts.secret, {
    expiresIn: ttlSeconds,
    issuer: opts.issuer ?? DEFAULT_ISSUER,
    audience: opts.audience ?? DEFAULT_AUDIENCE,
    algorithm: opts.algorithm ?? "HS256",
  } as SignOptions);
}

/** C-A2: accepts legacy ver-less tokens (signature only) and ver-2 (issuer/audience asserted). */
export function verifyAccessToken(token: string, opts: TokenOptions): AccessPayload {
  const decoded = jwt.verify(token, opts.secret, {
    algorithms: ["HS256"],
  }) as AccessPayload & { iss?: string; aud?: string | string[] };
  if (decoded.type !== "access") throw new Error("Not an access token");
  if (decoded.ver === 2) {
    const iss = opts.issuer ?? DEFAULT_ISSUER;
    const aud = opts.audience ?? DEFAULT_AUDIENCE;
    if (decoded.iss !== iss || !(decoded.aud === aud || (Array.isArray(decoded.aud) && decoded.aud.includes(aud)))) {
      throw new Error("Invalid issuer/audience");
    }
  }
  return decoded; // ver-less (legacy) passes for the grace period
}

export function createRefreshToken(
  userId: string,
  familyId: string,
  opts: TokenOptions,
  ttlDays = 30,
): string {
  const payload: RefreshPayload = {
    type: "refresh",
    ver: 2,
    sub: userId,
    familyId,
    jti: randomUUID(),
    rot: 0,
  };
  return jwt.sign(payload, opts.secret, {
    expiresIn: `${ttlDays}d`,
    issuer: opts.issuer ?? DEFAULT_ISSUER,
    audience: opts.audience ?? DEFAULT_AUDIENCE,
    algorithm: opts.algorithm ?? "HS256",
  } as SignOptions);
}

export function decodeRefreshToken(token: string, opts: TokenOptions): RefreshPayload {
  const decoded = jwt.verify(token, opts.secret, {
    algorithms: ["HS256"],
  }) as RefreshPayload;
  if (decoded.type !== "refresh" || decoded.ver !== 2) throw new Error("Not a v2 refresh token");
  return decoded;
}

export class TokenRevokedError extends Error {
  constructor(message = "Refresh token is revoked or invalid") {
    super(message);
    this.name = "TokenRevokedError";
  }
}

export class RefreshReuseError extends Error {
  constructor(message = "Refresh token reuse detected; family revoked") {
    super(message);
    this.name = "RefreshReuseError";
  }
}

/** Async store so in-memory and DB-backed implementations are interchangeable (C-A3). */
export interface RefreshTokenStore {
  isRevoked(jti: string, familyId: string): Promise<boolean>;
  revoke(jti: string): Promise<void>;
  revokeFamily(familyId: string): Promise<void>;
}

interface RevocationEntry {
  expiresAt: number;
  familyRevoked?: boolean;
}

/** In-memory store — production deployments should use the DB-backed store in apps/api. */
export class RevocationStore implements RefreshTokenStore {
  private revoked = new Map<string, RevocationEntry>();
  constructor(private ttlMs = 30 * 24 * 3600 * 1000) {}

  async revoke(jti: string): Promise<void> {
    this.prune();
    this.revoked.set(jti, { expiresAt: Date.now() + this.ttlMs });
  }

  async revokeFamily(familyId: string): Promise<void> {
    this.prune();
    const now = Date.now();
    for (const [k, v] of this.revoked) {
      if (v.expiresAt < now) this.revoked.delete(k);
    }
    this.revoked.set(`f:${familyId}`, { expiresAt: now + this.ttlMs, familyRevoked: true });
  }

  async isRevoked(jti: string, familyId: string): Promise<boolean> {
    this.prune();
    if (this.revoked.has(`f:${familyId}`)) return true;
    return this.revoked.has(jti);
  }

  private prune(): void {
    const now = Date.now();
    for (const [k, v] of this.revoked) {
      if (v.expiresAt < now) this.revoked.delete(k);
    }
  }
}

/** Rotating refresh: each rotation revokes the previous token; reuse revokes the family. */
export class RefreshRotator {
  constructor(private store: RefreshTokenStore = new RevocationStore()) {}

  async rotate(
    current: string,
    opts: TokenOptions,
    ttlDays = 30,
  ): Promise<{ token: string; userId: string; familyId: string }> {
    let payload: RefreshPayload;
    try {
      payload = decodeRefreshToken(current, opts);
    } catch {
      throw new TokenRevokedError();
    }
    if (await this.store.isRevoked(payload.jti, payload.familyId)) {
      await this.store.revokeFamily(payload.familyId);
      throw new RefreshReuseError();
    }
    await this.store.revoke(payload.jti);
    const next: RefreshPayload = {
      type: "refresh",
      ver: 2,
      sub: payload.sub,
      familyId: payload.familyId,
      jti: randomUUID(),
      rot: payload.rot + 1,
    };
    const token = jwt.sign(next, opts.secret, {
      expiresIn: `${ttlDays}d`,
      issuer: opts.issuer ?? DEFAULT_ISSUER,
      audience: opts.audience ?? DEFAULT_AUDIENCE,
      algorithm: opts.algorithm ?? "HS256",
    } as SignOptions);
    return { token, userId: payload.sub, familyId: payload.familyId };
  }
}
