# MODULE_REGISTRY — Buytuk Academy
## سجل الوحدات | كل Module في مكان واحد

---

```
الإصدار : 1.0.0
التاريخ  : 2026-07-18
الغرض   : مرجع واحد لحالة كل Module، مالكه، تبعياته، وخطة تطويره
```

---

## محركات الذكاء (Intelligence Engines)

### MOD-001 — Reading Engine
```
الاسم       : Reading Intelligence Engine
الوصف       : يقيس الفهم القرائي والطلاقة والدقة
الحالة      : Stable ✅
الإصدار     : v1.0
المالك      : Learning Team
يعتمد على   : Evidence Layer, Mastery Engine
يستخدمه     : Teacher Portal (Reading Panel), Student Portal
API Routes  : POST /api/reading-sessions
              GET  /api/reading-sessions/student/:id
DB Tables   : reading_sessions, mastery_records
Calculator  : artifacts/api-server/src/services/readingCalculator.ts
الإصدار القادم: v2 — إضافة معيار الفهم العميق (Phase P-1)
ملاحظات     : أول محرك يُختبَر في Pilot
```

### MOD-002 — Dictation Engine
```
الاسم       : Dictation Intelligence Engine
الوصف       : يقيس الإملاء (spelling) والاستماع (listening comprehension)
الحالة      : Stable ✅
الإصدار     : v1.0
المالك      : Learning Team
يعتمد على   : Evidence Layer, Mastery Engine
يستخدمه     : Teacher Portal (Dictation Panel), Student Portal
API Routes  : POST /api/dictation-sessions
              GET  /api/dictation-sessions/student/:id
DB Tables   : dictation_sessions, mastery_records
Calculator  : artifacts/api-server/src/services/dictationCalculator.ts
الإصدار القادم: v2 — دعم لغات إضافية (Phase P-2)
```

### MOD-003 — Writing Engine
```
الاسم       : Writing Intelligence Engine
الوصف       : يقيس 4 معايير: coherence, vocabulary, grammar, mechanics
الحالة      : Stable ✅
الإصدار     : v1.0
المالك      : Learning Team
يعتمد على   : Evidence Layer, Mastery Engine
يستخدمه     : Teacher Portal (Writing Panel), Student Portal
API Routes  : POST /api/writing-sessions
              GET  /api/writing-sessions/student/:id
DB Tables   : writing_sessions, mastery_records
Calculator  : artifacts/api-server/src/services/writingCalculator.ts
الإصدار القادم: v2 — AI rubric scoring (Phase P-2)
```

### MOD-004 — Pronunciation Engine
```
الاسم       : Pronunciation Intelligence Engine
الوصف       : يقيس الوضوح والطلاقة الصوتية والتنغيم
الحالة      : Stable ✅
الإصدار     : v1.0
المالك      : Learning Team
يعتمد على   : Evidence Layer, Mastery Engine
يستخدمه     : Teacher Portal (Pronunciation Panel), Student Portal
API Routes  : POST /api/pronunciation-sessions
              GET  /api/pronunciation-sessions/student/:id
DB Tables   : pronunciation_sessions, mastery_records
Calculator  : artifacts/api-server/src/services/pronunciationCalculator.ts
الإصدار القادم: v2 — Speech-to-text integration (Phase G-0)
```

### MOD-005 — Fluency & Thinking Engine
```
الاسم       : Fluency & Critical Thinking Engine
الوصف       : يقيس التعبير الشفهي والتماسك الفكري وعمق التحليل
الحالة      : Stable ✅
الإصدار     : v1.0
المالك      : Learning Team
يعتمد على   : Evidence Layer, Mastery Engine
يستخدمه     : Teacher Portal (Fluency Panel), Student Portal
API Routes  : POST /api/fluency-thinking-sessions
              GET  /api/fluency-thinking-sessions/student/:id
DB Tables   : fluency_thinking_sessions, mastery_records
Calculator  : artifacts/api-server/src/services/fluencyThinkingCalculator.ts
الإصدار القادم: v2 — ربط بمعايير التفكير النقدي الدولية (Phase G-0)
```

### MOD-006 — Learning Behavior Engine
```
الاسم       : Learning Behavior Intelligence Engine
الوصف       : يقيس المشاركة والتركيز والاستمرارية في التعلم
الحالة      : Stable ✅
الإصدار     : v1.0
المالك      : Learning Team
يعتمد على   : Evidence Layer, Mastery Engine
يستخدمه     : Teacher Portal (Behavior Panel), Student Portal
API Routes  : POST /api/learning-behavior-sessions
              GET  /api/learning-behavior-sessions/student/:id
DB Tables   : learning_behavior_sessions, mastery_records
Calculator  : artifacts/api-server/src/services/learningBehaviorCalculator.ts
الإصدار القادم: v2 — ربط بأنماط التعلم (Learning Styles)
```

