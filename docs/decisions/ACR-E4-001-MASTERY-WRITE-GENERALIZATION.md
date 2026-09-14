# ACR-E4-001 — تعميم كتابة الإتقان (Mastery Write) على كل المحركات — PENDING APPROVAL

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)


- **الحالة:** ⏳ PENDING — مقدَّم كقرار مستقل؛ **لم يُنفَّذ** في P0 (وفق توجيه صاحب القرار: «إذا كان التعميم يحتاج ACR، قدّمه كقرار منفصل قبل تنفيذه»).
- **التاريخ:** 2026-09-13
- **الأساس المثبت:** `mastery_records` جدول قائم (migration 0000:213؛ schema/reading.ts:92؛ unique على student+passage) وكاتبه **الوحيد** اليوم هو معالج القراءة `analyze.processor.ts:203–219` (upsert `onConflictDoUpdate`). قدرة القراءة الجديدة `listMasteryRecords` (E4) SELECT فقط.

## 1. المشكلة
دورة التعلم المستهدفة تنتهي بـ «Mastery → Next Learning Decision» لكل المهارات، لكن الكاتب الحالي مرتبط بمسار القراءة فقط (passageId FK). Numeracy/Assessment/Dictation تنتج أدلة حقيقية دون صف إتقان.

## 2. الخيارون

| الخيار | الوصف | الأثر |
|---|---|---|
| أ — **قدرة إتقان عامة في packages/database** (موصى به) | `upsertMasteryRecord(tenantId, studentId, refType, refId, level, score, attempts, trend)` فوق الجدول القائم مع توسيع مرجع الإتقان (إضافة عمودين nullable: `ref_type`/`ref_id` بجانب passage_id عبر migration واحدة صغيرة) | migration واحدة؛ يتطلب رفع العمود المرجعي للفهارس؛ يستوعب كل المحركات بلا نظام ثانٍ |
| ب — كاتب داخل كل محرك | كل محرك يكتب صفه بنفسه | يكرر المنطق في 4 مواضع؛ خطر انحراف |

## 3. التوصية
الخيار (أ): قدرة واحدة في packages/database تستدعيها محركات الاستدعاء (المحاور الثلاثة المعتمدة: worker / sync submit / مسار القرار) بعد نجاح القياس — استئناف نفس نمط ACR-E1-001 (فشل الإتقان لا يُفشل الطلب؛ إعادة التشغيل معرِّفة).

## 4. ماذا يتطلب
- Migration واحدة (عمودان nullable + فهرس) — **يمنعها قيد «لا Migrations» الحالي حتى يُرفع**.
- بوابة E2E: صف إتقان واحد لكل (طالب، مرجع) بعد إعادة التشغيل؛ لا درجة كلية.

## 5. القرار المطلوب
اعتماد الخيار (أ) وتوقيت التنفيذ (P1 مقترح) — أو تأجيله؛ عرض الإتقان في P0 يعمل اليوم بصفوف القراءة الحقيقية كما هي.
