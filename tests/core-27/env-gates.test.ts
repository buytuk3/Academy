/**
 * CORE-27 / Batch 2 — Environment gates: REAL PostgreSQL + REAL Redis + REAL HTTP.
 * No mocks. If any gate fails the whole batch is BLOCKED.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { db } from "@workspace/db";

describe("CORE-27 Batch 2 — environment gates (real infra)", () => {
  it("GATE-PG: real PostgreSQL round-trip", async () => {
    const res = await db.execute(sql`SELECT current_database() AS db, version() AS v`);
    const list = (Array.isArray(res) ? res : (res as { rows?: Array<{ db: string; v: string }> }).rows ?? []) as Array<{ db: string; v: string }>;
    const row = list[0];
    console.log("GATE_PG", JSON.stringify(row));
    expect(row.db).toBe("core27_verify");
  });

  it("GATE-REDIS: real Redis PING → PONG", async () => {
    const { redis } = await import("@workspace/queue");
    const pong = await redis.ping();
    console.log("GATE_REDIS", pong);
    expect(pong).toBe("PONG");
  });

  it("GATE-HTTP: real API boots and /api/healthz → {status:ok}", async () => {
    const { default: app } = await import("../../apps/api/src/app.js");
    const server: Server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    try {
      const port = (server.address() as AddressInfo).port;
      const res = await fetch(`http://127.0.0.1:${port}/api/healthz`);
      const json = (await res.json()) as { status: string };
      console.log("GATE_HTTP", res.status, JSON.stringify(json));
      expect(res.status).toBe(200);
      expect(json.status).toBe("ok");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
