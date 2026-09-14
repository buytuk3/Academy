# TRACEABILITY_MATRIX — Buytuk Academy
## مصفوفة التتبع | ربط المتطلبات بالكود والاختبارات

---

```
الإصدار : 1.0.0
التاريخ  : 2026-07-18
الغرض   : إذا تغيّر متطلب واحد — تعرف فوراً ما الملفات التي يجب تعديلها
القانون : أي متطلب جديد يُضاف هنا قبل الكود
```

> **"الكود الذي لا يُتتبَّع إلى متطلب — كود بلا سبب."**

---

## كيف تقرأ هذا الملف

```
REQ-ID  : رقم المتطلب الفريد
الوصف   : ما الذي يجب أن يحدث؟
الفئة   : Functional | Non-Functional | Security | Business
المحرك  : أي Intelligence Engine مرتبط؟
API     : الـ Endpoint المرتبط
DB      : الجدول أو الجداول المرتبطة
Frontend: الملفات أو المكونات في school-platform
Backend : الملفات في api-server
Tests   : معرفات الاختبارات المرتبطة
الحالة  : ✅ مكتمل | ⏳ قيد التطوير | ❌ غير مبدوء | 🔄 يحتاج مراجعة
```

---

## قسم 1: متطلبات المصادقة والصلاحيات (AUTH)

| REQ-ID | الوصف | API | DB | Frontend | Backend | Tests | الحالة |
|--------|-------|-----|-----|---------|---------|-------|--------|
| AUTH-001 | تسجيل دخول بالبريد وكلمة المرور | POST /api/auth/login | users | AuthScreen.tsx | auth.routes.ts | E2E-01 | ⏳ |
| AUTH-002 | إصدار JWT Access + Refresh Token | POST /api/auth/login | — | AuthScreen.tsx | auth.routes.ts | INT-AUTH-001 | ⏳ |
| AUTH-003 | تجديد Token تلقائياً | POST /api/auth/refresh | — | api-client | auth.routes.ts | INT-AUTH-002 | ❌ |
| AUTH-004 | تسجيل خروج وإلغاء Token | POST /api/auth/logout | — | AuthScreen.tsx | auth.routes.ts | INT-AUTH-003 | ❌ |
| AUTH-005 | معلم لا يصل لبيانات مدرسة أخرى | كل endpoint | tenant_id | — | rbac.middleware.ts | INT-RBAC-001 | ⏳ |
| AUTH-006 | ولي الأمر يرى بيانات ابنه فقط | GET /api/users/:id | parent_id | ParentPortal.tsx | rbac.middleware.ts | INT-RBAC-002 | ⏳ |

---

## قسم 2: متطلبات محرك القراءة (READING)

| REQ-ID | الوصف | API | DB | Frontend | Backend | Tests | الحالة |
|--------|-------|-----|-----|---------|---------|-------|--------|
| READ-001 | تسجيل جلسة قراءة (3 معايير) | POST /api/reading-sessions | reading_sessions | TeacherReadingPanel.tsx | reading.routes.ts | E2E-01, INT-READ-001 | ⏳ |
| READ-002 | حساب overall_score = avg(3 معايير) | — | — | — | readingCalculator.ts | UNIT-READ-001 | ✅ |
| READ-003 | تصنيف الأداء تلقائياً | — | — | — | readingCalculator.ts | UNIT-READ-002 | ✅ |
| READ-004 | عرض سجل جلسات طالب | GET /api/reading-sessions/student/:id | reading_sessions | StudentReadingPanel.tsx | reading.routes.ts | INT-READ-002 | ⏳ |
| READ-005 | تحليل AI للجلسة (اختياري) | POST /api/ai/analyze | — | TeacherReadingPanel.tsx | ai.routes.ts | INT-AI-001 | ⏳ |

---

## قسم 3: متطلبات محرك الإملاء (DICTATION)

| REQ-ID | الوصف | API | DB | Frontend | Backend | Tests | الحالة |
|--------|-------|-----|-----|---------|---------|-------|--------|
| DICT-001 | تسجيل جلسة إملاء | POST /api/dictation-sessions | dictation_sessions | TeacherDictationPanel.tsx | dictation.routes.ts | INT-DICT-001 | ⏳ |
| DICT-002 | حساب overall_score = avg(spelling, listening) | — | — | — | dictationCalculator.ts | UNIT-DICT-001 | ✅ |
| DICT-003 | عرض سجل الطالب | GET /api/dictation-sessions/student/:id | dictation_sessions | StudentDictationPanel.tsx | dictation.routes.ts | INT-DICT-002 | ⏳ |

---

## قسم 4: متطلبات محرك الكتابة (WRITING)

| REQ-ID | الوصف | API | DB | Frontend | Backend | Tests | الحالة |
|--------|-------|-----|-----|---------|---------|-------|--------|
| WRIT-001 | تسجيل جلسة كتابة (4 معايير) | POST /api/writing-sessions | writing_sessions | TeacherWritingPanel.tsx | writing.routes.ts | INT-WRIT-001 | ⏳ |
| WRIT-002 | حساب overall_score = avg(4 معايير) | — | — | — | writingCalculator.ts | UNIT-WRIT-001 | ✅ |
| WRIT-003 | عرض سجل الطالب | GET /api/writing-sessions/student/:id | writing_sessions | StudentWritingPanel.tsx | writing.routes.ts | INT-WRIT-002 | ⏳ |

