/**
 * CORE-24 / Wave 1 (ACR-24/001, ADR-004) — Persistent Content & Exercise
 * Library capability (owner: core-platform).
 *
 * implements ACR-24/001 §2.4 semantics over schema/content-library.ts:
 *   - lifecycle  DRAFT → PUBLISHED → SUPERSEDED (published rows immutable;
 *     changes create a NEW version row — history is never rewritten)
 *   - idempotency via the EXISTING (tenant_id, operation_key) pattern
 *     (onConflictDoNothing + re-select — same shape as the canonical
 *     Evidence Writer); no new idempotency system
 *   - audit via the EXISTING audit_logs — reason codes only, no content
 *     bodies, no PII
 *   - tenant isolation enforced by DB constraints (composite tenant FKs);
 *     this layer adds validation, never replaces it
 *
 * SEPARATION INVARIANT (ADR-004): these rows are DEFINITIONS ONLY — no
 * Evidence, no attempt results, no student data. Exercise binds to at most
 * ONE measuring engine (CORE-22 ENGINE_BINDINGS) and NEVER owns
 * measurement/evidence. Media is a body_ref POINTER only (reading-engine
 * owns audio per ADR-004).
 *
 * Deterministic, no AI, no UI, no new stores (22 exclusions carried).
 */
import { and, asc, count, eq, ilike } from "drizzle-orm";
import { db } from "../client.js";
import {
  contentDefinitionsTable,
  exerciseDefinitionsTable,
  type ContentDefinitionRow,
  type ExerciseDefinitionRow,
} from "../schema/content-library.js";
import { auditLogsTable } from "../schema/system.js";
import {
  CONTENT_SOURCES,
  ENGINE_BINDINGS,
  type ContentDefinition,
  type ExerciseDefinition,
} from "./contracts.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** CLOSED response-type vocabulary (CORE-22 ExpectedResponseConfig.type). */
const RESPONSE_TYPES = ["TYPED", "VOICE", "HANDWRITTEN", "SELECTION", "STEPS"] as const;

export class ContentLibraryError extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = "ContentLibraryError";
  }
}

function assertUuid(value: string, what: string): void {
  if (!value || !UUID_RE.test(value)) throw new ContentLibraryError(`INVALID_${what.toUpperCase()}_ID`);
}

async function audit(action: string, tenantId: string, actorId: string | undefined, entity: string, entityId: string, metadata?: Record<string, unknown>): Promise<void> {
  await db.insert(auditLogsTable).values({
    id: crypto.randomUUID(),
    tenantId,
    actorId,
    action,
    entity,
    entityId,
    metadata: metadata ? JSON.stringify(metadata) : undefined,
  });
}

// ===== shared anchor input (structurally = CORE-22 ContentCurriculumAnchor) =====

export interface LibraryCurriculumAnchor {
  readonly curriculumId: string;
  readonly curriculumVersion: string; // MANDATORY (21-O) — never free text
  readonly country?: string;
  readonly educationSystem?: string;
  readonly stageKey: string;
  readonly gradeKey?: string;
  readonly gradeLevel: string;
  readonly subject: string;
  readonly bookId?: string;
  readonly unitId?: string;
  readonly lessonId?: string;
  readonly objectiveId?: string;
  readonly skill?: string;
  readonly dimension?: string;
}

export interface CreateContentInput {
  readonly tenantId: string;
  readonly title: string;
  readonly kind: string;                 // open registry (21-D pattern)
  readonly source: (typeof CONTENT_SOURCES)[number];
  readonly bodyRef?: string;             // Object Storage REFERENCE only
  readonly language?: string;
  readonly curriculum: LibraryCurriculumAnchor;
  readonly createdBy: string;            // users.id, same tenant (composite FK)
  readonly operationKey: string;         // idempotency (existing pattern)
  readonly metadata?: Record<string, unknown>;
}

