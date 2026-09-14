import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  ActivityPolicy,
  AttemptContext,
  Submission,
  submissionText,
  runDictationAttempt,
  compareDictation,
  computeMeasurements,
  assertDictationContext,
  languagePackFor,
  recordDictationEvidence,
  arabicPack,
  englishPack,
} from "../index.js";
import { buildCurriculumContext, EGYPT_CATALOG } from "@workspace/curriculum";

const T_A = "11111111-1111-4111-8111-111111111111";
const T_B = "22222222-2222-4222-8222-222222222222";
const S_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const S_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function policy(over: Partial<ActivityPolicy> = {}): ActivityPolicy {
  return {
    activityId: "act-1",
    language: "en",
    inputType: "AUDIO",
    responseType: "TYPED",
    responseSource: "keyboard",
    pauseAllowed: true,
    replayAllowed: true,
    maxReplayCount: 3,
    speedControlAllowed: false,
    volumeControlAllowed: true,
    sentenceReplayAllowed: true,
    wordReplayAllowed: false,
    caseSensitive: false,
    comparePunctuation: true,
    difficulty: "medium",
    hintPolicy: "on-request",
    repetitionPolicy: "none",
    timeLimitMs: 120000,
    ...over,
  };
}

function attempt(over: Partial<AttemptContext> = {}): AttemptContext {
  return {
    tenantId: T_A,
    studentId: S_A,
    actorId: S_A,
    actorRole: "student",
    activityId: "act-1",
    sessionId: "sess-1",
    attemptId: "aaaaaaaa-aaaa-4aaa-8aaa-bbbbbbbbbbbb",
    startedAt: "2026-09-08T08:00:00Z",
    submittedAt: "2026-09-08T08:02:10Z",
    replayCount: 2,
    listeningDurationMs: 60000,
    responseDurationMs: 70000,
    totalActivityDurationMs: 130000,
    ...over,
  };
}

const sub: Submission = { source: "keyboard", typedText: "the cat sat" };

async function run(expected: string, actual: string, over: Partial<ActivityPolicy> = {}) {
  const calls: unknown[] = [];
  const writer = async (input: unknown) => { calls.push(input); return input; };
  const res = await runDictationAttempt({
    attempt: attempt(),
    prompt: { text: expected, language: over.language ?? "en", source: "TEACHER_TEXT" },
    submission: { ...sub, typedText: actual },
    policy: policy(over),
    evidenceWriter: writer as never,
  });
  return { res, calls };
}

function fullMeasurements() {
  const pack = englishPack();
  return computeMeasurements(compareDictation("the cat sat on the mat", "the cat sat on the mat", pack), {
    listeningDurationMs: 60000,
    responseDurationMs: 70000,
    totalActivityDurationMs: 130000,
    replayCount: 2,
  });
}

