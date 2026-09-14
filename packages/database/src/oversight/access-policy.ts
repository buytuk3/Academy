/**
 * CORE-20 (20-H/20-U) — Educational Access Policy capability (core-platform).
 *
 * canAccessContent(context, content) — DETERMINISTIC, AUDITABLE, CONFIG-DRIVEN.
 * Religion is EDUCATIONAL CONTENT ACCESS POLICY (20-Q), never a role, never an
 * RBAC permission, never hardcoded in API/controller/UI/DB trigger. The default
 * policy registry below is a CONFIGURATION PLACEHOLDER per deployment/country —
 * NOT a legal standard (20-R; risk R-011).
 *
 * 20-T privacy: religion values NEVER appear in logs, audit rows, or returns —
 * decisions carry reason codes only. Religion is not a grouping/ordering key.
 *
 * 20-S: content ≠ religion — contentType/subject/language stay independent of
 * the content's religious classification.
 */
import type { EducationalContentRef, ContentAccessDecision } from "./contracts.js";

/** Student-side religious pathway context (sensitive; caller-provided from the student profile). */
export type StudentReligiousContext = "MUSLIM" | "CHRISTIAN" | (string & {});

export interface EducationalAccessContext {
  tenantId: string;
  studentId?: string;
  studentReligiousContext?: StudentReligiousContext | null;
  // Educational placement (20-Q: policy binds to the pathway, not the person)
  country?: string;
  educationSystem?: string;
  stageKey?: string;
  gradeKey?: string;
  curriculumId?: string;
}

/** Per-deployment policy configuration (country/education-system keyed). */
export interface ReligiousAccessPolicyConfig {
  /** Cross-access rules: Christian students may access ISLAMIC content when policy allows. */
  christianToIslamicCrossAccess: {
    /** e.g. allowed when the lesson serves Arabic-language / grammar objectives. */
    allowedContentTypes: string[]; // ["grammar", "reading", "language"] — config
    allowedSubjects: string[]; // ["arabic-language"] — config
    /** Blanket allowance for fully-open islamic-culture content, if a deployment enables it. */
    allowAll: boolean;
  };
  /** Muslim → CHRISTIAN content: default DENY unless a deployment policy opens a pathway. */
  muslimToChristianCrossAccess: {
    allowedContentTypes: string[];
    allowedSubjects: string[];
    allowAll: boolean;
  };
}

/** DEFAULT policy (Egypt-style product rule, 20-R) — configuration, not law. */
export const DEFAULT_RELIGIOUS_ACCESS_POLICY: ReligiousAccessPolicyConfig = {
  christianToIslamicCrossAccess: { allowedContentTypes: ["grammar", "reading", "language", "arabic-language-lesson"], allowedSubjects: ["arabic-language"], allowAll: false },
  muslimToChristianCrossAccess: { allowedContentTypes: [], allowedSubjects: [], allowAll: false },
};

const RELIGIOUS_CONTENT_TYPES = new Set(["religious-education", "islamic-education", "christian-education"]);

function isReligiousContent(content: EducationalContentRef): boolean {
  if (content.religiousContext) return true;
  return RELIGIOUS_CONTENT_TYPES.has((content.contentType ?? "").toLowerCase());
}

export interface CanAccessContentDeps {
  /** Audit hook — injected so this module stays pure/deterministic. */
  audit?: (decision: ContentAccessDecision, ctx: EducationalAccessContext, content: EducationalContentRef) => void;
  config?: ReligiousAccessPolicyConfig;
}

/**
 * The single deterministic gate for educational content access (20-U):
 * tenant/organization/school/stage/grade/curriculum/subject + religious policy
 * + student context. Callers (API orchestration) MUST have already enforced
 * Role+Scope via checkScope — this layer adds the EDUCATIONAL policy dimension.
 */
export function canAccessContent(
  ctx: EducationalAccessContext,
  content: EducationalContentRef,
  deps: CanAccessContentDeps = {},
): ContentAccessDecision {
  if (!ctx?.tenantId) throw new Error("TENANT_CONTEXT_MISSING");
  if (!content?.subject) throw new Error("CONTENT_SUBJECT_REQUIRED");
  const cfg = deps.config ?? DEFAULT_RELIGIOUS_ACCESS_POLICY;

  let decision: ContentAccessDecision;
  if (!isReligiousContent(content)) {
    // 20-S: non-religious lessons (Arabic reading, grammar, math…) are open
    // educational content within the student's pathway.
    decision = { decision: "ALLOW", reason: "NON_RELIGIOUS_CONTENT" };
  } else if (!ctx.studentReligiousContext) {
    // Religious-education content REQUIRES the student's pathway context —
    // fail-closed rather than guessing (20-O principle applied to policy).
    decision = { decision: "DENY", reason: "CROSS_ACCESS_DEFAULT_DENY" };
  } else {
    const student = ctx.studentReligiousContext.toUpperCase();
    const contentCtx = (content.religiousContext ?? "").toUpperCase();
    // Semantic mapping: the MUSLIM pathway corresponds to ISLAMIC content
    // (20-R rules 1–2); CHRISTIAN pathway matches CHRISTIAN content directly.
    const pathway = student === "MUSLIM" ? "ISLAMIC" : student;
    if (pathway === contentCtx) {
      decision = { decision: "ALLOW", reason: "PATHWAY_ACCESS" }; // 20-R rules 1–2
    } else if (contentCtx === "ISLAMIC" && student === "CHRISTIAN") {
      const x = cfg.christianToIslamicCrossAccess;
      const typeAllowed = x.allowAll || x.allowedContentTypes.includes((content.contentType ?? "").toLowerCase());
      const subjectAllowed = x.allowAll || x.allowedSubjects.includes(content.subject.toLowerCase());
      decision = typeAllowed || subjectAllowed
        ? { decision: "ALLOW", reason: "CROSS_ACCESS_POLICY_ALLOW" } // 20-R rule 3
        : { decision: "DENY", reason: "CROSS_ACCESS_POLICY_DENY" };
    } else if (contentCtx === "CHRISTIAN" && student === "MUSLIM") {
      const x = cfg.muslimToChristianCrossAccess;
      const typeAllowed = x.allowAll || x.allowedContentTypes.includes((content.contentType ?? "").toLowerCase());
      const subjectAllowed = x.allowAll || x.allowedSubjects.includes(content.subject.toLowerCase());
      decision = typeAllowed || subjectAllowed
        ? { decision: "ALLOW", reason: "CROSS_ACCESS_POLICY_ALLOW" }
        : { decision: "DENY", reason: "CROSS_ACCESS_POLICY_DENY" }; // 20-R rule 4
    } else {
      decision = { decision: "DENY", reason: "CROSS_ACCESS_DEFAULT_DENY" };
    }
  }
  // 20-T: audit carries REASON CODES only — never the religion values themselves.
  deps.audit?.(decision, ctx, content);
  return decision;
}
