# P2_DATABASE_FORENSIC_REPORT.md

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)

## التقرير الجنائي لقاعدة البيانات — P2.0 Inventory · P2.1 Ownership/Conflict · P2.2 Canonical Proposal
**الإصدار:** P2‑FR‑1.0 · **التاريخ:** 2026‑09‑06 · **الحالة:** للاعتماد — **بحث فقط (Investigation)، لا دمج إضافي قبل القرار**

> ⚠️ **إفصاح إلزامي (Disclosure):** في الجولة السابقة — **قبل** صدور عقد التنفيذ هذا القاضي بـ«Investigation before Merge» — نُفّذت خطوات دمج فعلية على قاعدة البيانات (نقل `lib/db` → `packages/database` عبر `git mv`، توحيد schema، إنشاء tag `merge-p2`). هذا التقرير يوثّق **الحالة الفعلية الآن** (بما في ذلك ما نُفّذ سابقًا) مع **أوامر الرجوع الدقيقة** في §19، ولا يُنفَّذ أي دمج/حذف/هجرة إضافي بعد هذا التقرير حتى صدور قرارك: `APPROVE P2 MERGE` / `REQUEST CHANGES` / `STOP`.

---

## 1. Executive Summary

- المصدران الفعليان للـ DB: **(أ)** `artifacts/reading-engine/src/db` و**(ب)** `lib/db` (الذي نُقل في الجولة السابقة إلى `packages/database`).
- إجمالي الجداول الفعلية: **المصدر (أ) = 14 جدولًا** (schema محرك بمعرّفات serial) · **المصدر (ب) = 13 جدولًا** (schema موحّد بمعرّفات uuid/tenant) + **ملف `reading.ts` موحّد جديد (7 جداول قراءة)** أُنشئ في الجولة السابقة.
- **تعارضان رئيسيان:** C‑01 (users/students/audit_logs/teachers) و C‑04 (`sessions` مقابل `reading_sessions`). كلاهما مرشَّح كمقترح (Proposal) بانتظار الاعتماد — لم يُنفَّذ أي حذف نهائي.
- **Pool واحد فعلي:** `packages/database/src/client.ts` (postgres + drizzle) — لا `new Pool` ولا `new Client` في أي مكان آخر.
- **مستهلكو DB:** 5 ملفات محرك (`routes`, `socket`, `analyze.worker`, `index`, والشيم) + `api-server/src/routes/auth.ts`.
- **Zero‑Loss:** schema المحرك القديم **مطابق حرفيًا لـ pre‑merge** (SHA متطابق `7f9261…`)، والهجرة `001` مطابقة حرفيًا (SHA `a2fc60…`) — **لا فقدان وظيفة/بيانات** حتى الآن.
- **توصية للبوابة:** اعتماد المقترحات C‑01 + ADR‑008 كما هي في §6–§7، ثم السماح بمرحلة Merge الرسمية (P2.4→P2.9).

---

## 2. Before State (قبل أي دمج — من نقطة P0)

- نقطة التجميد: `git tag pre-merge` → commit `d713fe6` (148 ملفًا، snapshot `BuyTuk-Academy-pre-merge.zip` + `ZERO_LOSS_INVENTORY.sha256`).
- المصدر (أ) كان: `artifacts/reading-engine/src/db/{index.ts, schema.ts, migrations/001_initial.sql}` (14 جدولًا).
- المصدر (ب) كان: `lib/db/{package.json, tsconfig.json, drizzle.config.ts, src/index.ts, src/schema/{tenants,users,schools,sessions,gaps,system,index}.ts}` (13 جدولًا، **بدون migrations** — فحص P0 أثبت غياب دليل migrations في lib/db).

---

## 3. Database Inventory (جرد الجداول بالأدلة)

### 3.1 المصدر (أ) — `artifacts/reading-engine/src/db/schema.ts` (14 جدولًا — حرفي من pre‑merge)

