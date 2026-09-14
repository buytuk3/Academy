# ADR-001 — R-008: Migration Strategy (Re-baseline the SQL chain onto the Canonical Drizzle Schema)

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)


- الحالة: ACCEPTED — منفذ ومثبت عمليًا (2026-09-09): Empty DB → migrate → drift-check = صفر فرق → CORE-17 runtime 32/32 على القاعدة المبنية بالـ migrations. الإغلاق النهائي بقرار المالك.
- التاريخ: 2026-09-09
- Baseline: `aa6a989261f16db536a6351fe226f5559817430a` (CORE-17 معتمد، dirty=0)
- المسجل: R-008 في `docs/ARCHITECTURE-RISK-REGISTER.md`
- القرارات ذات الصلة: ARCHITECTURE_CONTRACT.md §6 (Single Source of Truth في packages/database)، قرارات CORE-17 (F-03)

---

## 1. السياق (Context) — أدلة جنائية من HEAD `aa6a989` (كلها مخرجات أوامر فعلية هذا الدور)

### 1.1 ما هو الـ Canonical Schema الفعلي
المصدر القانوني الوحيد للـ schema هو ملفات Drizzle في `packages/database/src/schema/` (11 ملفًا: tenants, users, schools, sessions, reading, evidence, events, learning-loop, gaps, system, index). تطبيقها عبر `drizzle-kit push` على PostgreSQL حقيقي أنتج — وهذا ما شغّلت عليه اختبارات CORE-17 الـ 32 بنجاح:
- **26 جدولًا**: tenants, schools, classes, students, users, refresh_tokens, reading_sessions, evidence_items, attempts, passages, evidence, event_outbox, learning_diagnoses, intervention_proposals, learning_reassessments, learning_outcomes, gaps, remediation_plans, remediation_activities, impact_measurements, reports, phoneme_stats, mastery_records, exercise_assignments, audit_logs, api_keys
- **66 Foreign Key**، **54 فهرسًا**، وفهرس فريد `evidence_operation_key_uniq` (idempotency الأدلة)

### 1.2 الإثبات التجريبي لكسر سلسلة `001→007` على قاعدة فارغة
طبّقت السلسلة على قاعدة scratch فارغة بـ `ON_ERROR_STOP=1` — النتيجة المؤكدة مرتين:

| الملف | exit | الخطأ الحرفي |
|---|---|---|
| `001_initial.sql` (200 سطرًا) | 0 | ينشئ 14 جدولًا legacy فقط (users/students/… بمعرفات SERIAL) |
| `002_add_refresh_rotation.sql:11` | 3 | `ERROR: relation "refresh_tokens" does not exist` |
| `003_evidence.sql:40` | 3 | `ERROR: relation "tenants" does not exist` (والسطر 11: `tenant_id text NOT NULL REFERENCES tenants(id)`) |
| `004_evidence_idempotency.sql:11` | 3 | `ERROR: relation "evidence" does not exist` |
| `005_event_outbox.sql:30` | 3 | `ERROR: relation "tenants" does not exist` |
| `006_learning_loop.sql:26` | 3 | `ERROR: relation "tenants" does not exist` |
| `007_teacher_decision.sql:10` | 3 | `ERROR: relation "intervention_proposals" does not exist` |

**النتيجة على قاعدة فارغة: 14 جدولًا legacy فقط، وصفر جداول منصة (لا evidence، لا outbox، لا learning loop).**

### 1.3 مصفوفة التغطية (drift محسوب بالـ grep على ملفات الـ migrations)
من الـ 26 جدولًا القانونيًا، **10 جداول بلا أي تغطية SQL إطلاقًا**:
`tenants, schools, classes, reading_sessions, evidence_items, refresh_tokens, gaps, remediation_plans, remediation_activities, impact_measurements`

والـ 16 جدولًا "المغطاة" مشوهة الشكل على الأسماء المشتركة — `001_initial.sql` هو schema محرك القراءة القديم v4.0 (ما قبل C-01 merge) بنموذج بيانات مختلف جوهريًا:
- `users`: السلسلة `id SERIAL (integer), username, password_hash, role VARCHAR(20)` — القانوني `id text (UUID), tenant_id NOT NULL, email UNIQUE, is_active, role enum`
- `students`: السلسلة `user_id INTEGER NOT NULL REFERENCES users(id)` — القانوني `tenant_id + class_id NOT NULL + student_code` (ملكية tenant)
- `reports`: السلسلة تفرض `overall_score REAL NOT NULL` — **يناقض قرار "لا درجة كلية" المعتمد**

### 1.4 غياب Journal
لا يوجد `meta/` ولا جدول تتبع للـ migrations المطبقة — لا شيء يسجل ماذا طُبق وأين. (اكتشاف: `ls packages/database/migrations/meta` → NO meta dir).