export interface CreateExerciseInput {
  readonly tenantId: string;
  readonly activityType: string;         // CORE-21 open vocabulary
  readonly engineBinding: (typeof ENGINE_BINDINGS)[number]; // closed — ONE engine
  readonly expectedResponseType: (typeof RESPONSE_TYPES)[number];
  readonly expectedResponseConfig?: Record<string, unknown>;
  readonly contentId?: string;           // OPTIONAL same-tenant library link
  readonly assessmentRef?: string;       // REFERENCE to the assessment-engine definition (21-E)
  readonly maxAttempts?: number;
  readonly timeLimitMs?: number;
  readonly source: (typeof CONTENT_SOURCES)[number];
  readonly curriculum: LibraryCurriculumAnchor;
  readonly createdBy: string;
  readonly operationKey: string;
  readonly metadata?: Record<string, unknown>;
}

function anchorColumns(c: LibraryCurriculumAnchor) {
  if (!c.curriculumVersion) throw new ContentLibraryError("CURRICULUM_VERSION_REQUIRED"); // 21-O
  if (!c.curriculumId || !c.stageKey || !c.gradeLevel || !c.subject) throw new ContentLibraryError("CURRICULUM_ANCHOR_REQUIRED");
  return {
    curriculumId: c.curriculumId,
    curriculumVersion: c.curriculumVersion,
    country: c.country ?? null,
    educationSystem: c.educationSystem ?? null,
    stageKey: c.stageKey,
    gradeKey: c.gradeKey ?? null,
    gradeLevel: c.gradeLevel,
    subject: c.subject,
    bookId: c.bookId ?? null,
    unitId: c.unitId ?? null,
    lessonId: c.lessonId ?? null,
    objectiveId: c.objectiveId ?? null,
    skill: c.skill ?? null,
    dimension: c.dimension ?? null,
  };
}

// ===== CREATE (idempotent) =====

export async function createContentDefinition(input: CreateContentInput): Promise<{ content: ContentDefinitionRow; created: boolean }> {
  assertUuid(input.tenantId, "tenant");
  assertUuid(input.createdBy, "created_by");
  if (!input.title?.trim()) throw new ContentLibraryError("CONTENT_TITLE_REQUIRED");
  if (!input.kind?.trim()) throw new ContentLibraryError("CONTENT_KIND_REQUIRED");
  if (!CONTENT_SOURCES.includes(input.source)) throw new ContentLibraryError("CONTENT_SOURCE_INVALID");
  if (!input.operationKey?.trim()) throw new ContentLibraryError("OPERATION_KEY_REQUIRED");
  const anchor = anchorColumns(input.curriculum);
  const rootId = crypto.randomUUID();
  const [row] = await db
    .insert(contentDefinitionsTable)
    .values({
      id: rootId,
      tenantId: input.tenantId,
      rootContentId: rootId,
      parentVersionId: null,
      version: 1,
      status: "DRAFT",
      kind: input.kind,
      source: input.source,
      title: input.title,
      bodyRef: input.bodyRef ?? null,
      language: input.language ?? "ar",
      ...anchor,
      createdBy: input.createdBy,
      operationKey: input.operationKey,
      metadata: input.metadata ?? null,
    })
    .onConflictDoNothing({ target: [contentDefinitionsTable.tenantId, contentDefinitionsTable.operationKey] })
    .returning();
  if (row) {
    await audit("content.created", input.tenantId, input.createdBy, "content_definition", row.id, { kind: input.kind, source: input.source });
    return { content: row, created: true };
  }
  // Duplicate operation key (retry) → return the EXISTING row — never a second copy.
  const [existing] = await db
    .select()
    .from(contentDefinitionsTable)
    .where(and(eq(contentDefinitionsTable.tenantId, input.tenantId), eq(contentDefinitionsTable.operationKey, input.operationKey)))
    .limit(1);
  if (!existing) throw new ContentLibraryError("CONTENT_IDEMPOTENCY_UNRESOLVED");
  return { content: existing, created: false };
}