---

## قسم 5: متطلبات محرك النطق (PRONUNCIATION)

| REQ-ID | الوصف | API | DB | Frontend | Backend | Tests | الحالة |
|--------|-------|-----|-----|---------|---------|-------|--------|
| PRON-001 | تسجيل جلسة نطق (3 معايير) | POST /api/pronunciation-sessions | pronunciation_sessions | TeacherPronunciationPanel.tsx | pronunciation.routes.ts | INT-PRON-001 | ⏳ |
| PRON-002 | حساب overall_score = avg(clarity, fluency, intonation) | — | — | — | pronunciationCalculator.ts | UNIT-PRON-001 | ✅ |
| PRON-003 | عرض سجل الطالب | GET /api/pronunciation-sessions/student/:id | pronunciation_sessions | StudentPronunciationPanel.tsx | pronunciation.routes.ts | INT-PRON-002 | ⏳ |

---

## قسم 6: متطلبات محرك الطلاقة والتفكير (FLUENCY)

| REQ-ID | الوصف | API | DB | Frontend | Backend | Tests | الحالة |
|--------|-------|-----|-----|---------|---------|-------|--------|
| FLUE-001 | تسجيل جلسة طلاقة وتفكير (3 معايير) | POST /api/fluency-thinking-sessions | fluency_thinking_sessions | TeacherFluencyThinkingPanel.tsx | fluencyThinking.routes.ts | INT-FLUE-001 | ⏳ |
| FLUE-002 | حساب overall_score = avg(expression, coherence, depth) | — | — | — | fluencyThinkingCalculator.ts | UNIT-FLUE-001 | ✅ |
| FLUE-003 | عرض سجل الطالب | GET /api/fluency-thinking-sessions/student/:id | fluency_thinking_sessions | StudentFluencyThinkingPanel.tsx | fluencyThinking.routes.ts | INT-FLUE-002 | ⏳ |

---

## قسم 7: متطلبات محرك سلوك التعلم (LEARNING BEHAVIOR)

| REQ-ID | الوصف | API | DB | Frontend | Backend | Tests | الحالة |
|--------|-------|-----|-----|---------|---------|-------|--------|
| LBEH-001 | تسجيل جلسة سلوك التعلم | POST /api/learning-behavior-sessions | learning_behavior_sessions | TeacherLearningBehaviorPanel.tsx | learningBehavior.routes.ts | INT-LBEH-001 | ⏳ |
| LBEH-002 | حساب overall_score = avg(participation, focus, consistency) | — | — | — | learningBehaviorCalculator.ts | UNIT-LBEH-001 | ✅ |
| LBEH-003 | عرض سجل الطالب | GET /api/learning-behavior-sessions/student/:id | learning_behavior_sessions | StudentLearningBehaviorPanel.tsx | learningBehavior.routes.ts | INT-LBEH-002 | ⏳ |

---

## قسم 8: متطلبات طبقة الإتقان (MASTERY)

| REQ-ID | الوصف | API | DB | Frontend | Backend | Tests | الحالة |
|--------|-------|-----|-----|---------|---------|-------|--------|
| MAST-001 | حساب MasteryRecord بعد كل جلسة | تلقائي | mastery_records | TeacherMasteryPanel.tsx | mastery.routes.ts | UNIT-MAST-001 | ✅ |
| MAST-002 | عرض تاريخ الإتقان للطالب | GET /api/mastery/student/:id | mastery_records | StudentMasteryPanel.tsx | mastery.routes.ts | INT-MAST-001 | ⏳ |
| MAST-003 | مقارنة الإتقان عبر الزمن | GET /api/mastery/student/:id/history | mastery_records | TeacherMasteryPanel.tsx | mastery.routes.ts | INT-MAST-002 | ❌ |

---

## قسم 9: متطلبات التشخيص (DIAGNOSTICS)

| REQ-ID | الوصف | API | DB | Frontend | Backend | Tests | الحالة |
|--------|-------|-----|-----|---------|---------|-------|--------|
| DIAG-001 | اكتشاف فجوة تلقائياً عند جلستين < 60 | تلقائي | learning_gaps | TeacherDiagnosticsPanel.tsx | diagnostics.routes.ts | UNIT-DIAG-001 | ✅ |
| DIAG-002 | اكتشاف فجوة حرجة فورياً عند < 30 | تلقائي | learning_gaps | TeacherDiagnosticsPanel.tsx | diagnostics.routes.ts | UNIT-DIAG-002 | ✅ |
| DIAG-003 | تصنيف شدة الفجوة (Critical/Moderate/Minor) | تلقائي | learning_gaps | TeacherDiagnosticsPanel.tsx | diagnostics.routes.ts | UNIT-DIAG-003 | ✅ |
| DIAG-004 | عرض الفجوات النشطة للطالب | GET /api/diagnostics/student/:id | learning_gaps | TeacherDiagnosticsPanel.tsx | diagnostics.routes.ts | INT-DIAG-001 | ⏳ |
| DIAG-005 | تنبيه المعلم بالفجوة الجديدة | Notification | — | TeacherPortal.tsx | — | — | ❌ |

