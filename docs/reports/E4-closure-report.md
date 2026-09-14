# تقرير إغلاق E4/P0 — Student Learning Loop (CORE-31) + ACR-E4-002

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)


**التاريخ:** 2026-09-13 · **الفرع:** `e4-p0-student-loop` → مدموج `main` بـ `--no-ff`

## النطاق المنفذ (محور Lesson Runtime)
- **Lesson Runtime:** `GET /v1/lessons` + `GET /v1/lessons/:lessonId` — اكتشاف الدروس المنشورة وفتح الدرس مع تمارينه المرتبطة (ربط `content_id` القائم) — صفر جداول جديدة.
- **Student Dashboard:** `GET /v1/students/{id}/dashboard` — تجميعة قراءة واحدة: نموذج المتعلم + التقدم (SLR) + الإتقان (SELECT فقط فوق `mastery_records`) + التوصيات والنشاط التالي + آخر الأنشطة — بلا overallScore/student_level.
- **Mastery View:** `packages/database/src/reading/mastery-read.ts` — `listMasteryRecords` (قراءة فقط؛ الكاتب الوحيد يبقى معالج القراءة) — التعميم موثق بقرار **ACR-E4-001 (PENDING)**.

## الإثبات
- E2E على `core31_verify`: **7/7** — الدورة الكاملة: درس → محاولة بخطأ حقيقي (FINAL_ANSWER_ERROR) → دليل → فجوة → توصية علاجية → إعادة → تحسن strong/IMPROVING → صف إتقان PROGRESSING/85 من الكاتب الحقيقي → قرار تعلم تالٍ مُعاد اشتقاقه + الحزمة الأمنية (IDOR/نطاق/عبر-مستأجر/UUID شاذ/بلا توكن).
- **ACR-E4-002 (إغلاق الجولة الشاملة):** اكتُشف أثناء التحقق النهائي خرق حد ملكية CORE-05 (المعالج يستعلم `evidenceTable` مباشرة). الإصلاح: قدرة قراءة قياسية `findEvidenceByOperationKey` في core-platform + Green Sweep لبنية الاختبارات (حصر 6 إعدادات vitest بملكيتها + حذف 5 استيرادات `reflect-metadata` شاردة + تحديث mock). **الجولة النهائية: 609 اختبارًا أخضر فريدًا + TSC شامل EXIT=0 + Drift PASS (EXIT=0) + Secret Scan نظيف.**

## الالتزام والدمج
- الالتزام الأصلي `a533cd4` فُقد ككائن git أثناء انقطاع الجلسة؛ أُعيد بناؤه حرفيًا من الشجرة الحية (نفس المحتوى) كالتزام `a8d35d499ec11c7a6119a9dc2e481d1caada9a12` — الوسم `core31-e4-p0-student-loop`.
- الدمج على `main`: `990e725421982f0c98486bd4d6232f9e84a1dd38` — الشجرة نظيفة (0).
- إصلاحان نوعيان اكتشفهما TSC الحي أثناء إعادة البناء (استيراد مكرر + قائمة بيضاء لحالة المحتوى) — لا تغيير سلوك.

## الملفات
- `apps/api/src/v1/lessons.ts` (جديد) · `apps/api/src/v1/students.ts` (dashboard +66) · `apps/api/src/v1/index.ts` (+2)
- `packages/database/src/reading/mastery-read.ts` (جديد) · `packages/database/src/index.ts` (تصديرا القارئ)
- `docs/decisions/ACR-E4-001-MASTERY-WRITE-GENERALIZATION.md` + `docs/decisions/ACR-E4-002-CORE05-BOUNDARY-TESTINFRA.md`
- `tests/core-31/` (E2E + config) · إصلاحات ACR-E4-002 (15 ملفًا)

## الحدود
Mastery Write يبقى Reading-only (ACR-E4-001 PENDING). mockLLMCall خارج النطاق (P1). لا جداول/هجرات/عقود جديدة.