export async function createExerciseDefinition(input: CreateExerciseInput): Promise<{ exercise: ExerciseDefinitionRow; created: boolean }> {
  assertUuid(input.tenantId, "tenant");
  assertUuid(input.createdBy, "created_by");
  if (!input.activityType?.trim()) throw new ContentLibraryError("EXERCISE_ACTIVITY_TYPE_REQUIRED");
  if (!ENGINE_BINDINGS.includes(input.engineBinding)) throw new ContentLibraryError("ENGINE_BINDING_INVALID"); // ONE engine, closed
  if (!RESPONSE_TYPES.includes(input.expectedResponseType)) throw new ContentLibraryError("EXPECTED_RESPONSE_TYPE_INVALID");
  if (!CONTENT_SOURCES.includes(input.source)) throw new ContentLibraryError("EXERCISE_SOURCE_INVALID");
  if (!input.operationKey?.trim()) throw new ContentLibraryError("OPERATION_KEY_REQUIRED");
  if (input.maxAttempts !== undefined && input.maxAttempts < 1) throw new ContentLibraryError("MAX_ATTEMPTS_INVALID");
  if (input.timeLimitMs !== undefined && input.timeLimitMs < 1) throw new ContentLibraryError("TIME_LIMIT_INVALID");
  const anchor = anchorColumns(input.curriculum);
  const rootId = crypto.randomUUID();
  const [row] = await db
    .insert(exerciseDefinitionsTable)
    .values({
      id: rootId,
      tenantId: input.tenantId,
      rootExerciseId: rootId,
      parentVersionId: null,
      version: 1,
      status: "DRAFT",
      contentId: input.contentId ?? null,
      activityType: input.activityType,
      engineBinding: input.engineBinding,
      expectedResponseType: input.expectedResponseType,
      expectedResponseConfig: input.expectedResponseConfig ?? null,
      assessmentRef: input.assessmentRef ?? null,
      maxAttempts: input.maxAttempts ?? null,
      timeLimitMs: input.timeLimitMs ?? null,
      source: input.source,
      ...anchor,
      createdBy: input.createdBy,
      operationKey: input.operationKey,
      metadata: input.metadata ?? null,
    })
    .onConflictDoNothing({ target: [exerciseDefinitionsTable.tenantId, exerciseDefinitionsTable.operationKey] })
    .returning();
  if (row) {
    await audit("exercise.created", input.tenantId, input.createdBy, "exercise_definition", row.id, { engineBinding: input.engineBinding, activityType: input.activityType });
    return { exercise: row, created: true };
  }
  const [existing] = await db
    .select()
    .from(exerciseDefinitionsTable)
    .where(and(eq(exerciseDefinitionsTable.tenantId, input.tenantId), eq(exerciseDefinitionsTable.operationKey, input.operationKey)))
    .limit(1);
  if (!existing) throw new ContentLibraryError("EXERCISE_IDEMPOTENCY_UNRESOLVED");
  return { exercise: existing, created: false };
}

// ===== LIFECYCLE: publish (CAS — idempotent) =====

export async function publishContent(tenantId: string, contentId: string, actorId: string): Promise<ContentDefinitionRow> {
  assertUuid(tenantId, "tenant");
  assertUuid(contentId, "content");
  const [published] = await db
    .update(contentDefinitionsTable)
    .set({ status: "PUBLISHED", updatedAt: new Date() })
    .where(and(
      eq(contentDefinitionsTable.id, contentId),
      eq(contentDefinitionsTable.tenantId, tenantId),
      eq(contentDefinitionsTable.status, "DRAFT"), // CAS: DRAFT → PUBLISHED only
    ))
    .returning();
  if (published) {
    await audit("content.published", tenantId, actorId, "content_definition", contentId, {});
    return published;
  }
  const [current] = await db.select().from(contentDefinitionsTable)
    .where(and(eq(contentDefinitionsTable.id, contentId), eq(contentDefinitionsTable.tenantId, tenantId))).limit(1);
  if (!current) throw new ContentLibraryError("CONTENT_NOT_FOUND_IN_TENANT");
  if (current.status === "PUBLISHED") return current; // idempotent re-publish
  throw new ContentLibraryError("CONTENT_SUPERSEDED_IMMUTABLE"); // SUPERSEDED rows are immutable history
}

