# ADR-002 — R-009: Student Transfer Between Tenants (Global Identity → Membership → Tenant-owned Evidence)

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)


- الحالة: IMPLEMENTED (CORE-18، 2026-09-09 — بتفويض صريح من المالك). التصميم كان معتمدًا كأساس، والآن منفذ ومثبت باختبارات على PostgreSQL حقيقية عبر المسار الكانوني (ADR-001). تصحيح معماري ملزم: **الهوية العالمية مستقلة عن البريد الإلكتروني** (انظر AD-009-5 المحدث).
- التاريخ: 2026-09-09
- Baseline: `aa6a989261f16db536a6351fe226f5559817430a` (CORE-17 معتمد، dirty=0)
- المسجل: R-009 في `docs/ARCHITECTURE-RISK-REGISTER.md`؛ الأصل: `docs/ARCHITECTURE-QUESTIONS-CORE-09.md` (ARCHITECTURE QUESTION 1)

---

## 1. النموذج الحالي (من الكود الفعلي — أدلة بمعرفات حقيقية)

| المكوّن | الواقع الحالي في الكود |
|---|---|
| `studentsTable` (`packages/database/src/schema/schools.ts`) | صف الطالب مملوك لـ tenant: `tenantId NOT NULL → tenants(id) cascade` + `classId NOT NULL → classes(id) restrict` + studentCode/displayName/grade — **لا وجود لهوية عالمية** |
| `evidence` (`schema/evidence.ts`) | `tenantId NOT NULL → tenants(id)` + `studentId NOT NULL → students(id) restrict` + فهرس فريد `(tenantId, operationKey)` — **الأدلة مملوكة لـ tenant، immutable بالتصميم** |
| SLR (`slr/slr.ts` `buildStudentTimeline`) | `requireContext(tenantId, studentId)` + قراءة واحدة من `listEvidenceForStudent` — **سجل طويل الأمد لزوج (tenant, student) فقط** |
| Learner Model (`learner/projection.ts`) | هوية = (tenantId, studentId) حرفيًا في التوثيق؛ العزلة صارمة |
| حراسات الملكية | `assertSameTenant` في `learning-loop/src/loop.ts` (أسطر 58, 100, 175, 214, 290) و`decisions/src/decisions.ts`؛ `recordSecurityEvent(..., "cross-tenant-attempt", ...)` عند أي محاولة |
| Auth (`apps/api/src/routes/auth.ts` + `schema/users.ts`) | `users.email NOT NULL UNIQUE` (**فريد عالميًا — الخطاف الوحيد الموجود لهوية عابرة للـ tenants**)؛ access token يحمل `tenantId` واحدًا نشطًا؛ `DbRefreshStore` rotation بـ family/jti |
| فجوة مكتشفة (CORE-17) | `students.classId` FK لا يفرض تطابق الـ tenant (أدخلنا في اختبار أمني طالبًا tenant-S2 بفصل tenant-S1 ونجح الإدراج) — تكامل الـ tenant يعتمد على انضباط التطبيق، لا القاعدة |

**الخلاصة:** هوية الطالب اليوم = صف في tenant واحد. الانتقال لمدرسة في tenant آخر = إنشاء طالب جديد وفقدان التاريخ — لأن أي مشاركة تتطلب نقل ملكية الأدلة، وهذا ممنوع.

## 2. القرار (Decision) — ثلاث طبقات

