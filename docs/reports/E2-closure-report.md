# تقرير إغلاق E2 — Learner Model API (CORE-29)

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)

**تاريخ الإغلاق: 2026-09-13 — كل الأرقام من أوامر حية**

## 1) الهدف
وصل قدرة `buildLearnerModel` (CORE-09 — إسقاط قراءة فقط بلا أي تخزين) بسطح HTTP حقيقي: `GET /v1/students/{studentId}/learner-model` مع RBAC وعزل الطالب/المستأجر والخصوصية — إغلاق البند 26 من سجل الفجوات.

## 2) الالتزام والوسم
- الالتزام: `e2b5479fc81f9bda09948981c1c2869a67bba97b` (core-29-e2-learner-model) — 4 ملفات، +410/−2
- الوسم: `core29-e2-learner-model` → نفس الـ SHA (lightweight)
- **الدمج على `main` (بقرار صاحب القرار): `--no-ff` ناجح بلا تعارض — SHA الاندماج: `490887fb7c54bdabc46a6d1f78cc6973e1e90066`، الحالة بعده نظيفة (0)**

## 3) المنفذ
1. **المُحوّل** `toLearnerModelResponse` (mappers.ts، +83): شكل مسطّح بنمط `toEvidenceResponse` — تواريخ ISO، camelCase، بلا أي درجة كلية.
2. **المسار** في `students.ts` (+27/−2): نفس `resolveStudent` حرفيًا (طالب = نفسه فقط؛ موظف = `assertStudentDetailAccess`) + حاجز UUID في المحوّل (شاذ → 400، لا 500).
3. قاعدة مخصصة `core29_verify` (db-migrate → 35 جدولًا) + حزمة `tests/core-29/` (config + 10 اختبارات).

## 4) البوابات (تشغيل حي بعد الدمج على `main @ 490887f`)
| البوابة | النتيجة |
|---|---|
| TSC — 11 حزمة | 11/11 TSC_OK |
| core-29 E2E | **10/10** |
| core-28 E2E (دورة E1 الكاملة) | **11/11** |
| الانحدار core-17→26 | 209/209 |
| core-27 / core-07 | 31/31 · 31/31 |
| numeracy / assessment / config | 41/41 · 37/37 · 11/11 |
| **المجموع الأخضر (بلا ازدواج)** | **381/381** |
| Schema Drift / Secret Scan | PASS · نظيف |

## 5) ما يثبته الـ E2E (HTTP حقيقي، بلا mocks)
- الطالب يقرأ موديله: `reading/accuracy=weak`، `mathematics/numeracy=strong`، `dictation/accuracy=insufficient` + `trend: INSUFFICIENT_EVIDENCE` (عدم الكفاية قيمة من الدرجة الأولى)؛ تفسير المعلّم خارجي منفصل (`TEACHER`، لا يمس `RULE`)؛ **`overallScore`/`student_level` غائبان كليًا عن الاستجابة**.
- الحتمية: استدعاءان ⇒ `dimensions` متطابقة تمامًا (فقط `builtAt` يتقدم).
- الحالة المحدثة: 3 أدلة جديدة ⇒ `sampleCount:6`، `trend: IMPROVING`، `recentMean > olderMean`، `level: strong` — إسقاط لحظي بلا store.
- عزل المستأجر: موديل B صفر مراجع من A و`numeracy=insufficient` (لا تسريب).
- RBAC والسلبيات: معلم داخل CLASS=200 · خارج النطاق=403 · عبر المستأجر=404 (بلا تسريب وجود) · طالب لغيره=403 · UUID شاذ=400 · بلا توكن=401.
- ملاحظة أمانة: تشغيل أول فشل 401 بسبَب fixture (بريد يُولَّد جديدًا كل استدعاء) — أُصلح في ملف الاختبار فقط، لا كود إنتاج.

## 6) الأثر المعماري
صفر Schema/Migrations · صفر عقود · صفر كاتب أدلة ثانٍ · صفر منطق حلقة بديل — Teacher Gate وEvidence Ownership وR-027-05 وV-3 غير ممسوسة. استيراد القدرة المُصدَّرة وحده.

## 7) المتبقي
E3 Dictation Runtime Proof · E4 UI · G5 (008/007/013 + بنية) · Production Launch Gate (قرار مستقل). تحديث عقد OpenAPI (v1.yaml) GAP توثيقي مستقل (سابقة E1/E2: المسارات بنمط insights).