### 1.5 حالة النشر
لا توجد بيئة إنتاج ولا قاعدة "حقيقية منشورة" طبّقت السلسلة يومًا (Production = OPEN في كل تقرير إغلاق منذ CORE-08؛ أول تشغيل فعلي لقاعدة حقيقية كان CORE-17 — عبر drizzle push وليس السلسلة). **السلسلة المكسورة لم تُنتج أي قاعدة قائمة في أي مكان.**

---

## 2. القرار (Decision)

### AD-008-1 — التفرد
`packages/database/src/schema/*.ts` (Drizzle) هو **المصدر القانوني الوحيد** للـ schema (تمشية §6). أي SQL يدوي خارج مسار التوليد ممنوع.

### AD-008-2 — إعادة Baseline واحدة (Squash-and-Replace) لا "إصلاح" للسلسلة
توليد `001_baseline.sql` **آليًا** من الـ schema القانوني عبر `drizzle-kit generate` (لا كتابة يدوية)، ليصبح أول migration في سلسلة journaled تُطبَّق بـ **`drizzle-kit migrate`** (transactional، مسجل في `__drizzle_migrations`).
- **ممنوع `drizzle-kit push` كمسار Production** (قرار المالك) — push أداة dev/diff بلا journal ولا auditability؛ يبقى مسموحًا في التطوير المحلي وفحوص CI فقط.
- السبب: إصلاح السلسلة تدريجيًا (البديل A) يتطلب إعادة كتابة `001` نفسه (تشويه تاريخ) + اختراع ~10 migrations رجعية لجداول بلا تغطية — وكل ذلك من أجل schema قديم لم يُنشر قط.

### AD-008-3 — الحفاظ على التاريخ (بلا إخفاء)
الملفات القديمة `001→007` تُنقل بـ `git mv` إلى `packages/database/migrations/legacy/` مع `README-legacy.md` يوثق: تاريخها، سبب الإيقاف، والإثبات الجنائي أعلاه. Git history محفوظ (rename detection)، لا حذف ولا rewrite.

### AD-008-4 — عقد النشر والتحقق (CI Gate)
1. `drizzle-kit migrate` على قاعدة فارغة يجب أن يصل إلى schema **مطابق تمامًا** لنتيجة push: فحص آلي `schema-drift-check` يقارن (tables, columns, FKs, indexes) بين قاعدة مبنية بالـ migrations وقاعدة مبنية بالـ push — **صفر فرق = PASS**.
2. اختبارات CORE-17 الـ 32 تُشغَّل على قاعدة مبنية بالـ migrations (وليس push) كجزء من الـ regression.

### AD-008-5 — المسار المستقبلي
كل تغيير schema قادم: تعديل Drizzle → `drizzle-kit generate` → مراجعة SQL المولد → commit الاثنين معًا. ممنوع تعديل ملفات SQL يدويًا، وممنوع أي destructive change (drop/rename) إلا بـ ADR صريح.

---

## 3. النموذج النصي (Deployment Flow)

```
مطور يعدل packages/database/src/schema/*.ts
        │
        ▼
drizzle-kit generate ──► migrations/00N_*.sql (مولّد آليًا + مراجعة بشرية)
        │                         │
        ▼                         ▼
git commit (schema + sql معًا — لا فرق بينهما أبدًا)
        │
        ▼ (نشر / CI)
drizzle-kit migrate ──► __drizzle_migrations (journal: ما طُبق، متى، بأي ترتيب)
        │
        ▼
CI schema-drift-check: migrated_db == pushed_db ؟
   ├─ نعم → PASS → تشغيل CORE-17 runtime suite (32) على القاعدة المهاجرة
   └─ لا  → FAIL → يمنع الدمج
```

## 4. الأثر (Impact)

| النطاق | الأثر |
|---|---|
| `packages/database` | إعادة هيكلة `migrations/` فقط (baseline جديد + legacy/ منقولة + README) + سكربت drift-check. **صفر تغيير** في ملفات schema أو client أو evidence/learner/slr code |
| Evidence | صفر — نفس الجدول والقيود والفهارس المتحقق منها في CORE-17 |
| SLR / Learner Model | صفر — projection قراءة فقط فوق نفس الأدلة |
| Tenant | صفر — جدول tenants كما هو (سيُنشأ هذه المرة فعليًا في أي قاعدة جديدة، وهو ما فشلت فيه السلسلة) |
| Auth | صفر منطق — refresh_tokens/users تُنشأ بالشكل القانوني (UUID + tenant_id) الذي يفترضه `DbRefreshStore` و`tokens.ts` أصلًا |

