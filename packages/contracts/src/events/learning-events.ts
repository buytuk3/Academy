/**
 * Learning Event Contracts — Event-First design without an Event Bus yet.
 * (ARCHITECTURE_CONTRACT.md §12 Event Rules — the 12 approved events.)
 * Envelope fields are mandatory: id, type, version, occurredAt, actor, tenantId, studentId, payload.
 */

export type LearningEventType =
  | "StudentAttemptedExercise"
  | "StudentCompletedReading"
  | "ReadingAnalyzed"
  | "MistakeDetected"
  | "AssessmentCompleted"
  | "MasteryUpdated"
  | "DiagnosisCreated"
  | "InterventionAssigned"
  | "InterventionCompleted"
  | "TeacherReportGenerated"
  | "StudentResponseRecorded"
  | "InterventionOutcomeMeasured";

export interface EventActor {
  id: string;
  role: "student" | "teacher" | "parent" | "principal" | "admin" | "system";
}

export interface LearningEventEnvelope<P = unknown> {
  id: string;
  type: LearningEventType;
  version: number;
  occurredAt: string; // ISO-8601 UTC
  actor: EventActor;
  tenantId: string;
  studentId: string;
  payload: P;
}

// ===== Payload contracts per event =====

export interface StudentAttemptedExercisePayload {
  exerciseId: string;
  sessionId: string;
  response: unknown;
  recordedAtMs: number;
}

export interface StudentCompletedReadingPayload {
  sessionId: string;
  passageId: string;
  durationMs: number;
  completedAt: string;
}

export interface ReadingAnalyzedPayload {
  sessionId: string;
  reportId: string;
  scoreSummary: {
    accuracy: number;
    fluency: number;
    prosody: number;
  };
  evidenceRef: string;
  /** CORE-06 — optional structural links so the evidence consumer writes linked evidence. */
  attemptId?: string;
  passageId?: string;
}

export interface MistakeDetectedPayload {
  sessionId: string;
  phoneme: string;
  errorType: "substitution" | "deletion" | "insertion";
  context: string;
}

export interface AssessmentCompletedPayload {
  assessmentId: string;
  studentId: string;
  overallScore: number;
  completedAt: string;
}

export interface MasteryUpdatedPayload {
  masteryRecordId: string;
  skillId: string;
  level: "MASTERED" | "PROGRESSING" | "DEVELOPING" | "NEEDS_SUPPORT";
  previousLevel?: "MASTERED" | "PROGRESSING" | "DEVELOPING" | "NEEDS_SUPPORT";
}

export interface DiagnosisCreatedPayload {
  diagnosisId: string;
  gaps: string[];
  evidenceRefs: string[];
}

export interface InterventionAssignedPayload {
  interventionId: string;
  planId: string;
  assignedTo: string;
}

export interface InterventionCompletedPayload {
  interventionId: string;
  completedAt: string;
  outcomeRef: string;
}

export interface TeacherReportGeneratedPayload {
  reportId: string;
  teacherId: string;
  studentId: string;
  period: { from: string; to: string };
}

export interface StudentResponseRecordedPayload {
  sessionId: string;
  itemId: string;
  responseRef: string;
  scored: boolean;
}

export interface InterventionOutcomeMeasuredPayload {
  interventionId: string;
  beforeScore: number;
  afterScore: number;
  delta: number;
}

// ===== Discriminated union of all learning events =====

export type LearningEvent =
  | (LearningEventEnvelope<StudentAttemptedExercisePayload> & { type: "StudentAttemptedExercise" })
  | (LearningEventEnvelope<StudentCompletedReadingPayload> & { type: "StudentCompletedReading" })
  | (LearningEventEnvelope<ReadingAnalyzedPayload> & { type: "ReadingAnalyzed" })
  | (LearningEventEnvelope<MistakeDetectedPayload> & { type: "MistakeDetected" })
  | (LearningEventEnvelope<AssessmentCompletedPayload> & { type: "AssessmentCompleted" })
  | (LearningEventEnvelope<MasteryUpdatedPayload> & { type: "MasteryUpdated" })
  | (LearningEventEnvelope<DiagnosisCreatedPayload> & { type: "DiagnosisCreated" })
  | (LearningEventEnvelope<InterventionAssignedPayload> & { type: "InterventionAssigned" })
  | (LearningEventEnvelope<InterventionCompletedPayload> & { type: "InterventionCompleted" })
  | (LearningEventEnvelope<TeacherReportGeneratedPayload> & { type: "TeacherReportGenerated" })
  | (LearningEventEnvelope<StudentResponseRecordedPayload> & { type: "StudentResponseRecorded" })
  | (LearningEventEnvelope<InterventionOutcomeMeasuredPayload> & { type: "InterventionOutcomeMeasured" });