export async function publishExercise(tenantId: string, exerciseId: string, actorId: string): Promise<ExerciseDefinitionRow> {
  assertUuid(tenantId, "tenant");
  assertUuid(exerciseId, "exercise");
  const [published] = await db
    .update(exerciseDefinitionsTable)
    .set({ status: "PUBLISHED", updatedAt: new Date() })
    .where(and(
      eq(exerciseDefinitionsTable.id, exerciseId),
      eq(exerciseDefinitionsTable.tenantId, tenantId),
      eq(exerciseDefinitionsTable.status, "DRAFT"),
    ))
    .returning();
  if (published) {
    await audit("exercise.published", tenantId, actorId, "exercise_definition", exerciseId, {});
    return published;
  }
  const [current] = await db.select().from(exerciseDefinitionsTable)
    .where(and(eq(exerciseDefinitionsTable.id, exerciseId), eq(exerciseDefinitionsTable.tenantId, tenantId))).limit(1);
  if (!current) throw new ContentLibraryError("EXERCISE_NOT_FOUND_IN_TENANT");
  if (current.status === "PUBLISHED") return current;
  throw new ContentLibraryError("EXERCISE_SUPERSEDED_IMMUTABLE");
}

// ===== LIFECYCLE: supersede (new version row — history preserved) =====

export interface SupersedeContentInput {
  readonly tenantId: string;
  readonly contentId: string;            // the row being superseded (PUBLISHED)
  readonly actorId: string;
  readonly operationKey: string;
  readonly title?: string;
  readonly bodyRef?: string;
  readonly kind?: string;
  readonly metadata?: Record<string, unknown>;
}

export async function supersedeContent(input: SupersedeContentInput): Promise<ContentDefinitionRow> {
  assertUuid(input.tenantId, "tenant");
  assertUuid(input.contentId, "content");
  if (!input.operationKey?.trim()) throw new ContentLibraryError("OPERATION_KEY_REQUIRED");
  const [prev] = await db.select().from(contentDefinitionsTable)
    .where(and(eq(contentDefinitionsTable.id, input.contentId), eq(contentDefinitionsTable.tenantId, input.tenantId))).limit(1);
  if (!prev) throw new ContentLibraryError("CONTENT_NOT_FOUND_IN_TENANT");
  if (prev.status === "DRAFT") throw new ContentLibraryError("SUPERSEDE_REQUIRES_PUBLISHED"); // edit/supersede flow: only PUBLISHED rows are superseded
  if (prev.status === "SUPERSEDED") {
    // Recovery/idempotency (Wave-1 directive §7: failure → retry must never duplicate):
    // the lineage already continues — converge on the EXISTING successor. The
    // superseded row itself stays immutable history (never rewritten).
    const [existing] = await db.select().from(contentDefinitionsTable)
      .where(and(eq(contentDefinitionsTable.tenantId, input.tenantId), eq(contentDefinitionsTable.parentVersionId, prev.id))).limit(1);
    if (existing) return existing;
    throw new ContentLibraryError("CONTENT_SUPERSEDED_IMMUTABLE");
  }
  // Atomic supersede (transaction): the idempotent successor insert + the CAS
  // predecessor mark commit or roll back TOGETHER — no orphan DRAFT successor
  // is ever left behind, history is never rewritten.
  const { row: successor, created } = await db.transaction(async (tx) => {
  const [existingSuccessor] = await tx.select().from(contentDefinitionsTable)
    .where(and(eq(contentDefinitionsTable.tenantId, input.tenantId), eq(contentDefinitionsTable.operationKey, input.operationKey))).limit(1);
  if (existingSuccessor) return { row: existingSuccessor, created: false };
  const [successor] = await tx.insert(contentDefinitionsTable).values({
    id: crypto.randomUUID(),
    tenantId: prev.tenantId,
    rootContentId: prev.rootContentId,
    parentVersionId: prev.id,
    version: prev.version + 1,
    status: "DRAFT",
    kind: input.kind ?? prev.kind,
    source: prev.source,
    title: input.title ?? prev.title,
    bodyRef: input.bodyRef ?? prev.bodyRef,
    language: prev.language,
    curriculumId: prev.curriculumId,
    curriculumVersion: prev.curriculumVersion,
    country: prev.country,
    educationSystem: prev.educationSystem,
    stageKey: prev.stageKey,
    gradeKey: prev.gradeKey,
    gradeLevel: prev.gradeLevel,
    subject: prev.subject,
    bookId: prev.bookId,
    unitId: prev.unitId,
    lessonId: prev.lessonId,
    objectiveId: prev.objectiveId,
    skill: prev.skill,
    dimension: prev.dimension,
    createdBy: input.actorId,
    operationKey: input.operationKey,
    metadata: input.metadata ?? prev.metadata,
  }).onConflictDoNothing({ target: [contentDefinitionsTable.tenantId, contentDefinitionsTable.operationKey] })
    .returning();
  if (!successor) {
    // concurrent same-operation-key supersede won the insert → return its row
    const [winner] = await tx.select().from(contentDefinitionsTable)
      .where(and(eq(contentDefinitionsTable.tenantId, input.tenantId), eq(contentDefinitionsTable.operationKey, input.operationKey))).limit(1);
    if (winner) return { row: winner, created: false };
    throw new ContentLibraryError("CONTENT_IDEMPOTENCY_UNRESOLVED");
  }
  const [marked] = await tx
    .update(contentDefinitionsTable)
    .set({ status: "SUPERSEDED", updatedAt: new Date() })
    .where(and(eq(contentDefinitionsTable.id, prev.id), eq(contentDefinitionsTable.tenantId, prev.tenantId), eq(contentDefinitionsTable.status, "PUBLISHED")))
    .returning();
  if (!marked) throw new ContentLibraryError("SUPERSEDE_RACE_LOST"); // concurrent different-key supersede won → rollback (no orphan successor)
  return { row: successor, created: true };
  });
  if (created) await audit("content.superseded", input.tenantId, input.actorId, "content_definition", successor.id, { parentVersionId: prev.id, version: successor.version });
  return successor;
}