## 5. الملفات التي ستتغير (عند التفويض)
1. `packages/database/migrations/001_baseline.sql` (جديد — مولّد)
2. `packages/database/migrations/meta/_journal.json` (جديد — journal)
3. `packages/database/migrations/legacy/001→007 + README-legacy.md` (نقل git mv)
4. `packages/database/scripts/schema-drift-check.mjs` (جديد — CI gate)
5. `packages/database/package.json` (سكربتات db:migrate / db:generate / db:drift-check)
6. `docs/ARCHITECTURE-RISK-REGISTER.md` (تحديث R-008 بعد التنفيذ)
7. `docs/decisions/ADR-001…` (هذا الملف — الحالة تتحول PROPOSED→ACCEPTED)

## 6. Rollback والتحقق
- **Forward-only**: لا down-migrations؛ التراجع = استعادة نسخة احتياطية أو إعادة بناء من صفر (مقبول في هذه المرحلة: لا بيانات إنتاجية موجودة).
- **التحقق الإلزامي بعد التنفيذ**: (أ) قاعدة فارغة → migrate → drift-check = 0 فرق؛ (ب) CORE-17 runtime 32/32 على القاعدة المهاجرة؛ (ج) regression كامل exit 0؛ (د) `git status --porcelain` نظيف.

## 7. مخاطر جديدة
- **R-008-a**: مخرجات `generate` قد تحتاج مراجعة (enums/defaults) — mitigated: بوابة drift-check + مراجعة بشرية لكل SQL مولد.
- **R-008-b**: بيئة شطيرة طبّقت جزءًا من السلسلة القديمة — غير موجودة حاليًا (مثبت)، وإذا ظهرت: تسجيل baseline يدوي في journal قبل أول migrate.

## 8. البدائل المرفوضة
- **إصلاح تدريجي للسلسلة**: يعيد كتابة 001 (تشويه تاريخ) ويخترع ~10 migrations رجعية لـ schema لم يُنشر — تكلفة بلا قيمة.
- **push كمسار نشر**: ممنوع بقرارك، وبلا journal/audit.

---

## 9. سجل التنفيذ والإثبات العملي (2026-09-09 — مخرجات أوامر فعلية)

| الخطوة | الأمر/الإجراء | النتيجة |
|---|---|---|
| تجميد legacy | `git mv 001→007 → migrations/legacy/` + README جنائي → التزام `5cdd4b2` | `git log --follow legacy/001_initial.sql` = 3 التزامات (5cdd4b2 → 2fa4a43 → d713fe6) — **التاريخ محفوظ** |
| توليد baseline | `drizzle-kit generate` (v0.22.8) من `packages/database/src/schema/` | `0000_core18_canonical_baseline.sql` — 807 أسطر، **26 CREATE TABLE، 2 ENUM** (`user_role`,`plan_type`)، **22 فهرسًا + 66 FK**، **صفر destructive** (scan `DROP\|TRUNCATE` = 0). مراجعة يدوية: enums عبر `DO $$ … duplicate_object`، FK عبر `ALTER TABLE … ADD CONSTRAINT … ON DELETE cascade/restrict` |
| journal | `meta/_journal.json` | entry واحد: `0000_core18_canonical_baseline` (version 7) |
| Empty → migrate | `node scripts/db-migrate.mjs` (drizzle-orm migrator) على `core18_migrated` فارغة | `[db-migrate] OK`، **journal rows=1**، **26 جدولًا**، **66 FK**، `evidence_operation_key_uniq` موجود. (إشعار benign واحد: PostgreSQL قصّ اسم قيود > 63 حرفًا — truncation notice فقط، القيد أُنشئ 66/66) |
| **Drift check** | `node scripts/schema-drift-check.mjs <migrated> <pushed>` | **`[drift] PASS — Migration-built DB == Canonical Schema (zero differences)`: tables identical (26) · columns/types/nullability/defaults identical (294) · foreign_keys identical (66) · indexes identical (54) · unique_constraints identical (54)** — exit 0 |
| Runtime على المهاجرة | CORE-17 suite (32) بـ `CORE17_DB_URL=core18_migrated` | **32/32 passed, exit 0** — وأدلة سقطت فعليًا في القاعدة المهاجرة: evidence=30، outbox=17، outcome=1 |
| منع push | حذف سكربتَي `push`/`push-force` من `packages/database/package.json` | لا مسار npm-script لـ push إطلاقًا؛ يبقى CLI مباشر للتطوير المحلي فقط؛ CI يمنع الدمج عند أي drift |

**الأدوات الجديدة:** `scripts/db-migrate.mjs` (مسار Production/Staging/CI عبر drizzle migrator + journal) · `scripts/db-generate.mjs` (توليد آلي مع نسخة schema مؤقتة gitignored + حل binary من workspace) · `scripts/schema-drift-check.mjs` (بوابة CI خماسية المحاور). سكربتات: `db:migrate` / `db:generate` / `db:drift-check`.

**بيئة موجودة مستقبلًا (قبل baseline adoption):** تسجيل baseline يدويًا في `meta/_journal.json` (بدون تطبيق) ثم `migrate` للما بعده — موثق أيضًا في `legacy/README-legacy.md`.
