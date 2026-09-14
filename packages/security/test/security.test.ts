import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import {
  createAccessToken,
  verifyAccessToken,
  createRefreshToken,
  decodeRefreshToken,
  RefreshRotator,
  RevocationStore,
  RefreshReuseError,
  TokenRevokedError,
} from "../src/tokens.js";
import { hashPassword, verifyPassword } from "../src/password.js";
import { hasRole, ROLES, canAccess } from "../src/rbac.js";

const OPTS = { secret: "unit-test-secret" };

describe("security: token creation (v2)", () => {
  it("creates and verifies a v2 access token with issuer/audience", () => {
    const t = createAccessToken({ sub: "1", role: "student" }, OPTS);
    const p = verifyAccessToken(t, OPTS);
    expect(p.sub).toBe("1");
    expect(p.type).toBe("access");
    expect(p.ver).toBe(2);
  });

  it("rejects a token signed with a different secret", () => {
    const t = createAccessToken({ sub: "1", role: "student" }, OPTS);
    expect(() => verifyAccessToken(t, { secret: "wrong-secret" })).toThrow();
  });

  it("accepts legacy ver-less tokens during the C-A2 grace period", () => {
    const legacy = jwt.sign(
      { sub: "old", role: "teacher", type: "access" },
      OPTS.secret,
      { expiresIn: 900 }
    );
    const p = verifyAccessToken(legacy, OPTS);
    expect(p.sub).toBe("old");
  });
});

describe("security: access token expiry", () => {
  it("expires after ttl (1s access token)", async () => {
    const t = createAccessToken({ sub: "1", role: "student" }, OPTS, 1);
    await new Promise((r) => setTimeout(r, 1100));
    expect(() => verifyAccessToken(t, OPTS)).toThrow();
  }, 5000);
});

describe("security: refresh rotation (v2, async)", () => {
  it("rotates and revokes the previous token", async () => {
    const rot = new RefreshRotator();
    const first = createRefreshToken("u1", "fam-rotate", OPTS);
    const r = await rot.rotate(first, OPTS);
    expect(r.userId).toBe("u1");
    expect(r.familyId).toBe("fam-rotate");
    expect(r.token).not.toBe(first);
    const payload = decodeRefreshToken(r.token, OPTS);
    expect(payload.rot).toBe(1);
    expect(payload.ver).toBe(2);
  });

  it("replay of a consumed refresh token revokes the whole family", async () => {
    const store = new RevocationStore();
    const rot = new RefreshRotator(store);
    const first = createRefreshToken("u1", "fam-replay", OPTS);
    const r1 = await rot.rotate(first, OPTS);
    await expect(rot.rotate(first, OPTS)).rejects.toThrowError(RefreshReuseError);
    await expect(rot.rotate(r1.token, OPTS)).rejects.toThrowError(RefreshReuseError);
  });

  it("rejects a refresh token signed with the wrong secret", async () => {
    const rot = new RefreshRotator();
    const bad = jwt.sign(
      { type: "refresh", ver: 2, sub: "u1", familyId: "f1", jti: "j1", rot: 0 },
      "wrong-secret",
      { expiresIn: "30d" }
    );
    await expect(rot.rotate(bad, OPTS)).rejects.toThrowError(TokenRevokedError);
  });
});

describe("security: RBAC / unauthorized access", () => {
  it("hasRole gates platform roles", () => {
    expect(hasRole("student", ["student"])).toBe(true);
    expect(hasRole("student", ["teacher", "admin"])).toBe(false);
    expect(hasRole("student", [])).toBe(true);
    expect(hasRole(undefined, ["admin"])).toBe(false);
    expect(ROLES).toEqual(["admin", "principal", "teacher", "student", "parent"]);
  });

  it("canAccess denies unauthorized requester", () => {
    expect(canAccess({ role: "student" }, "teacher", "principal")).toBe(false);
    expect(canAccess({ role: "admin" }, "admin", "teacher")).toBe(true);
    expect(canAccess({ role: "admin" }, "teacher", "principal")).toBe(false);
    expect(canAccess({ role: "admin" })).toBe(true);
    expect(canAccess({})).toBe(false);
  });
});

describe("security: password hashing (bcryptjs)", () => {
  it("hash + verify round-trip", async () => {
    const hash = await hashPassword("s3cret!", 10);
    expect(await verifyPassword("s3cret!", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});
