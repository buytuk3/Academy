# Legacy Migrations (001 → 007) — FROZEN HISTORY

> **الحالة:** تاريخ مجمّد (Legacy). غير قابلة للتطبيق على PostgreSQL فارغة — **ممنوع تشغيلها**.
> المسار القانوني الحالي: `packages/database/migrations/0000_core18_canonical_baseline.sql` + `drizzle-kit migrate` (انظر `docs/decisions/ADR-001-R008-MIGRATION-STRATEGY.md`).

## لماذا صارت Legacy؟ (أدلة جنائية، CORE-17/CORE-18)

سلسلة `001→007` هي schema محرك القراءة القديم (v4.0، ما قبل دمج C-01) وتفشل على قاعدة فارغة:

| الملف | الخطأ الحرفي (`ON_ERROR_STOP=1`) |
|---|---|
| `002_add_refresh_rotation.sql:11` | `ERROR: relation "refresh_tokens" does not exist` |
| `003_evidence.sql:40` (والسطر 11 `REFERENCES tenants(id)`) | `ERROR: relation "tenants" does not exist` |
| `004_evidence_idempotency.sql:11` | `ERROR: relation "evidence" does not exist` |
| `005_event_outbox.sql:30` | `ERROR: relation "tenants" does not exist` |
| `006_learning_loop.sql:26` | `ERROR: relation "tenants" does not exist` |
| `007_teacher_decision.sql:10` | `ERROR: relation "intervention_proposals" does not exist` |

النتيجة على قاعدة فارغة: 14 جدولًا legacy فقط، وصفر جداول منصة. كما أن **10 جداول من الـ schema القانوني بلا أي تغطية SQL**:
`tenants, schools, classes, reading_sessions, evidence_items, refresh_tokens, gaps, remediation_plans, remediation_activities, impact_measurements`

والجداول المشتركة مشوهة الشكل: `users(id SERIAL, username, …)` بدل UUID + tenant_id، و`students(user_id INTEGER NOT NULL)`، و`reports.overall_score REAL NOT NULL` (يناقض قرار «لا درجة كلية»).

## لماذا لم تُصلَح تدريجيًا؟
الإصلاح التدريجي يتطلب إعادة كتابة `001` نفسه (تشويه تاريخ) واختراع ~10 migrations رجعية لـ schema **لم يُنشر قط** (لا توجد أي بيئة طبّقت السلسلة — أول تشغيل فعلي لقاعدة حقيقية كان CORE-17 عبر drizzle push).

## القواعد
1. **ممنوع** تعديل هذه الملفات أو حذفها — تاريخ Git محفوظ عبر `git mv` (تحقق: `git log --follow legacy/001_initial.sql`).
2. **ممنوع** تطبيقها على أي قاعدة.
3. أي بيئة مستقبلية طُبّق عليها جزء منها: تُسجَّل baseline يدويًا في `meta/_journal.json` قبل أول `drizzle-kit migrate` (انظر ADR-001 §Rollback).
