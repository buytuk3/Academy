/**
 * CORE-20 (20-A…20-F, 20-I…20-L, 20-AA, 20-AD) — Institutional Aggregation
 * & Student-Detail gate (core-platform).
 *
 * Aggregations are DERIVED PROJECTIONS over canonical Evidence ONLY (20-W —
 * no second statistics store). Every query is scope-bounded and time-bounded;
 * a global/unscoped AVG is impossible by construction (20-Y). Engines never
 * aggregate (20-V).
 *
 * Privacy (20-AA): a group whose assessed-student count is below the
 * config-driven minimumAggregationSize is suppressed → INSUFFICIENT_EVIDENCE
 * with NO mean and NO trend — a small group can never expose an individual.
 *
 * 20-B/20-I: individual student detail is SCHOOL-scope-only by default —
 * Ministry/Governorate/Directorate (ORGANIZATION scope) can NEVER pass this
 * gate for individual students; they consume aggregates instead.
 *
 * 20-M: CLASS/GRADE-scoped staff are force-narrowed to their own
 * classes/grades — omitting a filter never widens their view.
 *
 * 20-D: NO single student/school score anywhere — metrics are per
 * (school, stage, grade, subject, evidenceType); nothing computes an "overall".
 *
 * Ownership: core-platform ("educational-aggregation"). No AI (20-AU).
 */
