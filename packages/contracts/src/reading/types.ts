/**
 * Core types for BuyTuk Reading Engine.
 *
 * CORE-02 (identity/tenant unification): all reading-domain identifiers are
 * canonical UUID/text strings (single source: packages/database). Numeric
 * (legacy serial) ids are no longer part of the reading contract; the DB
 * write path is @workspace/db (canonical tables). tenantId is an explicit,
 * required part of the runtime flow and of the AnalyzeJob payload — the
 * worker must never guess it (multi-tenant by architecture).
 */

// ===== Audio Types =====
export interface AudioBuffer {
  pcm: Float32Array;
  sampleRate: number;
  channels: number;
  durationSec: number;
}

export interface AudioFeatures {
  mfcc: number[][];
  pitch: number[];
  energy: number[];
  zcr: number[];
  spectralCentroid: number[];
  spectralRolloff: number[];
  speechRate: number;
  pauseRatio: number;
  prosodyVariance: number;
  hnr: number;
}

// ===== Speech Types =====
export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence: number;
  noSpeechProb: number;
  avgLogprob: number;
}

export interface STTResult {
  text: string;
  words: WordTimestamp[];
  language: "ar";
  engine: string;
  modelVersion: string;
}

export interface SpeechSegment {
  start: number;
  end: number;
  audio: Float32Array;
}

// ===== Phoneme Types =====
export interface PhonemeTimestamp {
  phoneme: string;
  start: number;
  end: number;
  confidence: number;
}

export interface PhonemeError {
  type: "substitution" | "deletion" | "insertion";
  expected?: string;
  actual?: string;
  position: number;
  phoneticDistance: number;
  severity: "high" | "medium" | "low";
}

export interface PhonemeAlignment {
  expected: string[];
  actual: string[];
  errors: PhonemeError[];
  score: number;
}

export interface WordAlignment {
  word: string;
  start: number;
  end: number;
  score: number;
  confidence: number;
  phonemeAlignment?: PhonemeAlignment;
}

// ===== Alignment Types =====
export type AlignmentOp =
  | { type: "match"; expected: string; actual: string; cost: number }
  | { type: "substitution"; expected: string; actual: string; cost: number }
  | { type: "deletion"; expected: string; cost: number }
  | { type: "insertion"; actual: string; cost: number };

export interface DTWResult {
  ops: AlignmentOp[];
  distance: number;
  normalizedDistance: number;
}

export interface AlignmentResult {
  wordOps: AlignmentOp[];
  phonemeOps: AlignmentOp[];
  wordErrorRate: number;
  phonemeErrorRate: number;
  totalErrors: number;
}

// ===== Engine Types =====
export interface ReadingScore {
  overall: number;
  accuracy: number;
  pronunciation: number;
  fluency: number;
  prosody: number;
  wpm: number;
  durationSec: number;
}

export type MasteryLevel = "MASTERED" | "PROGRESSING" | "DEVELOPING" | "NEEDS_SUPPORT";

export interface MasteryResult {
  level: MasteryLevel;
  delta: number;
  attempts: number;
  trend: "up" | "down" | "stable";
}

export interface GapResult {
  errorDistribution: Record<string, number>;
  phonemeGaps: Record<string, number>;
  problemWords: string[];
  skippedSegments: string[];
  severityBreakdown: {
    high: number;
    medium: number;
    low: number;
  };
}

export interface Recommendation {
  category: "fluency" | "accuracy" | "pronunciation" | "prosody" | "engagement";
  message: string;
  priority: "high" | "medium" | "low";
  exerciseId?: string;
}

// ===== Exercise Types =====
export interface Exercise {
  id: string;
  type: "minimal_pairs" | "tongue_twister" | "syllable_drill" | "contextual_reading";
  title: string;
  focus: string[];
  content: any;
  instructions: string;
  difficulty: number;
}

export interface RuleMatch {
  exerciseId: string;
  reason: string;
  priority: number;
}

export interface AIFeedback {
  exerciseId: string;
  originalInstructions: string;
  personalizedInstructions: string;
  errorExplanation: string;
  rootCause: string;
  /** P2 / ACR-E6-001 — additive: true = LLM unavailable → degraded error-safe feedback (original instructions kept). Absent = real provider output. */
  degraded?: boolean;
}