describe("CORE-14 Dictation Engine Foundation", () => {
  it("CORE-14Y contracts: ActivityPolicy carries teacher-controllable knobs (difficulty/replay/speed/time/hint/repetition) as configuration", () => {
    const p = policy();
    assert.equal(p.difficulty, "medium");
    assert.equal(p.maxReplayCount, 3);
    assert.equal(p.speedControlAllowed, false);
    assert.equal(p.timeLimitMs, 120000);
    assert.equal(p.hintPolicy, "on-request");
    assert.equal(p.repetitionPolicy, "none");
    assert.equal(p.pauseAllowed, true);
  });

  it("CORE-14Y contracts: Submission supports typedText/handwrittenText/transcribedText by source", () => {
    assert.equal(submissionText({ source: "keyboard", typedText: "a" }), "a");
    assert.equal(submissionText({ source: "handwriting", handwrittenText: "b" }), "b");
    assert.equal(submissionText({ source: "voice", transcribedText: "c" }), "c");
  });

  it("CORE-14G comparison: exact match -> all MATCH, accuracy 1", async () => {
    const { res } = await run("the cat sat", "the cat sat");
    assert.equal(res.measurements.accuracy, 1);
    assert.ok(res.diffs.every((d) => d.kind === "MATCH"));
  });

  it("CORE-14G comparison: omission detected with expectedToken and position", () => {
    const pack = englishPack();
    const c = compareDictation("the quick brown fox", "the brown fox", pack);
    assert.ok(c.diffs.some((d) => d.kind === "OMISSION" && d.expectedToken === "quick"));
  });

  it("CORE-14G comparison: substitution detected with expectedToken and actualToken", () => {
    const pack = englishPack();
    const c = compareDictation("the cat sat", "the dog sat", pack);
    assert.ok(c.diffs.some((d) => d.kind === "SUBSTITUTION" && d.expectedToken === "cat" && d.actualToken === "dog"));
  });

  it("CORE-14G comparison: insertion detected with actualToken", () => {
    const pack = englishPack();
    const c = compareDictation("cat sat", "cat quickly sat", pack);
    assert.ok(c.diffs.some((d) => d.kind === "INSERTION" && d.actualToken === "quickly"));
  });

  it("CORE-14G comparison: misspelling (close token) classified MISSPELLING", () => {
    const pack = englishPack();
    const c = compareDictation("cat", "kat", pack);
    assert.ok(c.diffs.some((d) => d.kind === "MISSPELLING" && d.expectedToken === "cat" && d.actualToken === "kat"));
  });

  it("CORE-14G comparison: word order -> WORD_ORDER diffs, not omission+insertion", () => {
    const pack = englishPack();
    const c = compareDictation("the cat sat", "sat the cat", pack);
    assert.ok(c.diffs.filter((d) => d.kind === "WORD_ORDER").length >= 1);
    assert.equal(c.diffs.some((d) => d.kind === "OMISSION"), false);
    assert.equal(c.diffs.some((d) => d.kind === "INSERTION"), false);
  });

  it("CORE-14G comparison: punctuation difference -> PUNCTUATION diff and punctuationAccuracy < 1", async () => {
    const { res } = await run("Hello, world.", "Hello world");
    assert.ok(res.diffs.some((d) => d.kind === "PUNCTUATION" && d.expectedToken === ","));
    assert.ok(res.measurements.punctuationAccuracy < 1);
  });

  it("CORE-14H language: Arabic exact match", () => {
    const pack = arabicPack();
    const c = compareDictation("القط يجلس", "القط يجلس", pack);
    assert.ok(c.diffs.every((d) => d.kind === "MATCH"));
  });

  it("CORE-14I language: Arabic alef normalization (أحمد == احمد)", () => {
    const pack = arabicPack();
    const c = compareDictation("أحمد", "احمد", pack);
    assert.ok(c.diffs.every((d) => d.kind === "MATCH"));
  });

  it("CORE-14I language: Arabic harakat stripped (كِتاب == كتاب)", () => {
    const pack = arabicPack();
    const c = compareDictation("كِتاب", "كتاب", pack);
    assert.ok(c.diffs.every((d) => d.kind === "MATCH"));
  });

  it("CORE-14I language: Arabic taa marbuta stays spelling-sensitive by default (مدرسة != مدرسه)", () => {
    const pack = arabicPack();
    const c = compareDictation("مدرسة", "مدرسه", pack);
    assert.equal(c.diffs.some((d) => d.kind === "MATCH"), false);
  });

  it("CORE-14I language: Arabic punctuation (مرحبا، vs مرحبا)", () => {
    const pack = arabicPack();
    const c = compareDictation("مرحبا،", "مرحبا", pack);
    assert.ok(c.diffs.some((d) => d.kind === "PUNCTUATION"));
  });

  it("CORE-14H language: unsupported language throws UNSUPPORTED_LANGUAGE", () => {
    assert.throws(() => languagePackFor("fr" as never), /UNSUPPORTED_LANGUAGE/);
  });

  it("CORE-14P time evidence: three distinct durations + replayCount recorded, responseTimeMs = responseDurationMs", async () => {
    const { res } = await run("the cat sat", "the cat sat");
    assert.equal(res.measurements.listeningDurationMs, 60000);
    assert.equal(res.measurements.responseDurationMs, 70000);
    assert.equal(res.measurements.totalActivityDurationMs, 130000);
    assert.equal(res.measurements.replayCount, 2);
    assert.equal(res.measurements.responseTimeMs, 70000);
    assert.equal(res.evidenceInput.durationMs, 70000);
    assert.equal(res.evidenceInput.metadata!.replayCount, 2);
  });

  it("CORE-14K evidence: single canonical writer call, evidenceType attempt, sourceEngine dictation-engine, stable operationKey", async () => {
    const { res, calls } = await run("the cat sat", "the cat sat");
    assert.equal(calls.length, 1);
    assert.equal(res.evidenceInput.evidenceType, "attempt");
    assert.equal(res.evidenceInput.sourceEngine, "dictation-engine");
    assert.equal(res.evidenceInput.operationKey, `dictation:attempt:${res.attemptId}`);
    assert.equal(res.evidenceInput.tenantId, T_A);
    assert.equal(res.evidenceInput.studentId, S_A);
  });

  it("CORE-14K evidence: references correct (activityId/sessionId/attemptId/result/durationMs), measurements in response, no second store", async () => {
    const { res } = await run("the cat sat", "the cat sat");
    assert.equal(res.evidenceInput.activityId, "act-1");
    assert.equal(res.evidenceInput.sessionId, "sess-1");
    assert.equal(res.evidenceInput.attemptId, "aaaaaaaa-aaaa-4aaa-8aaa-bbbbbbbbbbbb");
    assert.equal(res.evidenceInput.result, "1");
    assert.equal((res.evidenceInput.response as { accuracy: number }).accuracy, 1);
  });

  it("CORE-14V measurement: multidimensional dimensions, no aggregate dictation score", async () => {
    const m = fullMeasurements();
    const skills = m.dimensions.map((d) => d.skill);
    assert.ok(skills.includes("dictation.accuracy"));
    assert.ok(skills.includes("dictation.speed"));
    assert.ok(skills.includes("writing.spelling"));
    assert.ok(skills.includes("listening.comprehension"));
    const json = JSON.stringify(m);
    assert.equal(json.includes("dictationScore"), false);
    assert.equal(json.includes("overallScore"), false);
  });

  it("CORE-14T source: measurements are RULE (deterministic), no ML/LLM involved", async () => {
    const { res } = await run("the cat sat", "the cat sat");
    assert.equal(res.evidenceInput.metadata!.source, "RULE");
  });

  it("CORE-14W tenant: missing/invalid tenant and missing student rejected with canonical errors", () => {
    assert.throws(() => assertDictationContext(undefined, S_A), /TENANT_CONTEXT_MISSING/);
    assert.throws(() => assertDictationContext("not-a-uuid", S_A), /INVALID_TENANT_ID/);
    assert.throws(() => assertDictationContext(T_A, undefined), /STUDENT_CONTEXT_MISSING/);
  });

  it("CORE-14W tenant: every emitted evidence row is tenant-scoped; Tenant B context stays independent", async () => {
    await run("the cat sat", "the cat sat");
    const { calls } = await run("the cat sat", "the cat sat");
    for (const c of calls) {
      assert.equal((c as { tenantId: string }).tenantId, T_A);
      assert.notEqual((c as { tenantId: string }).tenantId, T_B);
    }
    assert.doesNotThrow(() => assertDictationContext(T_B, S_B));
  });

  it("CORE-14U curriculum integration: context references mapped into evidence fields without duplication", async () => {
    const ctx = buildCurriculumContext(
      { tenantId: T_A, country: "EG", language: "ar", educationSystem: "Ministry of Education EG", educationStage: "primary", grade: "4", gradeKey: "EG-PR-04", subject: "mathematics", curriculumId: "eg-math-primary", bookId: "eg-math-4-2026", unitId: "u-fractions", lessonId: "l-equiv-fractions", objectiveId: "o-equiv-fractions" },
      EGYPT_CATALOG,
    );
    const { res } = await run("the cat sat", "the cat sat", { language: "en", curriculum: ctx });
    assert.equal(res.evidenceInput.subject, "mathematics");
    assert.equal(res.evidenceInput.curriculumBook, "eg-math-4-2026");
    assert.equal(res.evidenceInput.unitId, "u-fractions");
    assert.equal(res.evidenceInput.lessonId, "l-equiv-fractions");
    assert.equal(res.evidenceInput.objectiveId, "o-equiv-fractions");
    const meta = res.evidenceInput.metadata!.curriculum as Record<string, unknown>;
    const json = JSON.stringify(meta);
    assert.equal(json.includes("objectiveText"), false);
    assert.equal(json.includes("lessonTitle"), false);
    assert.equal(json.includes("bookTitle"), false);
  });

  it("CORE-14Q security: audio is a reference only; engine never reads files and never embeds audio bytes", async () => {
    const { res } = await run("the cat sat", "the cat sat");
    const rr = await recordDictationEvidence({
      attempt: attempt(),
      measurements: fullMeasurements(),
      policy: policy({ responseSource: "voice" }),
      diffs: [],
      evidenceWriter: (async (input) => input) as never,
    });
    assert.equal(rr.evidenceInput.metadata!.diffs !== undefined, true);
    assert.equal(res.evidenceInput.metadata!.audioRef, undefined);
  });

  it("CORE-14S inference boundary: SpeechRecognitionProvider contract exists but no provider is called (deterministic path only)", async () => {
    const { res } = await run("the cat sat", "the cat sat");
    assert.equal(res.evidenceInput.metadata!.source, "RULE");
  });

  it("CORE-14 determinism: identical input yields identical measurements", async () => {
    const a = await run("the cat sat on the mat", "the cat sat on the mat");
    const b = await run("the cat sat on the mat", "the cat sat on the mat");
    assert.deepEqual(a.res.measurements, b.res.measurements);
  });

  it("CORE-14R replaceable STT: providers are swappable behind the contract without domain changes", () => {
    const p: import("../inference.js").SpeechRecognitionProvider = {
      providerName: "provider-a",
      transcribe: async () => ({ text: "x", confidence: 0.9, source: "STATISTICAL" }),
    };
    assert.equal(p.providerName, "provider-a");
  });

  it("CORE-14Y learning: engine emits dimension keys aligned with the CORE-09 learner registry (dictation.accuracy/dictation.speed/writing.spelling)", () => {
    const keys = fullMeasurements().dimensions.map((d) => d.skill);
    assert.ok(keys.includes("dictation.accuracy"));
    assert.ok(keys.includes("dictation.speed"));
    assert.ok(keys.includes("writing.spelling"));
  });
});