| # | الجدول | المفتاح | أعمدة بارزة | قيود/فهارس | مرجع (سطر) |
|---|---|---|---|---|---|
| 1 | `users` | serial PK | username·passwordHash·role (default student)·createdAt·updatedAt | UNIQUE(username) via users_username_idx | schema.ts:19‑27 |
| 2 | `teachers` | serial PK | userId (FK→users **CASCADE**)·displayName·createdAt | UNIQUE(user_id) | schema.ts:31‑38 |
| 3 | `students` | serial PK | userId (FK→users **CASCADE**)·displayName·grade·nativeLanguage (default 'ar')·createdAt | UNIQUE(user_id) | schema.ts:41‑50 |
| 4 | `classrooms` | serial PK | teacherId (FK→teachers)·name·description·isActive·createdAt | idx(teacher_id) | schema.ts:53‑62 |
| 5 | `enrollments` | serial PK | classroomId (FK)·studentId (FK)·enrolledAt | UNIQUE(classroom, student) | schema.ts:65‑72 |
| 6 | `passages` | serial PK | teacherId (FK→teachers **NOT NULL**)·classroomId (FK nullable)·title·text·difficulty (default 1)·grade·isActive·createdAt | idx(teacher_id) | schema.ts:75‑87 |
| 7 | `sessions` | serial PK | studentId (FK→students)·passageId (FK→passages)·startedAt·endedAt (nullable)·isCompleted (default false) | idx(student), idx(passage) | schema.ts:90‑100 |
| 8 | `attempts` | serial PK | sessionId (FK→sessions)·studentId (FK)·passageId (FK)·audioKey·encryptedKey·transcript·durationSec·jobId·jobStatus (default 'pending')·correlationId·createdAt | idx(student), idx(session) | schema.ts:103‑119 |
| 9 | `reports` | serial PK | attemptId (FK→attempts **CASCADE**)·overallScore·accuracyScore·pronunciationScore·fluencyScore·prosodyScore·wpm·data (jsonb)·createdAt | UNIQUE(attempt_id) | schema.ts:122‑135 |
| 10 | `phoneme_stats` | serial PK | studentId (FK)·phoneme·totalOccurrences (default 0)·errors (default 0)·lastAttemptAt·updatedAt | UNIQUE(student, phoneme) | schema.ts:138‑148 |
| 11 | `mastery_records` | serial PK | studentId (FK)·passageId (FK)·level·score·attempts (default 1)·trend·updatedAt | UNIQUE(student, passage) | schema.ts:151‑162 |
| 12 | `exercise_assignments` | serial PK | studentId (FK)·attemptId (FK nullable)·exerciseId·reason·completedAt·createdAt | — | schema.ts:165‑173 |
| 13 | `audit_logs` | serial PK | userId (nullable)·action·resource·resourceId·metadata (jsonb)·ipAddress·userAgent·createdAt | idx(action), idx(user) | schema.ts:176‑189 |
| 14 | `api_keys` | serial PK | name·keyHash·userId (FK→users nullable)·expiresAt·lastUsedAt·createdAt | UNIQUE(key_hash) | schema.ts:192‑202 |

**Enums في (أ):** لا يوجد أي `pgEnum` (الأدوار نص حر varchar).

### 3.2 المصدر (ب) — `packages/database/src/schema/` (نُقل من `lib/db` + ملف موحّد جديد)

