import { beforeAll, afterAll, describe, expect, it } from "vitest";
import http from "node:http";
import { randomUUID } from "node:crypto";
import app from "../../apps/api/src/app.js";
import { db } from "../../packages/database/src/client.js";
import { usersTable } from "../../packages/database/src/schema/users.js";
import { tenantsTable } from "../../packages/database/src/schema/tenants.js";
import { passwordResetTokensTable } from "../../packages/database/src/schema/system.js";
import { hashPassword, createAccessToken } from "../../packages/security/src/index.js";
import { AUTH_TOKEN_OPTS } from "../../packages/database/src/auth/session.js";
import { eq, sql } from "drizzle-orm";

let server: http.Server;
let baseUrl = "";
const tenantId = randomUUID();
const userId = randomUUID();
const email = `phase1-${randomUUID()}@buytuk.local`;
const goodPassword = "StrongPass123!";

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id),
    tenant_id text NOT NULL REFERENCES tenants(id),
    token_hash text NOT NULL,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens(user_id)`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS password_reset_tokens_hash_idx ON password_reset_tokens(token_hash)`));
  await db.insert(tenantsTable).values({ id: tenantId, name: `Tenant ${tenantId}`, slug: `tenant-${tenantId}` });
  await db.insert(usersTable).values({
    id: userId,
    tenantId,
    firstName: "Phase",
    lastName: "One",
    email,
    passwordHash: await hashPassword(goodPassword),
    role: "teacher",
    isActive: true,
  });
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") throw new Error("No address");
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await db.execute(sql.raw(`DELETE FROM password_reset_tokens WHERE user_id = '${userId}'`));
  await db.execute(sql.raw(`DELETE FROM refresh_tokens WHERE user_id = '${userId}'`));
  await db.delete(usersTable).where(eq(usersTable.id, userId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
  if (server) {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
});

describe("Phase 1 auth hardening", () => {
  it("rejects bad password", async () => {
    const res = await post("/v1/auth/login", { email, password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  it("rejects expired token on /v1/auth/me", async () => {
    const token = createAccessToken({ sub: userId, role: "teacher", tenantId, email }, AUTH_TOKEN_OPTS, -1);
    const res = await fetch(`${baseUrl}/v1/auth/me`, { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(401);
  });

  it("blocks auth bypass on protected student route without token", async () => {
    const res = await fetch(`${baseUrl}/v1/students/${randomUUID()}/dashboard`);
    expect(res.status).toBe(401);
  });

  it("issues and consumes reset token", async () => {
    const forgot = await post("/v1/auth/forgot-password", { email });
    expect(forgot.status).toBe(200);
    const payload = await forgot.json();
    expect(payload.ok).toBe(true);
    expect(typeof payload.resetToken).toBe("string");
    const reset = await post("/v1/auth/reset-password", { resetToken: payload.resetToken, newPassword: "NewStrongPass123!" });
    expect(reset.status).toBe(200);
    const login = await post("/v1/auth/login", { email, password: "NewStrongPass123!" });
    expect(login.status).toBe(200);
  });

  it("locks out repeated auth attempts with rate limiting", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const res = await post("/v1/auth/login", { email, password: "wrong-password" });
      statuses.push(res.status);
    }
    expect(statuses.slice(-1)[0]).toBe(429);
  });
});
