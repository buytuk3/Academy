# ADR-003 — Child Data Retention & Deletion Policy (FUTURE — مسجل بطلب المالك، غير محسوم)

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)


- الحالة: FUTURE / PROPOSED-PLACEHOLDER (مسجل بطلب المالك في قرار R-009 — **لا تنفيذ ولا حسم قانوني الآن**)
- التاريخ: 2026-09-09
- المصدر: تعليمات المالك («ثامنًا — Child Data / Retention: سجلوا ADR مستقبلي مستقل… ولا تحسموا المتطلبات القانونية عالميًا داخل R-009»)

## النطاق المستقبلي (استعداد معماري فقط — بلا تنفيذ)
عند كتابة هذا الـ ADR لاحقًا يجب أن يغطي:
1. **Retention policies** لكل نوع بيانات (Evidence، Audio، SLR، Reports، Audit).
2. **Deletion requests** (حق المحو) وأثرها على Evidence immutable (حذف منطقي/إخفاء مقابل حذف فيزيائي).
3. **Guardian consent** — نموذج الموافقة وربطها بـ `consentRef` (تمهيد موجود في ADR-002 §student_history_shares).
4. **Jurisdiction differences** — اختلاف القواعد بين الدول/المناطق (EG/SA/UK/…).
5. **School/Tenant ownership** — من يقرر الاحتفاظ داخل حدود ملكية الـ tenant (بلا كسر العزل).
6. **Auditability** — كل قرار احتفاظ/حذف قابل للتدقيق عبر `audit_logs` القائمة.

## القيود المعتمدة سلفًا (تبقى قيدًا على أي تصميم مستقبلي)
- Evidence immutable وtenant-owned (ADR-002) — أي حذف يجب ألا يكسر العزل أو يعيد كتابة التاريخ للآخرين.
- الصوت خارج مسار المشاركة دائمًا (ADR-002) ومخزّن مشفرًا AES-256-GCM في Object Storage (CORE-17) — سياسة الـ retention الخاصة به تُحسم هنا أولًا.
- لا جدول/بنية جديدة قبل اعتماد هذا الـ ADR.

## القاعدة الآن
لا توجد سياسة قانونية منفذة ولا معتمدة — أي حاجة ظاهرة قبل اكتمال هذا الـ ADR = `ARCHITECTURE DECISION REQUIRED` (مسجل R-010 في سجل المخاطر).
