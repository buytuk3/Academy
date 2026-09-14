# ACR-E4-002 — استعادة حد ملكية CORE-05 + تصحيح بنية الاختبارات (Green Sweep)

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)


**التاريخ:** 2026-09-13 · **الفرع:** `main` (بعد دمج E4/P0 `990e725`) · **الحالة:** منفذ ومُثبت

## السياق
أثناء جولة التحقق الشاملة لإغلاق E4/P0 اكتُشفت أربعة عيوب مجمّعة:

1. **خرق حد الملكية CORE-05 (الجوهري):** كتلة تقارب إعادة التشغيل R-026-05 في
   `engines/reading-engine/src/queue/workers/analyze.processor.ts` كانت تستعلم
   `evidenceTable` مباشرة من `@workspace/db` — والمحركات ممنوعة من لمس تخزين
   الأدلة مباشرة (الكاتب `recordEvidence` والقارئ هما السطحان القانونيان).
   الخرق تسلل مع core-26c قبل توسيع اختبار الملكية ليشمل السطر الجديد.
2. **نطاقات vitest غير محصورة:** ستة إعدادات (`packages/config`، `packages/observability`،
   `packages/security`، `apps/api`، `apps/worker`، `engines/reading-engine`) بلا
   `test.include` فتسحب اختبارات المستودع كلها (فشل تحميل زائف بأعداد وهمية).
3. **تبعية غير معلنة:** `import "reflect-metadata"` شارد في 5 ملفات اختبار بحزمة
   `packages/database` — لا decorators في الشيفرة ولا إعلان في أي package.json.
4. **mock أقدم من البوابة:** mock الـ db في اختبار CORE-03A لا يعرف سلسلة
   `where().limit()` لبوابة التقارب R-026-05.

## القرار
- **قدرة قراءة قياسية جديدة في core-platform:** `findEvidenceByOperationKey({ tenantId, operationKey })`
  في `packages/database/src/evidence/evidence-reader.ts` (مُصدَّرة من `@workspace/db`) —
  حل الدليل بالمعرّف أصبح رَسميًا يُستهلك عبر القارئ لا عبر الجدول.
- المعالج يستهلك القدرة الجديدة؛ حُذف استيراد `evidenceTable` و`and` من المحرك.
- حصر الستة إعدادات بملكيتها بالنمط القانوني (نمط numeracy: `test.include` + env صريح).
- حذف الاستيرادات الشاردة الخمسة؛ تحديث mock CORE-03A إلى thenable شامل.

## الإثبات (أوامر حية على `main`)
- TSC شامل `--build --force`: EXIT=0 (كل الحزم).
- الجولة الشاملة **609 اختبارًا أخضر فريدًا**: انحدار core-17→26 (209) + core-27 (31)
  + core-28 (11) + core-29 (10) + core-30 (6) + core-31 (7) + الحزم (208 تشمل
  learning-loop/core-07 31 وdatabase 55) + المحركات (122: numeracy 41، assessment 37،
  reading 16، dictation 28) + التطبيقان (5). اختبارا queue الاثنان متروكان مقصودًا.
- Schema Drift: PASS عبر `db-push-verify.mjs` ثم `schema-drift-check.mjs` (EXIT=0،
  صفر انحراف صلب، فروق CHECK المصنفة كمتوقعة فقط).
- Secret Scan: نظيف (لا مفاتيح AWS، لا مفاتيح خاصة، لا .env متعقب).

## الأثر المعماري
صفر جداول جديدة، صفر هجرات، صفر تغيير عقود. حد الملكية CORE-05 صار مُنفَّذًا فعليًا
لا بمطالبة اختبار فقط: المحرك يقرأ الدليل عبر core-platform حصريًا.
