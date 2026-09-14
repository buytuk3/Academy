import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import {
  createAccessToken,
  verifyAccessToken,
  createRefreshToken,
  RefreshRotator,
  RevocationStore,
} from "@workspace/security";

const OPTS = { secret: "p4-unit-secret" };

describe("apps/api auth composition (canonical D-03)", () => {
  it("issues a v2 access token and verifies it canonically", () => {
    const t = createAccessToken({ sub: "u1", role: "student", tenantId: "t1" }, OPTS);
    const p = verifyAccessToken(t, OPTS);
    expect(p.sub).toBe("u1");
    expect(p.role).toBe("student");
    expect(p.ver).toBe(2);
  });

  it("accepts a legacy (ver-less) token during the C-A2 grace period", () => {
    const legacy = jwt.sign(
      { sub: "legacy-user", role: "teacher", type: "access" },
      OPTS.secret,
      { expiresIn: 900 }
    );
    const p = verifyAccessToken(legacy, OPTS);
    expect(p.sub).toBe("legacy-user");
  });

  it("rejects tokens signed with a different secret", () => {
    const t = createAccessToken({ sub: "u1", role: "admin" }, OPTS);
    expect(() => verifyAccessToken(t, { secret: "wrong" })).toThrow();
  });

  it("rotates refresh tokens with the in-memory store", async () => {
    const rot = new RefreshRotator(new RevocationStore());
    const first = createRefreshToken("u1", "fam-p4", OPTS);
    const r = await rot.rotate(first, OPTS);
    expect(r.familyId).toBe("fam-p4");
    expect(r.token).not.toBe(first);
  });
});
