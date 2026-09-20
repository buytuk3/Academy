// ============================================================
// Buytuk Academy — Drizzle Schema
// يعكس DATABASE_CATALOG.md بالكامل
// ============================================================

export * from "./tenants";
export * from "./users";
export * from "./identity";
export * from "./organization";
export * from "./schools";
export * from "./staff";
export * from "./membership";
export * from "./sessions";
export * from "./gaps";
export * from "./system";
export * from "./reading";
export * from "./evidence";
export * from "./events";
export * from "./learning-loop";
export * from "./parents";
export * from "./content-library";
export * from "./activity-state";
export * from "./engagement";

// PHASE-15 — school onboarding + teacher assignment (§3.1/§3.2)
export * from "./onboarding.js";

// PHASE-16 — interaction events (§3.3)
export * from "./interaction-events.js";

// PHASE-17 — provisional-advance mastery model (§3.4)
export * from "./provisional-advance.js";

// PHASE-18 — spaced-review engine (§3.5)
export * from "./spaced-review.js";

// PHASE-19 — cross-stage escalation engine (§3.6)
export * from "./escalation.js";

// PHASE-20 — grammar-parsing engine (§3.7)
export * from "./grammar.js";

// PHASE-21 — exam-behavioral analytics (§3.9)
export * from "./exam-analytics.js";

// PHASE-22 — video-lesson content (§3.8)
export * from "./video.js";

// PHASE-23 — engagement extras (§5.2.3/§3.10)
export * from "./engagement-extras.js";

// PHASE-24 — notifications (§5.2.4)
export * from "./notifications.js";
