# تقرير إغلاق P1 — Student Web UI (CORE-32) + ACR-E5-001

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)


**التاريخ:** 2026-09-14 · **الفرع:** `p1-student-ui` (من `main @ 50f73ff`) · **الالتزام:** `43c42a6cc52f753cca10168f60d4dc2606b6efe9` · **الوسم:** `core32-p1-student-ui`

## النطاق المنفذ (Core First → Real Student Product)

### 1. واجهة الطالب — عميل رقيق صفرية البناء (ACR-E5-001)
- `apps/api/src/public/` (index.html + styles.css + app.js): بوابة طالب عربية RTL كاملة — دخول (هوية رسمية + سياق مستأجر) → لوحة (تقدم حقيقي/قوة/ضعف/فجوات/إتقان/توصيات/نموذج متعلم) → فتح الدرس → تنفيذ النشاط → إرسال المحاولة → النتيجة → إعادة (Remediation MVP).
- تُقدم من **عملية الـ API الحقيقية نفسها** (`express.static` على `/ui` + الجذر `/` في `app.ts`) — نفس الأصل، نفس حمايات helmet/rate-limit. **صفر بيانات وهمية**: كل قيمة تُعرض تأتي حرفيًا من `/v1`؛ أنشطة VOICE تُعلن «غير مدعومة في الواجهة بعد»؛ لا منطق تعليمي داخل الواجهة إطلاقًا.
- **Substitute مقصود** لـ Next.js في الـ MVP (لا UI build system قائم) — ترحيل لاحق لا يغير أي عقد.

### 2. كشف `metadata` في عقود القراءة — إضافي بحت (لا كسر عقد)
- `mappers.ts` + `lib/api-zod/src/v1-schemas.generated.ts` + `lib/api-spec/v1.yaml`: حقل `metadata` (اختياري/nullable) في استجابتي Content وExercise — نص السؤال الحقيقي المُحاور من المعلم (المكتوب فعلاً في `exercise_definitions.metadata` عبر `POST /v1/exercises`) أصبح يصل الواجهة بدل اختراع بيانات.

### 3. قرار Remediation (بند التدقيق PARTIAL)
فحص كودي شامل: لا كاتب لجداول `remediation_plans/activities`. **اعتماد الـ MVP القائم**: توصية مشتقة من الأدلة → `nextActivity` → فتح النشاط → إعادة → تحسن — مُثبت بالمتصفح الحقيقي (P1-5). الكاتب الرسمي مؤجل لقرار مستقبلي (نمط ACR-E4-001).

## الإثبات الحي
- **E2E المتصفح الحقيقي (core-32): 5/5** — Playwright Chromium (v1243 مثبت فعليًا + اعتمادياته النظامية) يقود الدورة كاملة على **PG حقيقي (core32_verify: 35 جدولًا) + Redis حقيقي + HTTP حقيقي** — لا أي API mocks:
  - P1-1 دخول حقيقي → لوحة بحسابات حقيقية (صفر مصطنع) · P1-2 هوية خاطئة → خطأ حقيقي بلا جلسة مزيفة · P1-3 Dashboard API بلا توكن → 401 · P1-4 السؤال الحقيقي المُحاور يُعرض حرفيًا · P1-5 **الدورة الكاملة**: نشاط خاطئ (91≠92 → FINAL_ANSWER_ERROR عبر المحرك الحقيقي) → EVIDENCE_RECORDED → لوحة بأدلة حقيقية → إعادة بإجابة صحيحة (15=15) → **strong/improving في نموذج المتعلم الحقيقي**.
- **بوابات الإغلاق:** TSC شامل EXIT=0 · انحدار core-25→31 = **98/98 على قواعد نظيفة حديثة الإنشاء** · Schema Drift **PASS** (`db-push-verify` → `schema-drift-check`، EXIT=0) · Secret Scan نظيف · الحزم (config 11/11 + curriculum 18/18).

## الملفات
- جديد: `apps/api/src/public/` (3) · `tests/core-32/` (2) · `docs/decisions/ACR-E5-001-P1-STUDENT-UI-THIN-CLIENT.md`
- معدل: `apps/api/src/app.ts` (تقديم الواجهة) · `apps/api/src/v1/mappers.ts` · `lib/api-zod/src/v1-schemas.generated.ts` · `lib/api-spec/v1.yaml` (metadata) · package.json/pnpm-lock (playwright devDep)

## الأثر المعماري
صفر جداول جديدة، صفر هجرات، صفر تغيير كتابة قائم. العقود أُضيف إليها حقل قراءة اختياري فقط. UI Coverage: **0% → مغطاة وظيفيًا** (دورة الطالب الكاملة من المتصفح)؛ Learning Loop: **13/14 → مُثبتة 14/14 من المتصفح** (Remediation كـ MVP).

## الحدود
أنشطة VOICE/القراءة في الواجهة: غير مدعومة بعد (تُعلن صراحة). ترحيل Next.js: مؤجل. واجهات المعلم/ولي الأمر: لم تبدأ. mockLLMCall/Inference: P2 التالي.
