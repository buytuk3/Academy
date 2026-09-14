# ACR-E5-001 — P1: واجهة الطالب كعميل رقيق فوق القدرات القائمة + كشف metadata السؤال في عقود القراءة

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)


**التاريخ:** 2026-09-14 · **الفرع:** `p1-student-ui` (من `main @ 50f73ff`) · **الحالة:** معتمد تنفيذيًا (قرار المالك: P1 — Real Student Product) · **المرجع:** DOCUMENT-V1-COMPLIANCE-AUDIT (UI Coverage = 0%)

## السياق
التدقيق أثبت: النواة التعليمية كاملة على مستوى API (13/14 حلقة Real) لكن **UI = 0%** — لا يوجد أي تطبيق واجهة. قرار المالك: بناء Student UI فعلي كعميل للقدرات الحالية — لا منطق تعليمي ثانٍ، لا بيانات وهمية، أي صفحة غير مدعومة تُعلن بوضوح.

## القرارات

### 1. تقنية الواجهة — Substitute مقصود (MVP)
وثيقة v1.0.0 سمّت Next.js 14. المعمار الحالي لا يملك أي UI build system، وهدفنا «طالب حقيقي يتعلم من المتصفح» لا مطابقة أسماء التقنيات (معيار المالك الصريح). القرار: **SPA صفرية البناء (vanilla JS + CSS) تقدمها نفس عملية الـ API الحقيقية** (`express.static`) — العميل يستهلك `/v1` فقط بلا أي منطق مجال (لا حساب نتائج، لا درجات، لا توصيات داخل الواجهة — كل شيء من الـ APIs). الترحيل إلى Next.js لاحقًا لا يغيّر أي عقد.

### 2. كشف `metadata` في عقود القراءة — إضافة لا كسر
- **المشكلة:** سؤال النشاط الحقيقي (نص السؤال/التعبير) يسكن في `exercise_definitions.metadata` (عمود قائم) ويُكتب عبر `POST /v1/exercises` (الـ schema يقبل `metadata` وتمرره فعلاً)، لكن `toExerciseResponse`/`toContentResponse` + `ExerciseResponseSchema`/`ContentResponseSchema` + `lib/api-spec/v1.yaml` **لا يكشفونه للقراءة** — فلا يمكن للواجهة عرض السؤال دون اختراع بيانات.
- **القرار:** إضافة حقل `metadata` (record، اختياري) إلى استجابتي Content وExercise — **إضافة فقط** (لا تغيير حقول قائمة، لا هجرة، لا تغيير كتابة). المصدر يبقى القاعدة؛ الواجهة تعرض ما تعيده الـ APIs حرفيًا أو تعلن غيابه.

### 3. Remediation — قرار الـ MVP (إغلاق بند التدقيق PARTIAL)
فحص الكود (سلبي شامل): لا كاتب لجداول `remediation_plans`/`remediation_activities` (الاستخدام الوحيد تعريف الـ schema). المسار القائم — توصية مشتقة من الأدلة → `nextActivity` في الـ Dashboard → فتح النشاط → إعادة المحاولة → تحسن مُثبت (core-31) — **يُعتمد MVP كافٍ** لحلقة الطالب. بناء كاتب علاج رسمي مؤجل لقرار مستقبلي (نمط ACR-E4-001)؛ لا نظام ثانٍ الآن.

### 4. إثبات E2E بمتصفح حقيقي
معيار المالك: Browser → Login → … → Improvement على النظام الحقيقي. القرار: Playwright + Chromium ضد الخادم الحقيقي (PG + Redis حقيقيان — نمط core-31: المحاكاة فقط عند مآخذ مزودي القراءة الخارجيين المعتمدين). إن تعذر تثبيت متصفح في البيئة، يُعلن ذلك صراحة ولا يُدّعى إثبات متصفح.

## حدود
لا جداول جديدة، لا هجرات، لا منطق تعليمي في الواجهة، لا بيانات hardcoded. أنشطة VOICE (القراءة) في الواجهة تُعرض بحالة «غير مدعومة في الواجهة بعد» بلا ادعاء — إرسال القراءة يبقى عبر المسار الحالي المثبت (core-26/31).