export interface SupersedeExerciseInput {
  readonly tenantId: string;
  readonly exerciseId: string;
  readonly actorId: string;
  readonly operationKey: string;
  readonly activityType?: string;
  readonly expectedResponseType?: (typeof RESPONSE_TYPES)[number];
  readonly expectedResponseConfig?: Record<string, unknown>;
  readonly assessmentRef?: string;
  readonly metadata?: Record<string, unknown>;
}

export async function supersedeExercise(input: SupersedeExerciseInput): Promise<ExerciseDefinitionRow> {
  assertUuid(input.tenantId, "tenant");
  assertUuid(input.exerciseId, "exercise");
  if (!input.operationKey?.trim()) throw new ContentLibraryError("OPERATION_KEY_REQUIRED");
  const [prev] = await db.select().from(exerciseDefinitionsTable)
    .where(and(eq(exerciseDefinitionsTable.id, input.exerciseId), eq(exerciseDefinitionsTable.tenantId, input.tenantId))).limit(1);
  if (!prev) throw new ContentLibraryError("EXERCISE_NOT_FOUND_IN_TENANT");
  if (prev.status === "DRAFT") throw new ContentLibraryError("SUPERSEDE_REQUIRES_PUBLISHED");
  if (prev.status === "SUPERSEDED") {
    // Recovery/idempotency — same semantics as supersedeContent (converge on the existing successor).
    const [existing] = await db.select().from(exerciseDefinitionsTable)
      .where(and(eq(exerciseDefinitionsTable.tenantId, input.tenantId), eq(exerciseDefinitionsTable.parentVersionId, prev.id))).limit(1);
    if (existing) return existing;
    throw new ContentLibraryError("EXERCISE_SUPERSEDED_IMMUTABLE");
  }
  // Atomic supersede (transaction) — same semantics as supersedeContent.
  const { row: successor, created } = await db.transaction(async (tx) => {
  const [existingSuccessor] = await tx.select().from(exerciseDefinitionsTable)
    .where(and(eq(exerciseDefinitionsTable.tenantId, input.tenantId), eq(exerciseDefinitionsTable.operationKey, input.operationKey))).limit(1);
  if (existingSuccessor) return { row: existingSuccessor, created: false };
  const responseType = input.expectedResponseType ?? (prev.expectedResponseType as (typeof RESPONSE_TYPES)[number]);
  if (!RESPONSE_TYPES.includes(responseType)) throw new ContentLibraryError("EXPECTED_RESPONSE_TYPE_INVALID");
  const [successor] = await tx.insert(exerciseDefinitionsTable).values({
    id: crypto.randomUUID(),
    tenantId: prev.tenantId,
    rootExerciseId: prev.rootExerciseId,
    parentVersionId: prev.id,
    version: prev.version + 1,
    status: "DRAFT",
    contentId: prev.contentId,
    activityType: input.activityType ?? prev.activityType,
    engineBinding: prev.engineBinding, // engine binding is immutable across versions (ONE engine per exercise lineage)
    expectedResponseType: responseType,
    expectedResponseConfig: input.expectedResponseConfig ?? prev.expectedResponseConfig,
    assessmentRef: input.assessmentRef ?? prev.assessmentRef,
    maxAttempts: prev.maxAttempts,
    timeLimitMs: prev.timeLimitMs,
    source: prev.source,
    curriculumId: prev.curriculumId,
    curriculumVersion: prev.curriculumVersion,
    country: prev.country,
    educationSystem: prev.educationSystem,
    stageKey: prev.stageKey,
    gradeKey: prev.gradeKey,
    gradeLevel: prev.gradeLevel,
    subject: prev.subject,
    bookId: prev.bookId,
    unitId: prev.unitId,
    lessonId: prev.lessonId,
    objectiveId: prev.objectiveId,
    skill: prev.skill,
    dimension: prev.dimension,
    createdBy: input.actorId,
    operationKey: input.operationKey,
    metadata: input.metadata ?? prev.metadata,
  }).onConflictDoNothing({ target: [exerciseDefinitionsTable.tenantId, exerciseDefinitionsTable.operationKey] })
    .returning();
  if (!successor) {
    const [winner] = await tx.select().from(exerciseDefinitionsTable)
      .where(and(eq(exerciseDefinitionsTable.tenantId, input.tenantId), eq(exerciseDefinitionsTable.operationKey, input.operationKey))).limit(1);
    if (winner) return { row: winner, created: false };
    throw new ContentLibraryError("EXERCISE_IDEMPOTENCY_UNRESOLVED");
  }
  const [marked] = await tx
    .update(exerciseDefinitionsTable)
    .set({ status: "SUPERSEDED", updatedAt: new Date() })
    .where(and(eq(exerciseDefinitionsTable.id, prev.id), eq(exerciseDefinitionsTable.tenantId, prev.tenantId), eq(exerciseDefinitionsTable.status, "PUBLISHED")))
    .returning();
  if (!marked) throw new ContentLibraryError("SUPERSEDE_RACE_LOST");
  return { row: successor, created: true };
  });
  if (created) await audit("exercise.superseded", input.tenantId, input.actorId, "exercise_definition", successor.id, { parentVersionId: prev.id, version: successor.version });
  return successor;
}