```
┌─────────────────────────────────────────────────────────┐
│  الطبقة 1 — Global Student Identity (عالمية، بلا بيانات)  │
│  student_identities: identityId (UUID عالمي)             │
│  لا يحمل أدلة ولا درجات — مجرد عقدة هوية + موافيات       │
└───────────────┬─────────────────────────────────────────┘
                │ 1..N (الطالب واحد، العضويات متعددة عبر الزمن)
┌───────────────▼─────────────────────────────────────────┐
│  الطبقة 2 — Tenant/School Membership (سجل عضوية مؤرخ)    │
│  student_memberships:                                    │
│  identityId + tenantId + studentId (الصف المحلي القائم)   │
│  status: active | transferred | returned                 │
│  activeFrom / activeTo | schoolId | classId              │
└───────────────┬─────────────────────────────────────────┘
                │ الأدلة تبقى كما هي — صفر تغيير
┌───────────────▼─────────────────────────────────────────┐
│  الطبقة 3 — Tenant-owned Evidence (immutable، كما هو)     │
│  evidence(tenantId, studentId, …) — لا نقل، لا نسخ،       │
│  لا تغيير ملكية، إطلاقًا                                  │
└─────────────────────────────────────────────────────────┘
المشاركة الاختيارية عبر:
  student_history_shares (منحة صريحة قابلة للإلغاء):
  identityId + fromTenantId + toTenantId
  scope: summary | dimensions | full (الصوت مستثنى دائمًا)
  grantedBy + guardianConsentRef (موافقة ولي الأمر عند اللزوم)
  activeFrom / revokedAt | operationKey للـ idempotency
```

### AD-009-1 — الهوية العالمية عقدة إشارة لا مستودع
`student_identities` لا يحمل أي أدلة أو قياسات؛ الأدلة تبقى حصريًا في tenant المالك (§6 من عقد المعمارية: مالك واحد لكل بيانات). الهوية تربط الصفوف المحلية `studentsTable` القائمة عبر جدول العضويات — **بدون تعديل أي صف أدلة تاريخي**.

### AD-009-2 — النقل = إغلاق عضوية وفتح أخرى (بلا لمس بيانات)
نقل الطالب: عضوية old tenant → `status=transferred, activeTo=تاريخ النقل`؛ عضوية جديدة في new tenant → `status=active, activeFrom`. الصف المحلي `students` القديم يبقى `isActive` كما هو (تاريخه سليم)؛ صف طالب جديد في tenant الجديد يرتبط بنفس `identityId`. **عودة الطالب لمدرسة سابقة** = عضوية جديدة تشير إلى نفس الصف المحلي القديم — تاريخه موجود فعلًا هناك بلا أي حركة.

### AD-009-3 — رؤية التاريخ السابق = منحة مشاركة صريحة (لا حق افتراضي)
المدرسة الجديدة لا ترى شيئًا من تاريخ الـ tenant السابق إلا بمنحة `student_history_shares` صريحة من الطرف المالك (مع موافقة ولي الأمر حيث تلزم خصوصية الأطفال). المستويات:
- `summary`: مؤشرات مجمعة فقط (مثل: "كان ضعيف القراءة في الصف الرابع") بلا صفوف خام
- `dimensions`: قراءة عرضية للنموذج البُعدي السابق بلا تفاصيل أحداث
- `full`: قراءة كاملة للأدلة المرجعية — **الصوت والتقارير الخام مستثناة دائمًا** (`includesAudio=false` ثابت بالتصميم، لا يوجد مسار يمنحه)
المنحة قابلة للإلغاء في أي لحظة (`revokedAt`)، وكل قراءة عبرها تمر ببوابة `assertGrantAuthorized` (نفس نمط `assertDeliveryAuthorized` في `decisions/src/decisions.ts`).

### AD-009-4 — الدمج الارشادي لا الدمج الحقيقي (توافق CORE-09)
قراءة عبر المنحة تُساقط كـ **EXTERNAL interpretations** (مثل مدخلات المعلم/AI في CORE-09: تُعرض ولا تُدمج أبدًا في المستوى المشتق بالقواعد)، بوسم `source` ومراجع لأدلة tenant المالك الأصلية. `buildLearnerModel` القائم يبقى عازمًا على (tenantId, studentId) وحده — عزلته لا تُلمس؛ أي قدرة استمرارية مستقبلية تكون دالة قراءة جديدة منفصلة تعمل فقط عبر منحة سارية.