| # | الجدول | المفتاح | أعمدة بارزة | قيود/فهارس | مرجع (سطر) |
|---|---|---|---|---|---|
| 1 | `tenants` | text uuid PK | name·slug (UNIQUE)·planId (plan_type enum: starter/growth/school/district, default starter)·isActive·region·city·createdAt·updatedAt | UNIQUE(slug) | tenants.ts:3‑25 |
| 2 | `users` | text uuid PK | tenantId (FK→tenants **CASCADE**)·firstName·lastName·email (UNIQUE)·**username (مدمج من (أ) — nullable)**·passwordHash·role (user_role enum: admin/principal/teacher/student/parent, default teacher)·isActive·createdAt·updatedAt | UNIQUE(email) | users.ts:4‑33 |
| 3 | `schools` | text uuid PK | tenantId (FK CASCADE)·name·city·region·createdAt | — | schools.ts:4‑16 |
| 4 | `classes` | text uuid PK | tenantId (FK CASCADE)·schoolId (FK→schools CASCADE)·name·gradeLevel·section·academicYear·createdAt | — | schools.ts:19‑35 |
| 5 | `students` | text uuid PK | tenantId (FK CASCADE)·classId (FK→classes **RESTRICT**)·firstName·lastName·studentCode·**isActive (timestamp — شذوذ نوعي، يُرجَّح أنه كان يجب أن يكون boolean)**·createdAt | — | schools.ts:38‑53 |
| 6 | `reading_sessions` | text uuid PK | tenantId (FK CASCADE)·studentId (FK RESTRICT)·teacherId (FK→users RESTRICT)·sessionType (enum)·rawScore·fluencyScore·comprehensionScore·pronunciationScore·durationSeconds·status (enum)·notes·**startedAt·endedAt·isCompleted (مدمجة من (أ))**·createdAt·updatedAt | — | sessions.ts:13‑53 |
| 7 | `evidence_items` | text uuid PK | tenantId (FK CASCADE)·sessionId (FK→reading_sessions CASCADE)·evidenceType (enum)·value·notes·createdAt | — | sessions.ts:57‑79 |
| 8 | `gaps` | text uuid PK | tenantId (FK CASCADE)·studentId (FK RESTRICT)·domain (enum)·severity (enum)·evidenceScore·detectedAt·resolvedAt·status (enum) | — | gaps.ts:6‑40 |
| 9 | `remediation_plans` | text uuid PK | tenantId·studentId (FK RESTRICT)·gapId (FK RESTRICT)·planType (enum)·assignedTo (FK→users)·status (enum)·createdAt·completedAt | — | gaps.ts:42‑72 |
| 10 | `remediation_activities` | text uuid PK | planId (FK→remediation_plans CASCADE)·tenantId·activityType·description·completedAt·outcome (enum)·createdAt | — | gaps.ts:74‑93 |
| 11 | `impact_measurements` | text uuid PK | tenantId·studentId (FK RESTRICT)·gapId (FK RESTRICT)·measurementType·scoreBefore·scoreAfter·measuredAt | — | gaps.ts:97‑114 |
| 12 | `audit_logs` | text uuid PK | tenantId (FK nullable)·userId (FK nullable)·action·entityType·entityId·ipAddress·userAgent·meta (text/JSON)·createdAt | — | system.ts:5‑23 |
| 13 | `refresh_tokens` | text uuid PK | userId (FK→users CASCADE)·tenantId (FK CASCADE)·tokenHash (**UNIQUE**)·expiresAt·revokedAt·createdAt | UNIQUE(token_hash) | system.ts:26‑40 |
| 14‑20 | `reading.ts` (جديد موحّد): `passages`·`attempts`·`reports`·`phoneme_stats`·`mastery_records`·`exercise_assignments`·`api_keys` | text uuid PK + tenantId FK | نفس أعمدة القراءة من (أ) لكن بهوية uuid/tenant بدل serial | نفس القيود (UNIQUE attempt/student+phoneme/student+passage, indexes) | reading.ts |

**Enums في (ب):** `plan_type` (tenants.ts:3) · `user_role` (users.ts:4) + enums نصية inline (session_type, status, domain, severity, plan_type, outcome, evidence_type).

### 3.3 Migrations

| الهجرة | الموقع | الحجم | الحالة |
|---|---|---|---|
| `001_initial.sql` (من المحرك) | `packages/database/migrations/001_initial.sql` | 200 سطر (users→api_keys، 14 جدولًا) | **مطابقة حرفيًا لـ pre‑merge (SHA `a2fc60…` = PASS)** |
| Migrations لـ `lib/db` | — | — | **غير موجودة أصلًا** (فحص P0: لا دليل migrations في lib/db) |

### 3.4 DB Client / Pool

- **الوحيد الفعلي:** `packages/database/src/client.ts:15,25` → `const client = postgres(DATABASE_URL, {min,max,idle_timeout,connect_timeout})` + `export const db = drizzle(client, {schema, logger})`.
- **لا يوجد** `new Pool` / `new Client` / `postgres(` / `drizzle(` في أي ملف آخر (grep شامل = الموقعان فقط).

### 3.5 مستهلكو DB (كل موضع استيراد)

