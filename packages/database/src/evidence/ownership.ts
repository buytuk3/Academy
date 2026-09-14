/**
 * CORE-03B — Explicit ownership boundaries (single source of truth).
 *
 * Machine-checkable map of which platform component owns what. Evidence is
 * owned by the Core Platform; the Student Learning Record is ALSO owned by the
 * Core Platform and CONSUMES evidence through the Evidence Reader — it never
 * re-stores a second copy of evidence.
 */
export const OWNERSHIP = {
  "reading.measurements": "reading-engine",
  "evidence": "core-platform",
  "student-learning-record": "core-platform",
  "assessment": "assessment-engine",
  "mastery": "mastery-engine",
  "diagnosis": "learning-diagnosis",
  "intervention": "intervention-engine",
  // CORE-07 — transitional capability home. The Learning Loop orchestration
  // lives in Core Platform until the dedicated engines (learning-diagnosis /
  // intervention-engine) exist; when they do, their keys below are reassigned.
  "learning-loop": "core-platform",
  // CORE-09 - Multidimensional Learner Model (Core Platform ownership; pure projection over Evidence, no writes).
  "learner-model": "core-platform",
  // CORE-18 — Global Student Identity / Membership / History Share (ADR-002).
  // Reference & authorization layers ONLY — they own NO educational data.
  "student-identity": "core-platform",
  "student-membership": "core-platform",
  "student-history-share": "core-platform",
  // CORE-19 — Education Organization & Multi-Tenant Scope Foundation.
  // Institutional structure & scope resolution ONLY — they own NO educational
  // data; Tenant ≠ School; Role ≠ Scope. No engine may own copies (19-AI).
  "organization": "core-platform",
  "school": "core-platform",
  "staff-membership": "core-platform",
  "authorization-scope": "core-platform",
  // CORE-20 — Oversight aggregation is a core-platform PROJECTION over canonical
  // Evidence (20-V/20-W): engines never aggregate; no second statistics store.
  "educational-aggregation": "core-platform",
  "educational-access-policy": "core-platform",
  // CORE-21 — Activity/Delivery contracts & capability (core-platform).
  // Reference-only layer over canonical Curriculum/Evidence — owns NO student facts.
  "activity-foundation": "core-platform",
  // CORE-22 — Content/Exercise contracts & resolvers (core-platform).
  // Reference-only foundation: Content ≠ Exercise ≠ Activity ≠ Assessment ≠ Evidence.
  "content-foundation": "core-platform",
  // CORE-24 / Wave 1 (ACR-24/001, ADR-004) — Persistent Content & Exercise
  // Library (definitions ONLY: no evidence, no attempt results, no student
  // data; versioned DRAFT→PUBLISHED→SUPERSEDED; body_ref = Object Storage
  // pointer; audio stays with reading-engine).
  "content-library": "core-platform",
  // CORE-24 / Wave 2 (ACR-24/002, ADR-004) — Persistent Assignment & Attempt
  // STATE (operational/administrative ONLY: lifecycle + timings + evidence_ref
  // POINTER; Evidence stays the single canonical learning fact; rows are never
  // rewritten on student transfer — ADR-002).
  "activity-assignment-state": "core-platform",
  "activity-attempt-state": "core-platform",
  // CORE-24 / Wave 3 (owner-approved AUTH/CONTRACT checkpoint, 2026-09-11) —
  // Canonical Auth Application Capability: ONE owner of session/login logic;
  // HTTP surfaces (/v1 canonical, /api legacy) are thin adapters only.
  "auth": "core-platform",
} as const;

export type OwnershipKey = keyof typeof OWNERSHIP;
export type OwnershipOwner = (typeof OWNERSHIP)[OwnershipKey];