### AD-009-5 — الأثر على المصادقة (محدث 2026-09-09 — تصحيح ملزم من المالك)
**Global Student Identity ≠ Email.** البريد وسيلة اتصال/حساب وليس معرفًا تعليميًا عالميًا للطالب: قد لا يكون للطالب بريد أصلًا، وقد يتغير البريد، وقد يكون البريد تابعًا لولي الأمر.
- `identityId` = **UUID مستقل تصدره المنصة** عند إنشاء الهوية — غير مشتق من البريد ولا من أي معرف حساب.
- `users.email NOT NULL UNIQUE` يبقى كما هو (عقد حساب، لا عقد هوية) — **لا يُستخدم كمعرف هوية عالميًا ولا كحقل وصل ضمني**.
- أي ربط حساب↔هوية مستقبلًا يكون عبر **جدول ربط صريح اختياري** (مثل `identity_account_links`: identityId + userId + role + verifiedAt) أو عبر سجلات العضويات نفسها — بقرار ADR وقت التنفيذ.
- تسجيل الدخول يبقى لـ tenant نشط واحد (كما هو)؛ "تغيير المدرسة" = إصدار زوج رموز جديد بـ tenantId العضوية النشطة الأخرى + حدث audit. لا جلسة مزدوجة، لا رمز يحمل أكثر من tenant واحد.

### AD-009-6 — Audit وخصوصية
كل حدث دورة حياة (إنشاء هوية، فتح/إغلاق عضوية، إنشاء/إلغاء منحة، قراءة عبر منحة، محاولة قراءة بلا منحة) يمر عبر `auditLogsTable` (tenant-keyed قائمة) و`recordSecurityEvent` (بما فيها `cross-tenant-attempt` القائمة). موافقة ولي الأمر تُخزن كمرجع (consentRef) لا كمستند.

## 3. الأثر (Impact)

| النطاق | الأثر |
|---|---|
| `packages/database` | 3 جداول جديدة (identities/memberships/shares) + عمود `students.identityId` nullable — كلها عبر مسار ADR-001 (`generate`→مراجعة→`migrate`). **صفر تعديل** على evidence/SLR/learner code |
| Evidence | **صفر** — لا نقل ولا نسخ ولا تغيير ملكية؛ نفس الجدول والقيود |
| SLR | صفر — `buildStudentTimeline` كما هو لكل tenant؛ أي عرض عابر للحدوث يكون قراءة منفصلة مرخصة بمنحة |
| Tenant | يضاف جدول عضويات عابر للـ tenants؛ حراسات `assertSameTenant` القائمة تبقى كما هي دون استثناءات |
| Auth | ربط الحساب بالهوية + تبديل العضوية النشطة بإصدار رموز جديدة (البنية القائمة تكفي — لا بروتوكول جديد) |

## 4. الملفات التي ستتغير (عند التفويض — في CORE-18)
1. `packages/database/src/schema/identity.ts` (جديد: الجداول الثلاثة)
2. `packages/database/src/schema/schools.ts` (عمود `identityId` nullable)
3. `packages/database/src/schema/index.ts` (تصدير)
4. `packages/database/src/evidence/ownership.ts` (مفاتيح ملكية: student-identity → core-platform)
5. `packages/database/src/identity/*` (جديد: createIdentity / openMembership / closeMembership / grantHistoryShare / revokeGrant / assertGrantAuthorized — حراسة فقط، لا قراءة بيانات)
6. migrations مولدة آليًا (مسار ADR-001) + `docs/ARCHITECTURE-RISK-REGISTER.md` + هذا الـ ADR

## 5. مخاطر جديدة
- **R-009-a**: `students.classId` لا يفرض نفس الـ tenant (مثبت تجريبيًا في CORE-17) — إضافته (composite FK) مقترحة ضمن CORE-18 كتحصين مستقل.
- **R-009-b**: إساءة استخدام منحة `full` — mitigated: الافتراضي `summary`، الصوت مستثنى معماريًا، الإلغاء فوري، كل قراءة مسجلة.
- **R-009-c**: موافقات ولي الأمر في jurisdictions مختلفة — الحقل ref + علم إلزامية؛ القاعدة القانونية النهائية قرار product (خارج الهندسة).

## 6. نطاق CORE-18 (المقرر من المالك)
1. **R-008 فقط نطاق تنفيذ هذا التدفق** (المسار الأول منطقيًا: أي جداول مستقبلية تمر عبر المسار الجديد).
2. **R-009/Membership/History-Sharing: توثيق فقط** — لا كود identity/membership schema في هذا التدفق؛ التنفيذ مؤجل لتفويض صريح لاحق.
3. اختبارات: Empty DB → migrate → drift-check صفر فرق → CORE-17 runtime suite (32) على القاعدة المبنية بالـ migrations + regression كامل.