| الملف | الاستيراد | الجداول المستخدمة |
|---|---|---|
| `artifacts/reading-engine/src/http/routes.ts:9‑10` | `../db/index.js` | users (48), passages (101/116/124), sessions (137), attempts (146/164), reports (193/203) — **قراءة/كتابة** |
| `artifacts/reading-engine/src/realtime/socket.ts:11` | `../db/index.js` | sessions (insert 95), attempts (insert 100 / update 155), reports (select 204) — **قراءة/كتابة** |
| `artifacts/reading-engine/src/queue/workers/analyze.worker.ts:21` | `../../db/index.js` | reports (insert 150 / select 123‑125), masteryRecords (insert 162) |
| `artifacts/reading-engine/src/index.ts:8` | `./db/index.js` | closeConnection |
| `artifacts/reading-engine/src/db/index.ts:10` (الشيم) | `@workspace/db` + `./schema.js` | تصدير موحّد + جداول المحرك الانتقالية |
| `artifacts/api-server/src/routes/auth.ts:3‑4` | `@workspace/db` (الموحّد) | usersTable (select/insert 82‑99), refreshTokensTable (insert 60 / select 168 / update 185,221) |
| `artifacts/api-server/src/lib/auth.ts:29` | — | typing tenantId (لا DB) |

---

## 4. Schema Comparison (مقارنة الكيانات المتشابهة بالاسم والمعنى)

| الكيان | المصدر (أ) | المصدر (ب) | **هل نفس الكيان؟** | الفروق الجوهرية |
|---|---|---|---|---|
| users | serial PK · username · role نص حر · بلا tenant | uuid PK · tenantId FK · email+firstName+lastName · role enum · **username مدموج** | **لا — نموذجا هوية مختلفان** | (ب) موحّد بمعرّف uuid + نطاق tenant ويطابق العقد §16؛ (أ) بسيط بـ serial/username |
| students | serial PK · userId FK→users · displayName · grade · nativeLanguage | uuid PK · tenantId · classId FK→classes · firstName/lastName/studentCode · isActive (timestamp شاذ) | **لا — مختلفان جوهريًا** | (ب) profile معتمد على classId/tenant؛ (أ) مرتبط بـ userId serial — أعمدة displayName/grade/nativeLanguage غائبة في (ب) |
| teachers | جدول مستقل (userId FK→users) | **غير موجود كجدول** — المعلم = user بدور teacher | **نفس المفهوم، تنفيذ مختلف** | (ب) يمثل المعلم عبر roleEnum؛ (أ) جدول منفصل (orphan في الموحّد) |
| audit_logs | serial PK · userId int · action · resource/resourceId · metadata jsonb | uuid PK · tenantId · userId text · action · entityType/entityId · meta text | **نفس المفهوم، أعمدة مختلفة** | لا مستهلك يكتب أيهما حاليًا (جدول «صامت» — يطابق قلق العقد §14) |
| sessions / reading_sessions | sessions: serial · studentId/passageId · startedAt/endedAt/isCompleted | reading_sessions: uuid · tenantId/studentId/teacherId · sessionType/status/درجات · **مدمجة فيها startedAt/endedAt/isCompleted** | **نفس المفهوم (جلسات قراءة)** | الاسم canonical = `reading_sessions` (ADR‑008) — الفروق الجوهرية: نطاق tenant + حقول تقييم + درجات |

---

## 5. Conflict Map (خريطة التعارضات)

| ID | التعارض | المصدر (أ) | المصدر (ب) | نفس الكيان؟ | القرار المقترح | المستهلكون | Risk |
|---|---|---|---|---|---|---|---|
| C‑01a | users | users (serial) | usersTable (uuid/tenant) | لا | canonical = (ب) + **username مدمج** (تم) — إزالة جدول (أ) عند P4/P7 | routes.ts:48, api-server auth | متوسط (نموذجا هوية) |
| C‑01b | students | students (serial) | studentsTable (uuid/tenant) | لا | canonical = (ب) — نقل أعمدة (أ) المفقودة (displayName, grade, nativeLanguage) بمرحلة مخصصة | socket, routes, worker (عبر الشيم) | متوسط |
| C‑01c | teachers | teachers (جدول) | ممثل بـ role=teacher | لا (تنفيذ مختلف) | canonical = role على users؛ مراجعة مستهلكي teachers (routes.ts) عند الدمج | routes.ts | منخفض |
| C‑01d | audit_logs | audit_logs (serial) | auditLogsTable (uuid/tenant) | لا | canonical = (ب) — تفعيل Audit Pipeline (§14 العقد) — لا حذف قبل استهلاك فعلي | لا مستهلك | مرتفع (أمني/امتثالي) |
| C‑04 | sessions | sessions (serial) | reading_sessions (uuid) | **نعم (نفس المفهوم)** | canonical = `reading_sessions` + **ADR‑008** — شيم توافق مؤقت حتى P4 | socket.ts:95, routes.ts:137 | متوسط (هجرة أسماء) |
| C‑05 | classrooms/classes | classrooms (serial/tacherId) | classes (uuid/schoolId) | لا (أدوار مختلفة) | إبقاء الاثنين مؤقتًا؛ توحيد عبر ADR لاحق عند الحاجة | routes.ts:95 (classroomId query) | منخفض |
| C‑06 | migrations | 001 (engine) موجود | lib/db بلا migrations | — | مصدر واحد: packages/database/migrations (تم النقل — SHA متطابق) | drizzle.config | منخفض |
| C‑07 | isActive (students) | boolean | **timestamp** (شذوذ نوعي) | — | تصحيح إلى boolean عبر ADR في مرحلة Migrate (لا الآن) | — | منخفض |

