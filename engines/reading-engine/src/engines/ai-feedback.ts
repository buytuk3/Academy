import { injectable } from "inversify";
import { RuleEngine } from "./rule-engine.js";
import { ExerciseLibrary } from "../exercises/library.js";
import { logger } from "../observability/logger.js";
import type { GapResult, WordReportItem, AIFeedback } from "@buytuk/contracts";
import { GatewayLLMAdapter } from "./llm/gateway-adapter.js";
import { LLMProviderError, type LLMProvider } from "./llm/types.js";

/**
 * AI Feedback Engine
 *
 * LLM is used ONLY for reformulation, NOT for exercise selection.
 *
 * Flow:
 *   Gap → Rule Engine → Exercise from Library → LLM reformulates
 *
 * P2 / ACR-E6-001 — REAL PROVIDER PATH: `callLLM` goes through the injected
 * `LLMProvider` (default: GatewayLLMAdapter → existing inference-client gRPC
 * `Feedback` RPC). The legacy static-template stub is DELETED — no mock
 * remains in the production path. On ANY provider failure the result is an explicitly
 * DEGRADED feedback (original instructions + `degraded: true` sentinel
 * rootCause) — an error-safe behavior, never a claim that the LLM ran.
 */
@injectable()
export class AIFeedbackEngine {
  private rules: RuleEngine;
  private library: ExerciseLibrary;

  constructor(private readonly llm: LLMProvider = new GatewayLLMAdapter()) {
    this.rules = new RuleEngine();
    this.library = new ExerciseLibrary();
  }

  async generate(
    wordReport: WordReportItem[],
    gaps: GapResult,
    studentProfile: { name: string; level: string; nativeLanguage: string }
  ): Promise<AIFeedback[]> {
    const matches = this.rules.select(gaps);
    const feedbacks: AIFeedback[] = [];

    for (const match of matches) {
      const exercise = this.library.getById(match.exerciseId);
      if (!exercise) continue;

      const personalized = await this.callLLM({
        exercise,
        match,
        studentProfile,
        errors: wordReport.filter(w => w.status !== "correct").slice(0, 5),
      });

      feedbacks.push({
        exerciseId: exercise.id,
        originalInstructions: exercise.instructions,
        personalizedInstructions: personalized.instructions,
        errorExplanation: personalized.explanation,
        rootCause: personalized.rootCause,
        ...(personalized.degraded ? { degraded: true } : {}),
      });
    }

    return feedbacks;
  }

  private async callLLM(ctx: any): Promise<{
    instructions: string;
    explanation: string;
    rootCause: string;
    degraded?: boolean;
  }> {
    const prompt = this.buildPrompt(ctx);
    const log = logger.child({ component: "AIFeedbackEngine", provider: this.llm.name });

    try {
      const response = await this.llm.complete({
        prompt,
        correlationId: `ai-feedback:${ctx.exercise.id}`,
      });
      const parsed = this.parseLLMFeedback(response.text);
      if (!parsed) {
        log.warn({ provider: this.llm.name, modelUsed: response.modelUsed }, "LLM response unparseable — degraded feedback");
        return this.degradedFeedback(ctx, "LLM_BAD_RESPONSE");
      }
      return parsed;
    } catch (err) {
      // Explicit DEGRADED behavior (never a fake "LLM succeeded" result).
      const code = err instanceof LLMProviderError ? err.code : "LLM_PROVIDER_FAILURE";
      log.warn({ err, code, provider: this.llm.name }, "LLM degraded feedback — provider path failed (error-safe, original instructions kept)");
      return this.degradedFeedback(ctx, code);
    }
  }

  private parseLLMFeedback(text: string): { instructions: string; explanation: string; rootCause: string } | null {
    // The provider is instructed to answer with JSON; strip optional code fences.
    const raw = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
    try {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      const { instructions, explanation, rootCause } = obj as any;
      if (typeof instructions !== "string" || typeof explanation !== "string" || typeof rootCause !== "string") {
        return null;
      }
      return { instructions, explanation, rootCause };
    } catch {
      return null;
    }
  }

  /** Degraded/error-safe feedback — clearly flagged, original instructions preserved. */
  private degradedFeedback(ctx: any, code: string): { instructions: string; explanation: string; rootCause: string; degraded: boolean } {
    logger.warn({ component: "AIFeedbackEngine", code }, "DEGRADED feedback emitted (LLM unavailable) — flagged as degraded:true");
    return {
      instructions: ctx.exercise.instructions,
      explanation: "تعذّر توليد ملاحظات مخصصة الآن — تعلم من التعليمات الأصلية للتمرين",
      rootCause: "غير محدد",
      degraded: true,
    };
  }

  private buildPrompt(ctx: any): string {
    return `
أنت مساعد تعليمي. لديك تمرين جاهز ومُعدّ مسبقاً.
مهمتك:
1. أعد صياغة التعليمات لتناسب هذا الطالب تحديداً
2. اشرح الخطأ الذي وقع فيه (بناءً على أخطائه الفعلية)
3. حدد السبب الجذري (أي مهارة صوتية ناقصة)

التمرين: ${JSON.stringify(ctx.exercise)}
سبب الاختيار: ${ctx.match.reason}
الطالب: ${ctx.studentProfile.name}، مستواه ${ctx.studentProfile.level}
أخطاء الطالب: ${JSON.stringify(ctx.errors)}

أعد JSON: {instructions, explanation, rootCause}
لا تخترع تمريناً جديداً — فقط أعد الصياغة.
`;
  }
}