// ===== READ: single-row getters (same-tenant only — 404 semantics upstream) =====

export async function getContentDefinition(tenantId: string, contentId: string): Promise<ContentDefinitionRow> {
  assertUuid(tenantId, "tenant");
  assertUuid(contentId, "content");
  const [row] = await db.select().from(contentDefinitionsTable)
    .where(and(eq(contentDefinitionsTable.tenantId, tenantId), eq(contentDefinitionsTable.id, contentId)))
    .limit(1);
  if (!row) throw new ContentLibraryError("CONTENT_NOT_FOUND_IN_TENANT");
  return row;
}

export async function getExerciseDefinition(tenantId: string, exerciseId: string): Promise<ExerciseDefinitionRow> {
  assertUuid(tenantId, "tenant");
  assertUuid(exerciseId, "exercise");
  const [row] = await db.select().from(exerciseDefinitionsTable)
    .where(and(eq(exerciseDefinitionsTable.tenantId, tenantId), eq(exerciseDefinitionsTable.id, exerciseId)))
    .limit(1);
  if (!row) throw new ContentLibraryError("EXERCISE_NOT_FOUND_IN_TENANT");
  return row;
}

// ===== READ: versions / get / search (tenant-scoped — ALWAYS) =====

export async function listContentVersions(tenantId: string, rootContentId: string): Promise<ContentDefinitionRow[]> {
  assertUuid(tenantId, "tenant");
  return db.select().from(contentDefinitionsTable)
    .where(and(eq(contentDefinitionsTable.tenantId, tenantId), eq(contentDefinitionsTable.rootContentId, rootContentId)))
    .orderBy(asc(contentDefinitionsTable.version));
}

export async function listExerciseVersions(tenantId: string, rootExerciseId: string): Promise<ExerciseDefinitionRow[]> {
  assertUuid(tenantId, "tenant");
  return db.select().from(exerciseDefinitionsTable)
    .where(and(eq(exerciseDefinitionsTable.tenantId, tenantId), eq(exerciseDefinitionsTable.rootExerciseId, rootExerciseId)))
    .orderBy(asc(exerciseDefinitionsTable.version));
}

