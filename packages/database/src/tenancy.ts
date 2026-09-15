/**
 * PHASE-2 (SECURITY/RLS/TENANCY) — Tenant context propagation helper.
 *
 * withTenant(tenantId, fn):
 *   opens a transaction on the canonical shared pool, sets the PostgreSQL
 *   transaction-local GUC `app.tenant_id` (set_config(..., is_local => true)),
 *   runs the callback against the transactional client, then commits/rolls
 *   back. Because the setting is TRANSACTION-LOCAL:
 *     - no global mutable tenant state exists,
 *     - nothing persists on the pooled connection after commit/rollback,
 *     - a rollback always returns the connection to a safe state,
 *     - concurrent requests on other pooled connections are unaffected.
 *
 * This is the ONLY sanctioned way for post-authentication code paths to reach
 * tenant-scoped tables when Row Level Security (migration 0007) is enforced:
 * RLS policies compare `tenant_id = current_setting('app.tenant_id', true)`,
 * so any query executed WITHOUT this helper simply sees zero rows (fail-closed)
 * and any cross-tenant write is rejected by the WITH CHECK clause.
 */
import { sql } from "drizzle-orm";
import { db } from "./client.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Thrown when withTenant is called without a syntactically valid tenant id. */
export class TenantContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantContextError";
  }
}

/**
 * Run `fn` inside a transaction whose `app.tenant_id` GUC is pinned to
 * `tenantId` (transaction-local; never leaked to the pooled connection).
 * The transactional drizzle client is passed to the callback.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  if (!tenantId || !UUID_RE.test(tenantId)) {
    throw new TenantContextError("TENANT_CONTEXT_INVALID");
  }
  return db.transaction(async (tx) => {
    // is_local => true → the setting dies with the transaction (commit OR
    // rollback). No global state, no pool leakage, rollback-safe by design.
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}

/** True when the value is a syntactically valid tenant UUID. */
export function isValidTenantId(v: string | undefined | null): boolean {
  return !!v && UUID_RE.test(v);
}