---

## محركات التحليل (Analysis Engines)

### MOD-007 — Mastery Engine
```
الاسم       : Mastery Computation Engine
الوصف       : يجمع أدلة جلسات المحركات ويحسب مستوى الإتقان
الحالة      : Stable ✅
الإصدار     : v1.0
المالك      : Analytics Team
يعتمد على   : جميع محركات الذكاء (MOD-001 → MOD-006)
يستخدمه     : Diagnostics Engine, Teacher Portal, Student Portal
API Routes  : GET /api/mastery/student/:id
              GET /api/mastery/student/:id/history
DB Tables   : mastery_records
Calculator  : artifacts/api-server/src/services/masteryCalculator.ts
```

### MOD-008 — Diagnostics Engine
```
الاسم       : Learning Gap Diagnostics Engine
الوصف       : يفحص MasteryRecords ويكتشف الفجوات التعلمية
الحالة      : Stable ✅
الإصدار     : v1.0
المالك      : Analytics Team
يعتمد على   : Mastery Engine (MOD-007)
يستخدمه     : Remediation Engine, Teacher Portal, Principal Portal
API Routes  : GET /api/diagnostics/student/:id
              GET /api/diagnostics/school/:id/gaps
DB Tables   : learning_gaps
الإصدار القادم: v2 — Pattern recognition (متى تحدث الفجوات) مع AI
```

### MOD-009 — Remediation Engine
```
الاسم       : Remediation Planning Engine
الوصف       : يقترح بروتوكولات علاج مناسبة لكل نوع فجوة
الحالة      : Stable ✅
الإصدار     : v1.0
المالك      : Analytics Team
يعتمد على   : Diagnostics Engine (MOD-008)
يستخدمه     : Teacher Portal, Impact Engine
API Routes  : POST /api/remediation/assign
              PATCH /api/remediation/:id/progress
DB Tables   : remediation_assignments
```

### MOD-010 — Impact Engine
```
الاسم       : Learning Impact Measurement Engine
الوصف       : يقيس الأثر الفعلي لكل تدخل علاجي
الحالة      : Stable ✅
الإصدار     : v1.0
المالك      : Analytics Team
يعتمد على   : Remediation Engine (MOD-009), Mastery Engine (MOD-007)
يستخدمه     : Teacher Portal, Principal Portal, Admin Portal
API Routes  : GET /api/impact/student/:id
              GET /api/impact/school/:id
DB Tables   : impact_measurements
```

---

## وحدات البنية التحتية (Infrastructure Modules)

### MOD-011 — AI Layer
```
الاسم       : AI Integration Layer
الوصف       : واجهة موحدة لاستدعاء نماذج الذكاء الاصطناعي
الحالة      : Partial ⚠️ (MockAdapter في الإنتاج)
المالك      : Platform Team
يعتمد على   : Gemini API (خارجي)
يستخدمه     : جميع محركات الذكاء (اختياري)
TD Reference : TD-004 (يحتاج GEMINI_API_KEY حقيقي)
```

### MOD-012 — Auth Module
```
الاسم       : Authentication & Authorization Module
الوصف       : JWT authentication + RBAC middleware
الحالة      : Partial ⚠️ (Backend جاهز — Frontend غير موصول)
المالك      : Platform Team
TD Reference : TD-002 (يحتاج ربط بالواجهة)
```

### MOD-013 — Database Module
```
الاسم       : Database Access Layer
الوصف       : Drizzle ORM + PostgreSQL schema + migrations
الحالة      : Ready (Schema كامل — لا DB حقيقية في الإنتاج)
المالك      : Platform Team
TD Reference : TD-001 (يحتاج DATABASE_URL حقيقي)
```

---

## ملخص الحالة

```
✅ Stable   : 10 وحدات (MOD-001 → MOD-010)
⚠️ Partial  :  3 وحدات (MOD-011, MOD-012, MOD-013)
❌ Planned  :  0 وحدات

الأولوية الفورية:
   MOD-013 → MOD-012 → MOD-011
   (DB أولاً، ثم Auth، ثم AI)
```

---

*"سجل الوحدات يُجيب على: ما الذي يعتمد على ماذا — قبل أي تعديل."*
