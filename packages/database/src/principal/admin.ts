/**
 * PHASE-9 (PRINCIPAL-ADMIN-CAPABILITIES) — Principal/admin oversight READ
 * capabilities (core-platform). SELECT-only, tenant-scoped: every query runs
 * inside withTenant → RLS-enforced (migration 0007 — fail-closed without the
 * tenant GUC). NO writes to learning state, NO new tables: pure reuse of
 * staff_memberships, users, classes, students, audit_logs (DEV-009 closure).
 * Row visibility mirrors the oversight posture: roster/classes for principal+
 * admin; user accounts and the audit trail are ADMIN-only. Sensitive listings
 * are audited (same audit_logs channel as the detail gates).
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../client.js";
import { withTenant } from "../tenancy.js";
import {
  auditLogsTable,
  classesTable,
  staffMembershipsTable,
  studentsTable,
  usersTable,
} from "../schema/index.js";
import { createLogger } from "@workspace/observability";

const log = createLogger({ name: "buytuk-db:principal-admin" });

export type StaffRosterRow = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  scopeType: string;
  scopeId: string | null;
  status: string;
};

/** Principal/admin: real staff roster (active memberships joined to users). */
export async function listTenantStaff(tenantId: string, actorId: string): Promise<StaffRosterRow[]> {
  const rows = await withTenant(tenantId, async (tx) => {
    const out = await tx
      .select({
        userId: staffMembershipsTable.userId,
        role: staffMembershipsTable.role,
        scopeType: staffMembershipsTable.scopeType,
        scopeId: staffMembershipsTable.scopeId,
        status: staffMembershipsTable.status,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
      })
      .from(staffMembershipsTable)
      .innerJoin(usersTable, eq(usersTable.id, staffMembershipsTable.userId))
      .where(and(eq(staffMembershipsTable.tenantId, tenantId), isNull(staffMembershipsTable.activeTo)))
      .orderBy(desc(staffMembershipsTable.createdAt))
      .limit(200);
    await tx.insert(auditLogsTable).values({
      id: crypto.randomUUID(),
      tenantId,
      actorId,
      action: "admin_staff.listed",
      entity: "staff_memberships",
      entityId: null,
      metadata: null,
    });
    return out;
  });
  log.info({ tenantId, count: rows.length }, "staff roster listed");
  return rows;
}

export type ClassSummaryRow = {
  classId: string;
  name: string;
  gradeLevel: string;
  academicYear: string;
  studentCount: number;
};

/** Principal/admin: real class list with active-student counts. */
export async function listTenantClasses(tenantId: string, actorId: string): Promise<ClassSummaryRow[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        classId: classesTable.id,
        name: classesTable.name,
        gradeLevel: classesTable.gradeLevel,
        academicYear: classesTable.academicYear,
        studentCount: sql<number>`count(${studentsTable.id})::int`,
      })
      .from(classesTable)
      .leftJoin(studentsTable, and(eq(studentsTable.classId, classesTable.id), eq(studentsTable.isActive, true)))
      .where(eq(classesTable.tenantId, tenantId))
      .groupBy(classesTable.id, classesTable.name, classesTable.gradeLevel, classesTable.academicYear)
      .orderBy(classesTable.name)
      .limit(200);
    return rows;
  });
}

export type TenantUserRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  isActive: boolean;
};

/** ADMIN ONLY: real tenant user accounts (SafeUser projection — never the hash). */
export async function listTenantUsers(tenantId: string, actorId: string): Promise<TenantUserRow[]> {
  const rows = await withTenant(tenantId, async (tx) => {
    const out = await tx
      .select({
        id: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        role: usersTable.role,
        isActive: usersTable.isActive,
      })
      .from(usersTable)
      .where(eq(usersTable.tenantId, tenantId))
      .orderBy(desc(usersTable.createdAt))
      .limit(200);
    await tx.insert(auditLogsTable).values({
      id: crypto.randomUUID(),
      tenantId,
      actorId,
      action: "admin_users.listed",
      entity: "users",
      entityId: null,
      metadata: null,
    });
    return out;
  });
  log.info({ tenantId, count: rows.length }, "tenant users listed");
  return rows;
}

export type AuditEventRow = {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  actorId: string | null;
  createdAt: Date;
};

/** ADMIN ONLY: recent tenant audit trail (read-only; never mutated here). */
export async function listAuditEvents(tenantId: string, limit = 50): Promise<AuditEventRow[]> {
  return withTenant(tenantId, async (tx) =>
    tx
      .select({
        id: auditLogsTable.id,
        action: auditLogsTable.action,
        entity: auditLogsTable.entity,
        entityId: auditLogsTable.entityId,
        actorId: auditLogsTable.actorId,
        createdAt: auditLogsTable.createdAt,
      })
      .from(auditLogsTable)
      .where(eq(auditLogsTable.tenantId, tenantId))
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(limit),
  );
}
