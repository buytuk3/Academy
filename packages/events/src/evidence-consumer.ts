/**
 * CORE-06 — Event → Evidence mapping (Core Platform).
 * Any event that REPRESENTS real evidence is recorded through the canonical
 * writer (recordEvidence) — never a direct table insert, never engine-owned
 * evidence storage. Idempotency: operationKey = `event:{event.id}` → the
 * writer's (tenant_id, operation_key) unique index dedupes queue retries.
 */
import { recordEvidence } from "@workspace/db";
import type { EvidenceType } from "@workspace/db";
import type { LearningEvent, LearningEventType } from "@buytuk/contracts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const EVENT_TO_EVIDENCE_TYPE: Record<LearningEventType, EvidenceType> = {
  StudentAttemptedExercise: "attempt",
  StudentResponseRecorded: "response",
  StudentCompletedReading: "time",
  ReadingAnalyzed: "assessment",
  MistakeDetected: "mistake",
  AssessmentCompleted: "assessment",
  MasteryUpdated: "decision",
  DiagnosisCreated: "decision",
  InterventionAssigned: "intervention",
  InterventionCompleted: "intervention",
  InterventionOutcomeMeasured: "outcome",
  TeacherReportGenerated: "decision",
};

export const EVENT_TO_SOURCE_ENGINE: Record<LearningEventType, string> = {
  StudentAttemptedExercise: "reading-engine",
  StudentResponseRecorded: "reading-engine",
  StudentCompletedReading: "reading-engine",
  ReadingAnalyzed: "reading-engine",
  MistakeDetected: "reading-engine",
  MasteryUpdated: "reading-engine",
  AssessmentCompleted: "assessment-engine",
  DiagnosisCreated: "learning-diagnosis",
  InterventionAssigned: "intervention-engine",
  InterventionCompleted: "intervention-engine",
  InterventionOutcomeMeasured: "intervention-engine",
  TeacherReportGenerated: "teacher-intelligence",
};

function subjectFor(type: LearningEventType): string | undefined {
  if (type.startsWith("Student") || type === "ReadingAnalyzed" || type === "MistakeDetected" || type === "MasteryUpdated") return "reading";
  return undefined;
}

/** Default consumer for any evidence-representing event (fallback; overridable). */
export function evidenceConsumerFor(type: LearningEventType): ((ev: LearningEvent) => Promise<{ id: string }>) | undefined {
  if (!(type in EVENT_TO_EVIDENCE_TYPE)) return undefined;
  return async (ev: LearningEvent) => {
    const p = (ev.payload ?? {}) as unknown as Record<string, unknown>;
    const row = await recordEvidence({
      tenantId: ev.tenantId,
      studentId: ev.studentId,
      actorId: UUID_RE.test(ev.actor.id) ? ev.actor.id : undefined,
      actorRole: ev.actor.role,
      occurredAt: new Date(ev.occurredAt),
      evidenceType: EVENT_TO_EVIDENCE_TYPE[type],
      subject: subjectFor(type),
      sessionId: typeof p.sessionId === "string" ? p.sessionId : undefined,
      attemptId: typeof p.attemptId === "string" ? p.attemptId : undefined,
      passageId: typeof p.passageId === "string" ? p.passageId : undefined,
      action: `event:${type}`,
      response: p && Object.keys(p).length > 0 ? p : undefined,
      result: "completed",
      sourceEngine: EVENT_TO_SOURCE_ENGINE[type],
      tool: "events:evidence-consumer",
      operationKey: `event:${ev.id}`,
      metadata: { eventId: ev.id },
    });
    return { id: row.id };
  };
}