export interface ContentSearchFilters {
  readonly kind?: string;
  readonly source?: string;
  readonly status?: "DRAFT" | "PUBLISHED" | "SUPERSEDED";
  readonly subject?: string;
  readonly stageKey?: string;
  readonly gradeLevel?: string;
  readonly curriculumId?: string;
  readonly curriculumVersion?: string;
  readonly lessonId?: string;
  readonly createdBy?: string;
  readonly titlePrefix?: string;
}

export async function searchContent(tenantId: string, filters: ContentSearchFilters = {}, pagination: { limit?: number; offset?: number } = {}): Promise<{ total: number; rows: ContentDefinitionRow[] }> {
  assertUuid(tenantId, "tenant");
  const conditions = [eq(contentDefinitionsTable.tenantId, tenantId)]; // tenant isolation on EVERY read
  if (filters.kind) conditions.push(eq(contentDefinitionsTable.kind, filters.kind));
  if (filters.source) conditions.push(eq(contentDefinitionsTable.source, filters.source));
  if (filters.status) conditions.push(eq(contentDefinitionsTable.status, filters.status));
  if (filters.subject) conditions.push(eq(contentDefinitionsTable.subject, filters.subject));
  if (filters.stageKey) conditions.push(eq(contentDefinitionsTable.stageKey, filters.stageKey));
  if (filters.gradeLevel) conditions.push(eq(contentDefinitionsTable.gradeLevel, filters.gradeLevel));
  if (filters.curriculumId) conditions.push(eq(contentDefinitionsTable.curriculumId, filters.curriculumId));
  if (filters.curriculumVersion) conditions.push(eq(contentDefinitionsTable.curriculumVersion, filters.curriculumVersion));
  if (filters.lessonId) conditions.push(eq(contentDefinitionsTable.lessonId, filters.lessonId));
  if (filters.createdBy) conditions.push(eq(contentDefinitionsTable.createdBy, filters.createdBy));
  if (filters.titlePrefix) conditions.push(ilike(contentDefinitionsTable.title, `${filters.titlePrefix}%`));
  const where = and(...conditions);
  const [{ value: total }] = await db.select({ value: count() }).from(contentDefinitionsTable).where(where);
  const rows = await db.select().from(contentDefinitionsTable).where(where)
    .orderBy(asc(contentDefinitionsTable.rootContentId), asc(contentDefinitionsTable.version))
    .limit(Math.min(pagination.limit ?? 50, 200))
    .offset(pagination.offset ?? 0);
  return { total, rows };
}

export interface ExerciseSearchFilters {
  readonly status?: "DRAFT" | "PUBLISHED" | "SUPERSEDED";
  readonly engineBinding?: (typeof ENGINE_BINDINGS)[number];
  readonly activityType?: string;
  readonly subject?: string;
  readonly stageKey?: string;
  readonly gradeLevel?: string;
  readonly curriculumId?: string;
  readonly curriculumVersion?: string;
  readonly contentId?: string;
}

export async function searchExercises(tenantId: string, filters: ExerciseSearchFilters = {}, pagination: { limit?: number; offset?: number } = {}): Promise<{ total: number; rows: ExerciseDefinitionRow[] }> {
  assertUuid(tenantId, "tenant");
  const conditions = [eq(exerciseDefinitionsTable.tenantId, tenantId)];
  if (filters.status) conditions.push(eq(exerciseDefinitionsTable.status, filters.status));
  if (filters.engineBinding) conditions.push(eq(exerciseDefinitionsTable.engineBinding, filters.engineBinding));
  if (filters.activityType) conditions.push(eq(exerciseDefinitionsTable.activityType, filters.activityType));
  if (filters.subject) conditions.push(eq(exerciseDefinitionsTable.subject, filters.subject));
  if (filters.stageKey) conditions.push(eq(exerciseDefinitionsTable.stageKey, filters.stageKey));
  if (filters.gradeLevel) conditions.push(eq(exerciseDefinitionsTable.gradeLevel, filters.gradeLevel));
  if (filters.curriculumId) conditions.push(eq(exerciseDefinitionsTable.curriculumId, filters.curriculumId));
  if (filters.curriculumVersion) conditions.push(eq(exerciseDefinitionsTable.curriculumVersion, filters.curriculumVersion));
  if (filters.contentId) conditions.push(eq(exerciseDefinitionsTable.contentId, filters.contentId));
  const where = and(...conditions);
  const [{ value: total }] = await db.select({ value: count() }).from(exerciseDefinitionsTable).where(where);
  const rows = await db.select().from(exerciseDefinitionsTable).where(where)
    .orderBy(asc(exerciseDefinitionsTable.rootExerciseId), asc(exerciseDefinitionsTable.version))
    .limit(Math.min(pagination.limit ?? 50, 200))
    .offset(pagination.offset ?? 0);
  return { total, rows };
}