---

## 6. C‑01 Decision (مقترح — بانتظار الاعتماد)

1. **canonical owner للهوية = `packages/database` (usersTable الموحّد)** — لأنه يطابق العقد (tenant-scoped + uuid + roleEnum + refresh_tokens المرتبطة).
2. **student = كيان مستقل (student profile) مرتبط بمعرف منفصل** (لا user profile حصرًا) — يستند إلى الفعل الفعلي: studentsTable في (ب) له id خاص + classId + studentCode، وليس userId FK.
3. **audit_logs**: الكيان canonical = `auditLogsTable` (ب) بنطاق tenant؛ **من يكتبه حاليًا = لا أحد** (جدول صامت) → يُفعَّل الـ Audit Pipeline في مرحلة الدمج (Packages/observability) **ولا يُحذف أي جدول قديم قبل إثبات نقل البيانات/المستهلكين**.
4. **حفظ البيانات**: لا توجد بيانات إنتاجية حقيقية مؤكدة في هذا الريبو (لا seeds/migrations فعلية لغيره)؛ مع ذلك تُحفظ الجداول القديمة (شيم المحرك حرفي) حتى اكتمال نقل المستهلكين (routes/socket/worker) إلى الجداول الموحّدة.
5. **الخطوة التالية المقترحة**: Migration مخصص (P2.5): `users/students/teachers/audit_logs (serial) → الموحّد (uuid)` مع mapping رجعي موثق + compatibility layer (الشيم القائم) حتى P4.

---

## 7. C‑04 / ADR‑008 (مقترح كامل — بانتظار الاعتماد)

**ADR‑008 — توحيد تسمية جلسات القراءة: `sessions` → `reading_sessions`**

1. **لماذا التعارض؟** المصدر (أ) سمّاه `sessions` بمعنى «جلسة قراءة»؛ المصدر (ب) سمّاه `reading_sessions` صراحةً مع نطاق tenant وحقول تقييم — الاسم (ب) أدق ويمنع التصادم مع أي مفهوم «جلسة تعلم» مستقبلي (Assessment/Mastery).
2. **هل هما نفس المفهوم؟** نعم بقوة (أدلة: socket.ts:95 يدرج في `sessions` أثناء جلسة قراءة؛ routes.ts:137 يقرأها بمعنى جلسات الطالب).
3. **الاسم canonical:** `reading_sessions` في `packages/database`.
4. **شكل Migration (مقترح):** جدول `reading_sessions` قائم (ب) + **دمج أعمدة (أ)** `started_at/ended_at/is_completed` (تم في الجولة السابقة) → في مرحلة Migrate: `INSERT INTO reading_sessions (…منسوخ…) SELECT … FROM sessions` مع تعيين tenant افتراضي → `UPDATE` المراجع (attempts.session_id) → تعطيل `sessions` (لا حذف) حتى إثبات صحة المستهلكين.
5. **تحديث المستهلكين (مقترح):** routes.ts:137 و socket.ts:95 → استهداف `readingSessionsTable` عبر الشيم/الموحّد عند P4/P6 (لا الآن).
6. **ضمان عدم فقد البيانات:** خطوة نسخ قبل أي تغيير + جدول قديم يبقى (rename مؤقت `sessions_legacy`) حتى PASS التحقق.
7. **Compatibility layer مؤقتة:** نعم — الشيم الحالي `artifacts/reading-engine/src/db/index.ts` يصدّر `./schema.js` (جداول المحرك) + `@workspace/db` (الموحّد) → يُزَال عند اكتمال P4 (apps/api) — وفق قاعدة «لا بقاء دائم للحل المؤقت».
8. **متى يُزال الاسم القديم؟** فقط بعد: نقل كل المستهلكين + تحقق Zero‑Loss (P2.9) + موافقة صريحة (P7 في خطة الدمج).