// ===== Report Types =====
export interface WordReportItem {
  word: string;
  status: "correct" | "wrong" | "missing" | "extra" | "repeated" | "skipped";
  actual?: string;
  confidence?: number;
  durationMs?: number;
  expectedDurationMs?: number;
  phonemeReport?: PhonemeReportItem[];
}

export interface PhonemeReportItem {
  phoneme: string;
  status: "correct" | "wrong" | "missing" | "extra";
  actual?: string;
  confidence?: number;
  durationMs?: number;
  articulationNote?: string;
  phoneticDistance?: number;
}

/** Canonical report DTO — ids are UUID/text, tenantId is explicit (CORE-02). */
export interface FullReport {
  attemptId: string;
  passageId: string;
  studentId: string;
  tenantId: string;
  expected: string;
  actual: string;
  wordReport: WordReportItem[];
  reading: ReadingScore;
  mastery: MasteryResult;
  gaps: GapResult;
  recommendations: Recommendation[];
  aiFeedback: AIFeedback[];
  createdAt: string;
  modelVersions: {
    whisper: string;
    alignment: string;
    g2p: string;
  };
}

// ===== Job Types =====
/**
 * AnalyzeJob — self-contained worker payload.
 * CORE-02B/02C: carries every piece of context the worker needs outside any
 * HTTP request, explicitly: attemptId (uuid), tenantId (required), and all
 * reading identifiers as uuid strings. The worker must not resolve the
 * tenant implicitly.
 */
export interface AnalyzeJob {
  studentId: string;
  passageId: string;
  sessionId: string;
  audioKey: string;
  expectedText: string;
  correlationId: string;
  priority?: number;
  attemptId?: string;
  tenantId: string;
  /** CORE-25 / WAVE-4A: present when the canonical Execution capability owns
   *  the attempt lifecycle — the worker then closes MEASURED→EVIDENCE_RECORDED
   *  via completeAsyncExecution (persistent attempt + REAL evidence pointer).
   *  Optional/additive — no migration, no breaking change. */
  executionAttemptId?: string;
}

export interface JobResult {
  success: boolean;
  report?: FullReport;
  error?: string;
  duration: number;
}

// ===== Database-facing DTOs (canonical uuid ids + tenant context) =====
export interface User {
  id: string;
  tenantId?: string;
  username: string;
  role: "teacher" | "student" | "admin";
  createdAt: Date;
}

export interface Student extends User {
  displayName?: string;
  grade?: string;
  nativeLanguage?: string;
}

export interface Teacher extends User {
  displayName?: string;
}

export interface Passage {
  id: string;
  tenantId: string;
  teacherId: string;
  title: string;
  text: string;
  difficulty: number;
  createdAt: Date;
}

export interface Attempt {
  id: string;
  tenantId: string;
  sessionId: string;
  studentId: string;
  passageId: string;
  transcript?: string;
  durationSec?: number;
  createdAt: Date;
}

export interface Report {
  id: string;
  tenantId: string;
  attemptId: string;
  score: number;
  data: FullReport;
  createdAt: Date;
}

// ===== API Types =====
export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  ok: boolean;
  token?: string;
  role?: string;
  error?: string;
}

export interface CreatePassageRequest {
  tenantId: string;
  teacherId: string;
  title: string;
  text: string;
  difficulty?: number;
}

export interface AnalyzeRequest {
  studentId: string;
  passageId: string;
  sessionId: string;
  audioKey: string;
  expectedText?: string;
}

export interface AnalyzeResponse {
  ok: boolean;
  jobId?: string;
  attemptId?: string;
  report?: FullReport;
  error?: string;
}

// ===== WebSocket Types =====
export interface SocketEvents {
  // Client → Server
  "start_session": { passageId: string; studentId: string; expectedText: string };
  "audio_chunk": Float32Array;
  "stop_session": void;

  // Server → Client
  "session_started": { ok: boolean; sessionId?: string; attemptId?: string };
  "pipeline_status": { stage: string; progress?: number };
  "report_ready": { report: FullReport };
  "pipeline_error": { message: string; code?: string };
}

// ===== Config Types =====
export interface AppConfig {
  env: string;
  port: number;
  host: string;
  database: {
    url: string;
    poolMin: number;
    poolMax: number;
  };
  redis: {
    url: string;
    prefix: string;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  aws: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    s3Bucket: string;
  };
  inference: {
    gatewayUrl: string;
    apiKey: string;
  };
  llm: {
    provider: "gemini" | "openai";
    apiKey: string;
  };
}