import { and, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import {
  auditLogsTable,
  classesTable,
  evidenceTable,
  schoolsTable,
  staffMembershipsTable,
  studentsTable,
} from "../schema/index.js";
import type { EvidenceType } from "../schema/index.js";
import { db } from "../client.js";
import { createLogger, getMetrics, recordSecurityEvent } from "@workspace/observability";
import { descendantOrganizationIds, AuthorizationError } from "../org/organization.js";
import type {
  AggregateMetric,
  AggregateRequest,
  AggregateResult,
  ConfidenceBand,
  TrendDirection,
} from "./contracts.js";
import { DEFAULT_MIN_AGGREGATION_SIZE, DEFAULT_MIN_SAMPLES_HIGH, DEFAULT_MIN_SAMPLES_MEDIUM } from "./contracts.js";

const log = createLogger({ name: "@workspace/db/aggregation" });

/** 20-AK: aggregate access audited with scope metadata only (no data values). */
async function auditAggregate(tenantId: string, userId: string, groupCount: number, from: string, to: string): Promise<void> {
  await db.insert(auditLogsTable).values({
    id: crypto.randomUUID(),
    tenantId,
    actorId: userId,
    action: "aggregate.accessed",
    entity: "evidence_aggregate",
    entityId: "institutional",
    metadata: JSON.stringify({ groupCount, windowDays: Math.round((Date.parse(to) - Date.parse(from)) / 86400000) }),
  });
}

/** Requester coverage derived from ACTIVE staff memberships (composable, 20-G). */
interface Coverage {
  mode: "ALL" | "SET";
  ids: string[]; // covered school ids
  orgRoots: string[]; // organization subtree roots (ORGANIZATION-scoped memberships)
  classScope: string[]; // CLASS-scoped classIds
  gradeScope: { schoolId: string; gradeLevel: string }[]; // GRADE-scoped pairs
  narrowOnly: boolean; // no TENANT/ORGANIZATION/SCHOOL membership
}

async function coveredSchoolIds(tenantId: string, userId: string): Promise<Coverage> {
  const memberships = await db
    .select()
    .from(staffMembershipsTable)
    .where(and(
      eq(staffMembershipsTable.tenantId, tenantId),
      eq(staffMembershipsTable.userId, userId),
      eq(staffMembershipsTable.status, "active"),
      isNull(staffMembershipsTable.activeTo),
    ));
  if (memberships.length === 0) {
    recordSecurityEvent(log, getMetrics(), "authorization-failure", { tenantId, detail: { reason: "NO_ACTIVE_MEMBERSHIP" } });
    throw new AuthorizationError("AGGREGATE_NO_ACTIVE_MEMBERSHIP");
  }
  if (memberships.some((m) => m.scopeType === "TENANT")) {
    return { mode: "ALL", ids: [], orgRoots: [], classScope: [], gradeScope: [], narrowOnly: false };
  }
  const ids = new Set<string>();
  const orgRoots: string[] = [];
  const classScope: string[] = [];
  const gradeScope: { schoolId: string; gradeLevel: string }[] = [];
  let broad = false;
  for (const m of memberships) {
    if (m.scopeType === "ORGANIZATION" && m.organizationId) {
      broad = true;
      orgRoots.push(m.organizationId);
      const subtree = await descendantOrganizationIds(tenantId, m.organizationId);
      const nodes = [m.organizationId, ...subtree];
      const rows = await db
        .select({ id: schoolsTable.id })
        .from(schoolsTable)
        .where(and(eq(schoolsTable.tenantId, tenantId), inArray(schoolsTable.organizationId, nodes)));
      for (const r of rows) ids.add(r.id);
    } else if (m.scopeType === "SCHOOL") {
      broad = true;
      if (m.scopeId) ids.add(m.scopeId);
      else if (m.schoolId) ids.add(m.schoolId);
    } else if (m.scopeType === "CLASS" && m.scopeId) {
      classScope.push(m.scopeId);
      if (m.schoolId) ids.add(m.schoolId);
    } else if (m.scopeType === "GRADE" && m.schoolId && m.scopeId) {
      gradeScope.push({ schoolId: m.schoolId, gradeLevel: m.scopeId });
      ids.add(m.schoolId);
    }
  }
  return { mode: "SET", ids: [...ids], orgRoots, classScope, gradeScope, narrowOnly: !broad };
}

function confidenceBand(assessed: number, minHigh: number, minMedium: number): ConfidenceBand {
  if (assessed >= minHigh) return "high";
  if (assessed >= minMedium) return "medium";
  return "low";
}

function trendDirection(current: number | null, previous: number | null): TrendDirection {
  if (current === null || previous === null) return "FLAT";
  const delta = current - previous;
  if (delta > 0.005) return "UP";
  if (delta < -0.005) return "DOWN";
  return "FLAT";
}

/** Previous equal-length window (20-AD). */
function previousWindow(req: AggregateRequest): { from: string; to: string } {
  const from = Date.parse(req.timePeriod.from);
  const to = Date.parse(req.timePeriod.to);
  const len = to - from;
  return { from: new Date(from - len).toISOString(), to: new Date(from).toISOString() };
}

/**
 * The canonical institutional aggregation (20-C/20-E/20-F/20-I/20-J/20-K).
 * Returns per-group metrics with sampleSize/assessedStudents/coverage/
 * confidence/trend — suppressing any group below the privacy threshold.
 * Requests outside the requester's coverage → DENY (20-A/20-Z).
 */
export async function aggregateEvidence(req: AggregateRequest): Promise<AggregateResult> {
  if (!req?.tenantId || !req?.userId) throw new Error("AGGREGATE_CONTEXT_REQUIRED");
  if (!req.timePeriod?.from || !req.timePeriod?.to) throw new Error("AGGREGATE_TIME_PERIOD_REQUIRED");
  const minAgg = req.minimumAggregationSize ?? DEFAULT_MIN_AGGREGATION_SIZE;
  const minHigh = req.minSamplesHigh ?? DEFAULT_MIN_SAMPLES_HIGH;
  const minMedium = req.minSamplesMedium ?? DEFAULT_MIN_SAMPLES_MEDIUM;

  const coverage = await coveredSchoolIds(req.tenantId, req.userId);

  // Explicit request scope must be INSIDE the requester's coverage (20-A).
  if (req.schoolId && !(coverage.mode === "ALL" || coverage.ids.includes(req.schoolId))) {
    recordSecurityEvent(log, getMetrics(), "cross-tenant-attempt", { tenantId: req.tenantId, detail: { reason: "AGGREGATE_SCOPE_NOT_COVERED", requestedSchoolId: req.schoolId } });
    throw new AuthorizationError("AGGREGATE_SCOPE_NOT_COVERED");
  }
  if (req.classId && coverage.narrowOnly && !coverage.classScope.includes(req.classId)) {
    recordSecurityEvent(log, getMetrics(), "cross-tenant-attempt", { tenantId: req.tenantId, detail: { reason: "AGGREGATE_SCOPE_NOT_COVERED", requestedClassId: req.classId } });
    throw new AuthorizationError("AGGREGATE_SCOPE_NOT_COVERED");
  }
  // 20-I drill-down: the requested organization must be inside the requester's subtree.
  let orgSchoolFilter: string[] | null = null;
  if (req.organizationId) {
    if (coverage.mode !== "ALL") {
      const within = await (async () => {
        for (const root of coverage.orgRoots) {
          if (root === req.organizationId) return true;
          const sub = await descendantOrganizationIds(req.tenantId, root);
          if (sub.includes(req.organizationId as string)) return true;
        }
        return false;
      })();
      if (!within) {
        recordSecurityEvent(log, getMetrics(), "cross-tenant-attempt", { tenantId: req.tenantId, detail: { reason: "AGGREGATE_ORG_NOT_COVERED", requestedOrganizationId: req.organizationId } });
        throw new AuthorizationError("AGGREGATE_SCOPE_NOT_COVERED");
      }
    }
    const subtree = await descendantOrganizationIds(req.tenantId, req.organizationId);
    const nodes = [req.organizationId, ...subtree];
    orgSchoolFilter = (await db
      .select({ id: schoolsTable.id })
      .from(schoolsTable)
      .where(and(eq(schoolsTable.tenantId, req.tenantId), inArray(schoolsTable.organizationId, nodes)))).map((r) => r.id);
    if (coverage.mode === "SET") orgSchoolFilter = orgSchoolFilter.filter((id) => coverage.ids.includes(id));
    if (orgSchoolFilter.length === 0) return { scope: req, groups: [] };
  }

  // Final school set (scoped — never global, 20-Y).
  let schoolIds: string[] | null; // null = ALL tenant schools (TENANT scope)
  if (orgSchoolFilter !== null) schoolIds = orgSchoolFilter;
  else if (req.schoolId) schoolIds = [req.schoolId];
  else if (coverage.mode === "SET") schoolIds = coverage.ids;
  else schoolIds = null;
  if (schoolIds !== null && schoolIds.length === 0) return { scope: req, groups: [] };

  const buildConditions = (win: { from: string; to: string }) => {
    const c = [
      eq(evidenceTable.tenantId, req.tenantId),
      gte(evidenceTable.occurredAt, new Date(win.from)),
      lt(evidenceTable.occurredAt, new Date(win.to)),
    ];
    if (req.evidenceType) c.push(eq(evidenceTable.evidenceType, req.evidenceType as EvidenceType));
    if (req.subject) c.push(eq(evidenceTable.subject, req.subject));
    if (req.dimensionKey) c.push(sql`(${evidenceTable.metadata} ->> 'dimension') = ${req.dimensionKey}`);
    if (req.stageKey) c.push(eq(classesTable.stageKey, req.stageKey));
    if (req.gradeLevel && !(coverage.narrowOnly && coverage.gradeScope.length === 0 && coverage.classScope.length === 0)) c.push(eq(classesTable.gradeLevel, req.gradeLevel));
    if (req.classId) c.push(eq(studentsTable.classId, req.classId));
    if (schoolIds !== null) c.push(inArray(classesTable.schoolId, schoolIds));
    // 20-M: narrow-only requesters are FORCE-narrowed (omitting filters never widens).
    if (coverage.narrowOnly) {
      if (coverage.classScope.length > 0) {
        c.push(inArray(studentsTable.classId, coverage.classScope));
      } else if (coverage.gradeScope.length > 0) {
        const pairs = coverage.gradeScope.map((g) => and(eq(classesTable.schoolId, g.schoolId), eq(classesTable.gradeLevel, g.gradeLevel)));
        const pairCond = pairs.length === 1 ? pairs[0] : or(...pairs);
        if (pairCond) c.push(pairCond);
      }
    }
    return c;
  };

  const runWindow = async (win: { from: string; to: string }) => {
    const rows = await db
      .select({
        schoolId: classesTable.schoolId,
        stageKey: classesTable.stageKey,
        gradeLevel: classesTable.gradeLevel,
        subject: evidenceTable.subject,
        evidenceType: evidenceTable.evidenceType,
        sampleSize: sql<number>`count(*)::int`,
        assessedStudents: sql<number>`count(distinct ${evidenceTable.studentId})::int`,
        meanConfidence: sql<number | null>`avg(${evidenceTable.confidence})`,
      })
      .from(evidenceTable)
      .innerJoin(studentsTable, eq(studentsTable.id, evidenceTable.studentId))
      .innerJoin(classesTable, eq(classesTable.id, studentsTable.classId))
      .where(and(...buildConditions(win)))
      .groupBy(classesTable.schoolId, classesTable.stageKey, classesTable.gradeLevel, evidenceTable.subject, evidenceTable.evidenceType);
    return rows.map((r) => ({
      key: `${r.schoolId}|${r.stageKey}|${r.gradeLevel}|${r.subject}|${r.evidenceType}`,
      groupKey: `${r.schoolId}|${r.stageKey}|${r.gradeLevel}`,
      schoolId: r.schoolId,
      stageKey: r.stageKey ?? null,
      gradeLevel: r.gradeLevel ?? null,
      subject: r.subject ?? null,
      evidenceType: r.evidenceType,
      sampleSize: Number(r.sampleSize),
      assessedStudents: Number(r.assessedStudents),
      mean: r.meanConfidence === null ? null : Number(r.meanConfidence),
    }));
  };

  const [currentRows, prevRows] = [await runWindow(req.timePeriod), await runWindow(previousWindow(req))];
  const prevMap = new Map(prevRows.map((r) => [r.key, r]));

  // Students-in-scope per group (for assessmentCoverage), same scope filters.
  const scopeCounts = new Map<string, number>();
  if (currentRows.length > 0) {
    const sc = [
      eq(studentsTable.tenantId, req.tenantId),
      eq(studentsTable.isActive, true),
    ];
    if (req.stageKey) sc.push(eq(classesTable.stageKey, req.stageKey));
    if (req.gradeLevel) sc.push(eq(classesTable.gradeLevel, req.gradeLevel));
    if (req.classId) sc.push(eq(studentsTable.classId, req.classId));
    if (schoolIds !== null) sc.push(inArray(classesTable.schoolId, schoolIds));
    if (coverage.narrowOnly) {
      if (coverage.classScope.length > 0) sc.push(inArray(studentsTable.classId, coverage.classScope));
    }
    const scopeRows = await db
      .select({
        schoolId: classesTable.schoolId,
        stageKey: classesTable.stageKey,
        gradeLevel: classesTable.gradeLevel,
        students: sql<number>`count(distinct ${studentsTable.id})::int`,
      })
      .from(studentsTable)
      .innerJoin(classesTable, eq(classesTable.id, studentsTable.classId))
      .where(and(...sc))
      .groupBy(classesTable.schoolId, classesTable.stageKey, classesTable.gradeLevel);
    for (const r of scopeRows) scopeCounts.set(`${r.schoolId}|${r.stageKey}|${r.gradeLevel}`, Number(r.students));
  }

  const groups: AggregateMetric[] = currentRows.map((r) => {
    const prev = prevMap.get(r.key);
    const prevSuppressed = prev ? prev.assessedStudents < minAgg : false;
    const enough = r.assessedStudents >= minAgg;
    const current = enough ? r.mean : null;
    const previous = prev && !prevSuppressed ? prev.mean : null;
    return {
      schoolId: r.schoolId,
      stageKey: r.stageKey,
      gradeLevel: r.gradeLevel,
      subject: r.subject,
      evidenceType: r.evidenceType,
      mean: current,
      sampleSize: r.sampleSize,
      assessedStudents: r.assessedStudents,
      studentsInScope: scopeCounts.get(r.groupKey) ?? 0,
      assessmentCoverage: (scopeCounts.get(r.groupKey) ?? 0) > 0 ? r.assessedStudents / (scopeCounts.get(r.groupKey) ?? 1) : 0,
      confidence: confidenceBand(r.assessedStudents, minHigh, minMedium),
      status: enough ? "OK" : "INSUFFICIENT_EVIDENCE",
      trend: enough && !prevSuppressed && (current !== null || previous !== null)
        ? { current, previous, direction: trendDirection(current, previous) }
        : null, // suppressed groups expose no mean and no trend either
      timePeriod: { from: req.timePeriod.from, to: req.timePeriod.to },
    };
  });

  await auditAggregate(req.tenantId, req.actorId ?? req.userId, groups.length, req.timePeriod.from, req.timePeriod.to);
  return { scope: req, groups };
}

/**
 * 20-B/20-L: individual student detail gate — SCHOOL-scope-only by default.
 * Organization-level oversight (ministry/governorate/directorate) is DENIED
 * here by design: oversight consumes aggregates, never individual profiles.
 * Same-tenant membership + Role+Scope (RBAC+Scope) still apply.
 */
export async function assertStudentDetailAccess(tenantId: string, userId: string, studentId: string, actorId?: string): Promise<void> {
  const [student] = await db
    .select({ id: studentsTable.id, classId: studentsTable.classId, tenantId: studentsTable.tenantId })
    .from(studentsTable)
    .where(and(eq(studentsTable.id, studentId), eq(studentsTable.tenantId, tenantId)))
    .limit(1);
  if (!student) throw new AuthorizationError("STUDENT_NOT_FOUND_IN_TENANT");
  const [cls] = await db
    .select({ id: classesTable.id, schoolId: classesTable.schoolId, gradeLevel: classesTable.gradeLevel })
    .from(classesTable)
    .where(and(eq(classesTable.id, student.classId), eq(classesTable.tenantId, tenantId)))
    .limit(1);
  if (!cls) throw new AuthorizationError("STUDENT_CLASS_NOT_FOUND");
  const memberships = await db
    .select()
    .from(staffMembershipsTable)
    .where(and(
      eq(staffMembershipsTable.tenantId, tenantId),
      eq(staffMembershipsTable.userId, userId),
      eq(staffMembershipsTable.status, "active"),
      isNull(staffMembershipsTable.activeTo),
    ));
  const individualScopes = ["TENANT", "SCHOOL", "GRADE", "CLASS"]; // config-driven default (20-B)
  const covered = memberships.some((m) => {
    if (!individualScopes.includes(m.scopeType)) return false;
    if (m.scopeType === "TENANT") return true;
    if (m.scopeType === "SCHOOL") return m.scopeId === cls.schoolId || m.schoolId === cls.schoolId;
    if (m.scopeType === "GRADE") return m.schoolId === cls.schoolId && m.scopeId === cls.gradeLevel; // school-anchored grade scope (20-M)
    if (m.scopeType === "CLASS") return m.scopeId === cls.id;
    return false;
  });
  if (!covered) {
    recordSecurityEvent(log, getMetrics(), "cross-tenant-attempt", { tenantId, detail: { reason: "INDIVIDUAL_ACCESS_NOT_SCHOOL_SCOPED", studentId } });
    throw new AuthorizationError("STUDENT_DETAIL_ACCESS_DENIED");
  }
  await db.insert(auditLogsTable).values({
    id: crypto.randomUUID(), tenantId, actorId: actorId ?? userId,
    action: "student_detail.accessed", entity: "student", entityId: studentId, metadata: null,
  });
}