---

## 8. Canonical Schema Proposal (المقترح — الحالة الحالية + التوصية)

```
packages/database/
├── schema/
│   ├── tenants.ts           (tenants + planEnum)
│   ├── users.ts             (users + roleEnum + username المدمج)
│   ├── schools.ts           (schools · classes · students)
│   ├── sessions.ts          (reading_sessions + evidence_items + أعمدة مدمجة)
│   ├── gaps.ts              (gaps · remediation_plans · remediation_activities · impact_measurements)
│   ├── system.ts            (audit_logs · refresh_tokens)
│   ├── reading.ts           (passages · attempts · reports · phoneme_stats · mastery_records · exercise_assignments · api_keys) [موحّد جديد]
│   └── index.ts             (barrel)
├── migrations/              (001_initial.sql — حرفي)
├── client.ts                (pool+client واحد + healthCheck + closeConnection)
├── index.ts                 (تصدير client + schema)
├── package.json · tsconfig.json · drizzle.config.ts
```

**القاعدة الملزمة:** `packages/database` **لا يستورد أي شيء من** `engines/` · `domains/` · `apps/api` · `apps/worker` — الاتجاه الوحيد المسموح: `apps/engines/domains → packages/database` (تحقق: client.ts يستورد فقط drizzle/postgres/schema/logger انتقالي — لا اعتماد عكسي فعلي).

---

## 9. Data Ownership Map (مقترح)

| مجموعة البيانات | Owner | الجداول |
|---|---|---|
| Identity/Auth | Shared (API/Auth) | tenants · users · refresh_tokens |
| Students | Shared (API) | students (profile) · schools · classes |
| Reading | **Reading Engine** | passages · reading_sessions · attempts · reports · phoneme_stats · evidence_items |
| Mastery | **Mastery** | mastery_records |
| Diagnosis | **Learning Diagnosis** | gaps |
| Intervention | **Intervention** | remediation_plans · remediation_activities |
| Analytics | Analytics (Read Models) | impact_measurements |
| Audit | Shared (Observability/Audit) | audit_logs |
| API/سكوب | Shared | api_keys · exercise_assignments |

---

## 10. Canonical DB Client/Pool

- **الموقع الوحيد:** `packages/database/src/client.ts` (postgres pool + drizzle) — لا إنشاء Pool في أي Engine/Route/Repository.
- **من ينشئ/يستهلك:** الأسواق: api-server (auth) + المحرك (routes/socket/worker عبر الشيم) — **كلها تمر عبر `@workspace/db` / `../db/index.js`** → أي إنهاء يمر عبر `closeConnection()` (المحرك index.ts:8).
- **الضبط الحالي:** min=5, max=20 (DATABASE_POOL_MIN/MAX), idle_timeout=30, connect_timeout=10.
- **Lifecycle مقترح:** API → pool عند بوتستراب + close عند shutdown؛ Worker → pool مشترك + close عند graceful shutdown؛ transaction: `db.transaction()` من الحزمة فقط؛ healthCheck موجود (client.ts) ويُستدعى في routes.ts:33 (`/health`).
- **يحظر:** `new Pool`/`new Client`/`postgres(`/`drizzle(` خارج `packages/database` — (الفحص: لا يوجد غيرها).

---

## 11. Migration Strategy (Move → Adapt → Verify → Remove)