// ===== LOADER: persisted row → EXISTING CORE-22 contracts (no contract change) =====

function rowToContentContract(row: ContentDefinitionRow): ContentDefinition {
  // Structurally compatible with CORE-22 ContentDefinition (kind/bodyRef/source/curriculum anchor).
  return {
    contentId: row.id,
    tenantId: row.tenantId,
    kind: row.kind,
    bodyRef: row.bodyRef ?? undefined,
    source: row.source,
    curriculum: {
      curriculumId: row.curriculumId,
      curriculumVersion: row.curriculumVersion,
      country: row.country ?? undefined,
      educationSystem: row.educationSystem ?? undefined,
      stageKey: row.stageKey,
      gradeKey: row.gradeKey ?? undefined,
      gradeLevel: row.gradeLevel,
      subject: row.subject,
      bookId: row.bookId ?? undefined,
      unitId: row.unitId ?? undefined,
      lessonId: row.lessonId ?? undefined,
      objectiveId: row.objectiveId ?? undefined,
      skill: row.skill ?? undefined,
      dimension: row.dimension ?? undefined,
    },
    status: row.status === "PUBLISHED" ? "ACTIVE" : row.status === "SUPERSEDED" ? "RETIRED" : "DRAFT",
    version: row.version,
  } as unknown as ContentDefinition;
}

/**
 * Version-pinned loader for the delivery/execution chain (ACR-24/001 §2.4):
 * resolves a PUBLISHED exercise row into the EXISTING CORE-22 ExerciseDefinition
 * contract — the binding exercised by CORE-23's resolveExerciseBinding.
 */
export async function getPublishedExerciseContract(tenantId: string, exerciseId: string): Promise<ExerciseDefinition> {
  assertUuid(tenantId, "tenant");
  assertUuid(exerciseId, "exercise");
  const [row] = await db.select().from(exerciseDefinitionsTable)
    .where(and(
      eq(exerciseDefinitionsTable.id, exerciseId),
      eq(exerciseDefinitionsTable.tenantId, tenantId),
      eq(exerciseDefinitionsTable.status, "PUBLISHED"), // version binding: published only
    )).limit(1);
  if (!row) throw new ContentLibraryError("EXERCISE_NOT_PUBLISHED_IN_TENANT");
  const contract = {
    exerciseId: row.id,
    tenantId: row.tenantId,
    engineBinding: row.engineBinding,
    contentRefs: row.contentId ? [row.contentId] : [],
    expectedResponse: {
      type: row.expectedResponseType,
      ...((row.expectedResponseConfig ?? {}) as Record<string, unknown>),
    },
    skill: row.skill ?? undefined,
    dimension: row.dimension ?? undefined,
    curriculum: {
      curriculumId: row.curriculumId,
      curriculumVersion: row.curriculumVersion,
      country: row.country ?? undefined,
      educationSystem: row.educationSystem ?? undefined,
      stageKey: row.stageKey,
      gradeKey: row.gradeKey ?? undefined,
      gradeLevel: row.gradeLevel,
      subject: row.subject,
      bookId: row.bookId ?? undefined,
      unitId: row.unitId ?? undefined,
      lessonId: row.lessonId ?? undefined,
      objectiveId: row.objectiveId ?? undefined,
    },
    assessmentPolicyRef: row.assessmentRef ?? undefined,
    status: "ACTIVE" as const,
    version: row.version,
  } as unknown as ExerciseDefinition;
  return contract;
}
