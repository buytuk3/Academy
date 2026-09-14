import { injectable } from "inversify";
import type {
  ReadingScore,
  GapResult,
  MasteryResult,
  Recommendation
} from "@buytuk/contracts";

/**
 * Recommendation Engine
 *
 * Generates personalized recommendations based on:
 *   - Reading scores
 *   - Gap analysis
 *   - Mastery level
 */
@injectable()
export class RecommendationEngine {
  compute(
    score: ReadingScore,
    gaps: GapResult,
    mastery: MasteryResult
  ): Recommendation[] {
    const recs: Recommendation[] = [];

    if (score.fluency < 60) {
      recs.push({
        category: "fluency",
        message: "سرعة القراءة أقل من المطلوب. تمرّن على القراءة بسرعة ثابتة 100-120 كلمة/دقيقة.",
        priority: "high",
      });
    } else if (score.fluency < 75) {
      recs.push({
        category: "fluency",
        message: "سرعة القراءة مقبولة لكن يمكن تحسينها. حاول القراءة بانتظام أكثر.",
        priority: "medium",
      });
    }

    if (score.accuracy < 80) {
      recs.push({
        category: "accuracy",
        message: "دقة القراءة تحتاج تحسين. ركّز على نطق كل كلمة بوضوح قبل الانتقال للتالية.",
        priority: "high",
      });
    }

    if (score.pronunciation < 75) {
      recs.push({
        category: "pronunciation",
        message: "هناك أخطاء في مخارج الحروف. راجع الحروف المتشابهة (ق/ك، ث/س، ض/ظ).",
        priority: "high",
      });
    }

    if ((gaps.errorDistribution.deletion || 0) > 3) {
      recs.push({
        category: "engagement",
        message: "تخطّي كلمات كثيرة. اقرأ كلمة كلمة دون حذف.",
        priority: "medium",
      });
    }

    if ((gaps.errorDistribution.insertion || 0) > 3) {
      recs.push({
        category: "engagement",
        message: "إضافة كلمات غير موجودة. انتبه للنص المكتوب.",
        priority: "medium",
      });
    }

    if (gaps.problemWords.length > 0) {
      recs.push({
        category: "accuracy",
        message: `راجع هذه الكلمات تحديدًا: ${gaps.problemWords.slice(0, 3).join("، ")}`,
        priority: "medium",
      });
    }

    if (mastery.level === "MASTERED") {
      recs.push({
        category: "engagement",
        message: "ممتاز! انتقلت لمستوى الإتقان. جرّب نصًا أصعب.",
        priority: "low",
      });
    } else if (mastery.level === "NEEDS_SUPPORT") {
      recs.push({
        category: "engagement",
        message: "تحتاج دعم إضافي. تمرّن يومياً على النصوص القصيرة.",
        priority: "high",
      });
    }

    if (mastery.trend === "down") {
      recs.push({
        category: "engagement",
        message: "لاحظنا تراجع في مستواك. خذ استراحة وارجع للنصوص الأسهل.",
        priority: "high",
      });
    }

    return recs;
  }

  getTopPriority(recs: Recommendation[], limit: number = 3): Recommendation[] {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return recs
      .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
      .slice(0, limit);
  }
}