| الخطوة | الحالة الآن | المطلوب عند الاعتماد |
|---|---|---|
| **Move** | تم (git mv: lib/db→packages/database؛ 001→migrations؛ index→client) | توثيق رسمي بالـ ADR |
| **Adapt** | تم جزئيًا (username مدمج، أعمدة sessions مدمجة، drizzle-zod أُزيل، إصدار drizzle موحّد 0.31.4) | إكمال mapping كل جدول serial→uuid |
| **Verify** | جاهز (SHA متطابقة + tsc 0 + vitest 6/6) | تشغيل P2.8/P2.9 كامل قبل أي حذف |
| **Remove** | **لم يحدث (صحيح)** — الجداول القديمة حرفية في شيم المحرك | لا حذف إلا بعد PASS التحقق + موافقتك الصريحة (P7) |

---

## 12. Consumer Migration (الخطة)

1. **المرحلة الحالية (P2):** شيم توافق — المحرك يستهلك `../db/index.js` (يصدّر الموحّد + القديم)؛ api-server يستهلك `@workspace/db` مباشرة (موحّد).
2. **P4 (apps/api + worker):** نقل routes/socket/worker إلى الجداول الموحّدة عبر Contracts — **ممنوع Engine/API/Worker → DB خاص** قبلها.
3. **P6/P7:** إزالة الشيم القديم نهائيًا بعد تحويل كل الاستخدامات.

---

## 13. P1 Contracts Compatibility

- `packages/contracts` = **Leaf خالص** (لا استيراد DB/داخل/خارج — فحص: صفر imports خارجية).
- لا `contracts → database` إطلاقًا — مفصول تمامًا (interfaces؟ نعم؛ persistence؟ لا).
- **لا Circular Dependency** بين contracts وdatabase.

---

## 14. Dependency Graph (الحالي)

```
api-server (auth) ──@workspace/db──→ packages/database ──drizzle/postgres──→ DB
engine (routes/socket/worker) ──../db/index (شيم)──→ @workspace/db (موحّد) + ./schema (قديم)
packages/contracts (Leaf) · packages/database لا يعتمد على engines/apps (يتحقق: client.ts فقط)
ملاحظة: client.ts يستورد logger انتقالي من engine/observability (يُعالج في P3 — observability).
```

---

## 15. Security Considerations

1. **Tenant-scoped:** الجداول الموحّدة تحمل `tenant_id` (FK cascade) — جاهزية multi-tenancy (§16 العقد) — **RLS غير مفعّل بعد** (يأتي مع هجرة نهائية معتمدة).
2. **audit_logs «صامت»**: لا كاتب حالي — يُفعَّل Audit Pipeline (§14 العقد) — حتى ذلك الحين يُحتفظ بالجدول دون حذف.
3. **refresh_tokens**: token_hash موحّد UNIQUE + revokedAt/expiresAt — مطابق D‑03 (Rotating Refresh).
4. **بيانات الأطفال**: لا سياسة Retention في schema — تُضاف بالتصميم (§14 العقد).
5. **كلمات المرور**: passwordHash فقط (لا plaintext) في كلا المصدرين.
6. شذوذ: `students.is_active` من نوع timestamp (خطأ نوعي يُرجَّح) — يُصحح عبر ADR في مرحلة Migrate.

---

## 16. Test Results (المسجلة من الفحص الفعلي)

| الفحص | النتيجة |
|---|---|
| tsc — engine | `ENGINE_TSC_EXIT=0` |
| tsc — packages/database | `DATABASE_TSC_EXIT=0` |
| tsc — packages/contracts | `CONTRACTS_TSC_EXIT=0` |
| vitest — engine | `6/6 passed` (reading-score · gap · confidence) |
| تحقق حرفية schema المحرك | `VERBATIM [PASS]` (SHA `7f9261…` = pre‑merge) |
| تحقق حرفية migration 001 | `MIGRATION [PASS]` (SHA `a2fc60…` = pre‑merge) |

---

## 17. Duplicate Search Results

| البحث | النتيجة |
|---|---|
| `lib/db` في الكود/الإعدادات | **NONE** (لا مسار قديم) |
| `drizzle-zod` في src | **NONE** (أُزيل — تعارض Zod v4/v3) |
| `new Pool` / `new Client` / `postgres(` / `drizzle(` | موقع واحد فقط: `packages/database/src/client.ts` |
| جداول `pgTable("users"` | موضعان انتقاليان معلنان (الموحّد + شيم المحرك القديم — يُحسم في P7) |
| redis/queue/db clients مكررة | لا يوجد |

---

## 18. Zero-Loss Verification