---

## 7. تحديث الاعتماد (2026-09-09) — التصميم أساس معتمد، التنفيذ مؤجل

اعتمد المالك النموذج «Global Student Identity → Tenant/School Membership → Tenant-owned Evidence» **كأساس مستقبلي** مع المبادئ الإلزامية الأربعة عشر:

| # | المبدأ المعتمد | مرجع التصميم |
|---|---|---|
| 1 | Evidence التاريخي مملوك للـ Tenant الذي أنتجه | AD-009-1/2 |
| 2 | Evidence immutable | AD-009-2 |
| 3 | ممنوع تغيير `tenant_id` للأدلة القديمة | AD-009-2 |
| 4 | ممنوع نسخ Evidence بين tenants | AD-009-3/4 |
| 5 | لا Learner Model مستقل لكل مدرسة يسبب تضارب الحقيقة | AD-009-4 |
| 6 | الهوية العالمية لا تحمل البيانات التعليمية | AD-009-1 |
| 7 | Membership هي الرابط بين الهوية والمدرسة/tenant | الطبقة 2 |
| 8 | الانتقال = Link + Authorization (لا نقل ملكية) | AD-009-2/3 |
| 9 | لا وصول تلقائي للتاريخ القديم | AD-009-3 |
| 10 | المدرسة الجديدة ترى فقط ما تسمح به Grant صريحة | AD-009-3 |
| 11 | كل access عبر grant قابل للتدقيق | AD-009-6 |
| 12 | إلغاء الـ grant يوقف الوصول مستقبلًا | AD-009-3 |
| 13 | **الصوت والتسجيلات القديمة خارج History Sharing** (full ≠ audio) | AD-009-3 |
| 14 | Tenant Isolation الحالي بلا أي bypass | AD-009-6 + حراسات قائمة |

**حقول العضوية المعتمدة:** identityId، tenantId، studentId، status (`active\|transferred\|returned`)، activeFrom/activeTo، schoolId، classId — مع الاحتفاظ بتاريخ العضويات كاملًا (لا حذف).

**حقول الـ Share المعتمدة:** scope (`summary\|dimensions\|full`)، grantedBy، createdAt، revokedAt، operationKey، consentRef عند الحاجة — كطبقة Authorization مستقلة: `Student Identity → History Share → Tenant B`.

**سلامة البيانات (معالجة فجوة CORE-17):** عند التنفيذ تُصمم العلاقات بـ composite constraints/foreign keys بحيث يستحيل إنشاء `Student(Tenant A) → Class(Tenant B)` عبر خطأ برمجي أو API — لا بالاعتماد على application code فقط (R-009-a).

**SLR / Learner Model / Intelligence:** التاريخ مستمر والملكية والعزل لا ينكسران؛ أي عرض خارجي Reference-based، Authorized، Auditable، واضح المصدر، لا يغير Evidence الأصلي، **ولا يحقن بيانات Tenant A في Learner Model المشتق لـ Tenant B بدون سياسة صريحة** — ولا «copy Evidence → Tenant B» ولا «merge raw Evidence» ولا «rewrite historical tenant».

**Tenant Security:** الحمايات القائمة عبر API → Engine → Worker → Event → Outbox → Evidence → Decision → Learning Loop تبقى بلا أي shortcut عابر للـ tenants؛ أي محاولة غير مصرح بها تُرفض، لا تعيد بيانات، تُسجل Security Event، وتكون قابلة للتدقيق.

**التنفيذ:** مؤجل — لن يُنفذ أي جدول/عقد/منطق لهذا النموذج إلا بتفويض صريح في core لاحق (بعد ADR-001 الذي صار المسار القانوني لأي جداول جديدة). **سياسة الاحتفاظ/حذف بيانات الأطفال:** ADR-003 مستقبلي مستقل (مسجل R-010 — لا تُحسم المتطلبات القانونية هنا).