---

## قسم 10: متطلبات العلاج (REMEDIATION)

| REQ-ID | الوصف | API | DB | Frontend | Backend | Tests | الحالة |
|--------|-------|-----|-----|---------|---------|-------|--------|
| REMED-001 | اقتراح بروتوكول علاج مناسب | POST /api/remediation/assign | remediation_assignments | TeacherRemediationPanel.tsx | remediation.routes.ts | UNIT-REMED-001 | ✅ |
| REMED-002 | موافقة المعلم على العلاج قبل تطبيقه | POST /api/remediation/assign | remediation_assignments | TeacherRemediationPanel.tsx | remediation.routes.ts | INT-REMED-001 | ⏳ |
| REMED-003 | تتبع تقدم الطالب في خطة العلاج | PATCH /api/remediation/:id/progress | remediation_assignments | TeacherRemediationPanel.tsx | remediation.routes.ts | INT-REMED-002 | ⏳ |
| REMED-004 | إغلاق الفجوة بعد اكتمال العلاج | PATCH /api/diagnostics/gaps/:id | learning_gaps | TeacherRemediationPanel.tsx | remediation.routes.ts | INT-REMED-003 | ⏳ |

---

## قسم 11: متطلبات قياس الأثر (IMPACT)

| REQ-ID | الوصف | API | DB | Frontend | Backend | Tests | الحالة |
|--------|-------|-----|-----|---------|---------|-------|--------|
| IMP-001 | حساب Before/After Score تلقائياً | تلقائي عند إغلاق العلاج | impact_measurements | TeacherImpactPanel.tsx | impact.routes.ts | UNIT-IMP-001 | ✅ |
| IMP-002 | تصنيف الأثر (Significant/Moderate/Minimal) | تلقائي | impact_measurements | TeacherImpactPanel.tsx | impact.routes.ts | UNIT-IMP-002 | ✅ |
| IMP-003 | تقرير جودة المدرسة | GET /api/impact/school/:id | impact_measurements | PrincipalImpactReport.tsx | impact.routes.ts | INT-IMP-001 | ⏳ |

---

## قسم 12: متطلبات غير وظيفية (NON-FUNCTIONAL)

| REQ-ID | الوصف | الملف المرجعي | الهدف | Tests | الحالة |
|--------|-------|--------------|-------|-------|--------|
| PERF-001 | API response < 200ms (p95) | QUALITY_ATTRIBUTES.md | < 200ms | PERF-TEST-001 | ❌ |
| PERF-002 | Page load < 3 ثوانٍ | QUALITY_ATTRIBUTES.md | < 3s | PERF-TEST-002 | ❌ |
| SEC-001 | HTTPS إلزامي في الإنتاج | QUALITY_ATTRIBUTES.md | — | SEC-TEST-001 | ❌ |
| SEC-002 | Rate limiting على جميع الـ Endpoints | QUALITY_ATTRIBUTES.md | 100 req/min | INT-SEC-001 | ❌ |
| SEC-003 | لا PII في الـ Logs | QUALITY_ATTRIBUTES.md | — | لا آلي | ❌ |
| AVAIL-001 | Uptime ≥ 99% | QUALITY_ATTRIBUTES.md | 99% | MONITOR-001 | ❌ |
| PRIV-001 | Tenant isolation كامل | QUALITY_ATTRIBUTES.md | 0 cross-tenant | INT-RBAC-001 | ⏳ |

---

## ملخص الحالة الحالية

```
إجمالي المتطلبات : 51
✅ مكتمل         : 12 (Unit Tests تعمل — منطق الحساب)
⏳ قيد التطوير   : 27 (يحتاج توصيل قاعدة البيانات أولاً)
❌ غير مبدوء     : 12 (متطلبات لاحقة)

الانتباه الفوري:
← AUTH-001 + AUTH-002 (تسجيل الدخول) يفتح الباب لكل ⏳
← إصلاح TD-001 + TD-002 يُحوِّل ⏳ → ✅
```

---

## إجراءات الصيانة

```
عند إضافة متطلب جديد:
1. أضف سطراً في الجدول المناسب
2. حدد الملفات المرتبطة قبل كتابة الكود
3. اكتب معرف الاختبار المخطط

عند تغيير متطلب موجود:
1. ابحث عن REQ-ID في الجدول
2. افتح جميع الملفات المرتبطة
3. عدّل وتحقق
4. حدّث الحالة

عند حذف متطلب:
1. لا تحذف السطر — علّم عليه بـ ~~strikethrough~~
2. اشرح السبب في الملاحظات
3. ابحث عن الكود المرتبط وقرر إبقاءه أو حذفه
```

---

*"أي كود لا يُتتبَّع إلى متطلب — اسأل: لماذا يوجد؟"*