| البند | قبل (pre‑merge) | بعد (الآن) | الحالة |
|---|---|---|---|
| schema المحرك (14 جدولًا) | `artifacts/reading-engine/src/db/schema.ts` | نفسه + شيم — **SHA متطابق** | ✅ |
| migration 001 | engine/db/migrations | `packages/database/migrations` — **SHA متطابق** | ✅ |
| جداول lib/db (13) | `lib/db` | `packages/database` (git R100/R0xx) | ✅ |
| المستهلكون | 6 ملفات | نفس الملفات (عبر الشيم) — tsc 0 + vitest 6/6 | ✅ |
| الوظائف | /auth/login, /health, passages, sessions, attempts, reports, socket, worker | نفسها (لم تُمس المنطق) | ✅ |

---

## 19. Rollback Procedure (أوامر دقيقة)

- **الرجوع الكامل إلى pre‑merge (إلغاء P1+P2):**
  `git reset --hard pre-merge` (commit `d713fe6`) — أو استعادة snapshot: `BuyTuk-Academy-pre-merge.zip` + `ZERO_LOSS_INVENTORY.sha256`.
- **إلغاء P2 فقط (الرجوع لنهاية P1):** `git reset --hard merge-p1` (commit `4607661`).
- **استعادة شجرة العمل فقط دون تغيير HEAD:** `git checkout pre-merge -- .`
- **نقطة العودة الحالية:** `merge-p2` → commit `41152d4`.
- لا يُحذف أي فرع/tag حتى القرار.

---

## 20. Deviations from MOD-001 / Architecture Contract

1. **⚠️ انحراف جوهري:** نُفّذ دمج P2 (git mv + توحيد + tag) في الجولة السابقة **قبل** صدور عقد «Investigation first» — موثق هنا مع الرجوع الكامل (§19).
2. **drizzle-zod أُزيل** من الـ schema الموحّد (تعارض Zod v4/v3 — موثق في ملاحظات المطور) — بلا مستهلك.
3. **إصدار drizzle موحّد إلى 0.31.4** (المحرك) بدل كتالوج 0.45 — اختيار مزامنة مرحلية (لا أثر وظيفي).
4. **الشيم القديم عُزل في المحرك** ليبقى `packages/database` نقيًا (أفضل من وضع engine-schema داخل الحزمة).
5. **students.is_active** شذوذ من المصدر الأصلي (timestamp) — لم يُعدَّل (بانتظار ADR).

---

## 21. Remaining Risks

- نموذجا هوية مختلفان (serial/username مقابل uuid/email/tenant) → هجرة بيانات تحتاج mapping دقيق.
- معالج `logger` انتقالي داخل `packages/database/src/client.ts` من engine (يُحل في P3).
- `students` في الموحّد لا يحوي بعد أعمدة المحرك (displayName/grade/nativeLanguage) — نقص وظيفي محتمل يُعالج بمرحلة Adapt.
- `classrooms` مقابل `classes` تباين دلالي (سكوب مختلف) — قرار ADR مؤجل.
- ما زال المحرك يكتب مباشرة في جداول (عبر الشيم) — سيُغلّف خلف Contracts في P4.

---

## 22. Recommendation for P3

1. **الاعتماد المطلوب الآن:** (أ) الإقرار بهذا التقرير كمرجع جنائي؛ (ب) اعتماد C‑01 + ADR‑008 المقترحين (§6–§7)؛ (ج) السماح بمرحلة Merge الرسمية (P2.4→P2.9) **بعد** الموافقة.
2. **قبل P3 (config/queue/security/observability):** يُنفَّذ التحقق الكامل P2.8 (grep عوامل DB شامل) + P2.9 (مقارنة قبل/بعد رسمية) + تحديث `TRACEABILITY_MATRIX`.
3. **P3 يبدأ فقط بعد:** اعتمادك + PASS بوابة P2 الرسمية (tag جديد `merge-p2-approved`).
4. MOD‑002 يبقى مغلقًا حتى P8.

---

### الإقرار
التقرير مبني على قراءة فعلية للملفات (أدلة ملف:سطر) وحالة git الحقيقية (tags: `pre-merge` · `merge-p1` · `merge-p2`). لا يوجد أي تعديل schema/migration في هذه الجولة — **قراءة فقط** + إنتاج هذا التقرير.
