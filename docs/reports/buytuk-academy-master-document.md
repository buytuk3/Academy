# BuyTuk Academy — الوثيقة المرجعية الموحدة لحالة المشروع

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)

**Master Project Status Reference — Consolidated Single Document**

- **تاريخ الاعتماد المرجعي:** 2026-09-13
- **HEAD المرجعي الحالي:** يتقدم مع كل إغلاق — انظر `git log -1` بعد فك الضغط (آخر تحديث: إغلاق E4/P0 + ACR-E4-002) — **مُتحقَّق منه في المستودع (git rev-parse HEAD)، الشجرة نظيفة DIRTY=0**
- **سلسلة الإغلاقات الموثقة:** E1 (دمج `9406a44`) → E2 (دمج `490887f`) → E3/P0 CORE-30 (دمج `58eb70e`) → E4/P0 CORE-31 (دمج `990e725`) → ACR-E4-002 (استعادة حد CORE-05 + بنية الاختبارات) على `main`
- **طبيعة الوثيقة:** مرجع رسمي موحّد يجمع الحالة الكاملة (المكتمل / الجزئي / المعلّق)، خارطة الطريق، والبوابات — تم التجميع دون أي تعديل معماري.
- **منهجية التحقق:** كل بند مرفق بعمود «التحقق في المستودع» يبين دليلًا مباشرًا (مسار ملف، رمز، وسم) تم تنفيذه بتاريخ 2026-09-13. آخر جولة شاملة حية: **609 اختبارًا أخضر فريدًا + TSC شامل EXIT=0 + Drift PASS (db-push-verify ثم schema-drift-check، EXIT=0) + Secret Scan نظيف** على شجرة ACR-E4-002.

---

## الهدف النهائي للمشروع

الوصول إلى **الدورة التعليمية الكاملة**:

> Student → Activity/Test → Attempt → Evidence → Assessment/Diagnosis → Learning Loop → Teacher Review → Teacher Decision → Intervention → Reassessment → Outcome → Updated Student State

ثم تكون النتائج قابلة للرؤية والمتابعة عبر:

> Student → Teacher → School Management → Educational Administration → Directorate

---

# أولًا: المهام المكتملة والمثبتة (15 بندًا)

## 1. البنية الأساسية للـ Learning Loop — ✅ مكتملة ومثبتة

**تم تنفيذها:**
- Learning Loop domain، Teacher Gate، Intervention، Reassessment، Outcome، Adapt Next Action.
- حالات PENDING والانتظار لمراجعة المعلم؛ منع الانتقال للتنفيذ قبل قرار المعلم.
- حالات الرفض والتوقف؛ idempotency للقرارات.

**التحقق في المستودع:** مُتحقَّق — `packages/learning-loop/src/loop.ts` يحتوي `runLearningLoop` ودورات التشخيص/المقترح/إعادة التقييم/النتيجة؛ `packages/decisions/src/state-machine.ts` يثبت `PENDING → APPROVED|MODIFIED|REJECTED` (حالة نهائية، `DECISION_ALREADY_FINAL` عند إعادة القرار)؛ مفتاح القرار `teacher:decision:{proposalId}:{actorId}:{action}` مع إعادة القرار نفسه كما هو (existed:true).

## 2. R-027-05 — Loop Resumption Idempotency — ✅ مكتملة ومثبتة

**تم تنفيذها:**
- استرجاع السجل الموجود عند duplicate operation؛ استخدام `tenantId + operationKey`.
- إرجاع الصف الكامل مع `existed:true`؛ التعامل مع اختفاء السجل بعد الـ conflict (`IDEMPOTENT_ROW_VANISHED`).
- الحفاظ على unique constraint؛ اختبارات race/concurrency.

**النسخ المرتبطة:** `e80a3e6` (الإصلاح)، `2c7b8c5` (حزم الأدلة)، الوسم `core27-r027-05-fixed`.

**التحقق في المستودع:** مُتحقَّق — الالتزامان `e80a3e6` و`2c7b8c5` في `git log`، والوسم موجود في `git tag -l`. حواجز الهوية في `loop.ts`: `DIAGNOSIS_IDENTITY_MISSING` / `INTERVENTION_IDENTITY_MISSING` (سطر حاجز R-027-05 في `proposeIntervention` و`recordReassessment`).

## 3. Batch 3 — Evidence / Skill Isolation — ✅ مكتملة ومثبتة

**تم تنفيذها:**
- عزل المهارة `skillOf(r) === signal.skill`؛ دعم قياسات Numeracy عبر `LEARNER_DIMENSION_REGISTRY`.
- دعم أنواع الأدلة: assessment / response / attempt؛ مقاييس: accuracy / problem-solving / durationMs.
- الحفاظ على السلوك التاريخي (assessment-only) للمهارات غير المسجلة؛ تصحيح العقود والـ guards؛ إعادة تصدير `LEARNER_DIMENSION_REGISTRY`.

**الوسم:** `core27-batch3-fixed` (التزام `9b942ae`).

**التحقق في المستودع:** مُتحقَّق — الالتزام `9b942ae` والوسم موجودان؛ `LEARNER_DIMENSION_REGISTRY` في `packages/database/src/learner/rules.ts` مع إدخال `mathematics.numeracy` (metric: numeracy، أنواع: assessment/response/attempt)؛ فلتر العزل في `loop.ts` (تعليق R-027-01/R-027-02 FIX)؛ سطر التصدير في `packages/database/src/index.ts`.

## 4. ADR-027 / V-3 — ✅ مكتملة ومعتمدة

**المبادئ التسعة المثبتة:** 1) Trigger، 2) Evidence Readiness، 3) Invocation، 4) Persistence، 5) Teacher Gate، 6) Delivery، 7) معنى `existed:true`، 8) Ownership/Isolation، 9) Failure/Retry Semantics.

**الموقع:** `docs/decisions/ADR-027-V3-RUNTIME-INTEGRATION.md`

**التحقق في المستودع:** مُتحقَّق — الملف موجود (6,701 بايت)؛ بصمة SHA256 عند الاعتماد: `23547a6f24327fa3fd346daa77862824bd6cd54dff9b1b36c9990c31310fb330` (سجل جلسة).

## 5. V-3 Runtime Integration — ✅ مكتملة ومثبتة

**Worker:** بعد نجاح `processAnalyzeJob` → قراءة الأدلة من القارئ الرسمي → تشغيل V-3 → إنشاء diagnosis/proposal → إبقاء الحالة PENDING → عدم تجاوز Teacher Gate → فشل الـ loop لا يُسقط الـ analyze job → الاستفادة من R-027-05 لاستئناف آمن.

**Sync API:** بعد `submitAttemptExecution` → حفظ الأدلة → تشغيل V-3 → إنشاء proposal → إبقاء PENDING → عدم كسر الـ request عند فشل الـ loop.

**الالتزام:** `ce47180875430e53f53245261e586e2b1fbdffe5` — **الوسم:** `core27-v3-integrated`.

**التحقق في المستودع:** مُتحقَّق — موقعا استدعاء `runLearningLoop` في `apps/api/src/v1/activity.ts` (بعد submitAttemptExecution) و`apps/worker/src/index.ts` (بعد processAnalyzeJob)؛ التعليقات المرجعية لـ ADR-027/V-3 موجودة في الموقعين؛ التزام ووسم مثبتان.

## 6. Evidence Architecture — ✅ مكتملة ومثبتة

**المحفوظ:** Canonical Evidence Writer/Reader، مفاتيح أدلة حتمية، Evidence ownership، عزل Tenant/Student، لا writers بديلة في API/Worker، Intelligence يقرأ ولا ينشئ أدلة بديلة.

**التحقق في المستودع:** مُتحقَّق — `packages/database/src/evidence/evidence-writer.ts` (`recordEvidence` مع dedup على tenant_id+operation_key) و`evidence-reader.ts` (`listEvidenceForStudent` مع شروط tenant/student)؛ ملف حماية B1 في `tests/core-27/matrix-b-structural.test.ts` يمنع أي كتابة أدلة خارج `recordEvidence` (سجل جلسة).

## 7. Contracts / Domain Boundaries — ✅ مكتملة ومثبتة

**المحفوظ:** Core contracts، Domain boundaries، Learning Loop domain، Teacher Gate، Execution Runtime، Evidence ownership، Tenant isolation، Idempotency، Events/Outbox. لا يوجد architectural drift مؤثر في السلسلة الأخيرة.

**التحقق في المستودع:** مُتحقَّق جزئيًا — الشجرة نظيفة عند HEAD المرجعي؛ فحص Schema Drift الأخير PASS (سجل جلسة)؛ لا تغييرات على العقود في الالتزامات الخمسة الأخيرة (الالتزامات المفحوصة تمس config/tests/loop فقط).

## 8. Events / Outbox / Queue Foundation — ✅ موجودة ومثبتة

**المثبت:** Events dispatcher، Outbox، DLQ، Analyze queue، Realtime queue، Analyze DLQ، deterministic job IDs، replay convergence.

**التحقق في المستودع:** مُتحقَّق — `packages/events/src/dispatcher.ts` و`outbox.ts` و`evidence-consumer.ts` موجودة؛ `packages/queue/src/index.ts` + `idempotency.ts` (`makeJobId`, `isDuplicateJob`).

## 9. Numeracy Engine — ✅ مكتملة ومثبتة في الاختبارات الحالية

**المثبت:** 16 error class، Attempt evidence، Measurements (accuracy/problem-solving/duration)، التكامل مع evidence architecture.

**التحقق في المستودع:** مُتحقَّق — `engines/numeracy-engine/` كامل؛ الكاتب الرسمي `recordNumeracyEvidence` (evidenceType: "attempt" عبر Canonical Writer). النتائج 41/41 (سجل جلسة).

## 10. Assessment Engine — ✅ مكتملة ومثبتة

**المثبت:** Rubric، Assessment evidence، التكامل مع النظام.

**التحقق في المستودع:** مُتحقَّق — `engines/assessment-engine/` كامل؛ `recordAssessmentEvidence` (evidenceType: "assessment"، operationKey: `assessment:attempt:{id}`). النتائج 37/37 (سجل جلسة).

## 11. Reading Engine — ✅ مكتملة في البنية الحالية ومثبتة ضمن الاختبارات المتاحة

**البنية:** Audio analysis، Reading evidence، Replay safety، التكامل مع evidence pipeline. **تنبيه:** هذا لا يعني اكتمال المنتج النهائي للطالب والمعلم والواجهة التعليمية.

**التحقق في المستودع:** مُتحقَّق — `engines/reading-engine/` كامل مع queue/workers (`analyze.processor.ts`)؛ الـ E2E المرجعي `tests/core-26/runtime-e2e.test.ts` (686 سطرًا) يغطي مسار القراءة عبر طابور حقيقي مع seams خارجية مقبولة فقط.

## 12. Teacher Decision Logic — ✅ مكتمل ومختبر ومربوط HTTP (E1 — CORE-28)

**الموجود:** `buildTeacherReviewQueue`، `applyTeacherDecision`، `recordTeacherFeedback`، `assertDeliveryAuthorized`، Decision state machine، RBAC، Delegation، Teacher Gate.
**تم في E1:** ربط القدرات الأربع بمسارات HTTP حقيقية في `apps/api/src/v1/teacher.ts` مع خرائط أخطاء موحدة (ClassifiedError) وحفاظ كامل على Teacher Gate.

**التحقق في المستودع:** مُتحقَّق — القدرات في `packages/intelligence/src/teacher.ts` و`packages/decisions/src/decisions.ts`؛ **السطح HTTP** في `apps/api/src/v1/teacher.ts` (ملتزم `3a27c45`، مدموج `9406a44`)؛ E2E الدورة الكاملة `tests/core-28/` (11/11 على PostgreSQL وRedis حقيقيين).

## 13. Oversight / Administrative Logic — ✅ منطق Oversight مكتمل ومثبت

**المثبت:** Scopes (TENANT/ORGANIZATION/SCHOOL/GRADE/CLASS/SUBJECT + STAGE)، `assertStaffScope`، Privacy minimum aggregation، عزل Tenant/Organization.
**الملاحظة:** لا توجد واجهات UI متكاملة لكل مستوى حتى الآن.

**التحقق في المستودع:** مُتحقَّق — `packages/database/src/oversight/aggregation.ts` (`aggregateEvidence`, `assertStaffScope`, `assertStudentDetailAccess` مع تسجيل أحداث أمنية وسجل تدقيق)؛ مسار `GET /v1/oversight/aggregates` موجود في `apps/api/src/v1/oversight.ts`.

## 14. G5-A.1 — Production Secret Hardening — ✅ مكتملة ومثبتة

**المنفذ:** تعديل `packages/config/src/env.ts` و`packages/config/test/config.test.ts` بحيث: Production يرفض `dev-secret-change-me` و`dev-kek-change-me`، Dev/Test محفوظ، اختبارات للقيم الصحيحة والخاطئة.

**الالتزام:** `bd7049768bb5026bf3334a3d41382b2d56118fb9` (= HEAD الحالي).

**التحقق في المستودع:** مُتحقَّق — الملفان موجودان؛ الالتزام هو HEAD؛ بوابات الجلسة الأخيرة: TSC ناجح، core-27 31/31، core-07 31/31، regression 209/209، Drift PASS، Secret Scan PASS (سجل جلسة).

## 15. الاختبارات الحالية — ✅ مكتملة بالنطاق المنفذ

**آخر حالة مثبتة (سجلات تنفيذ الجلسات، مخرجات أوامر حرفية — لم تُعاد في هذه المراجعة):**
- Core-27: 31/31 — Core-07: 31/31 — Regression CORE-17→26: 209/209 (توزيعها: 32/17/14/15/16/18/21/44/12/20)
- Numeracy: 41 — Assessment: 37 — **إجمالي الاختبارات غير المكررة: 349/349**
- TypeScript: 10/10 حزم — Drift: PASS — Secret Scan: PASS — Git tree clean في آخر تقارير التنفيذ.

---

# ثانيًا: المهام المكتملة جزئيًا (6 بنود)

## 16. Educational Full Cycle — ✅ مكتملة عبر HTTP حقيقي (E1/CORE-28 11/11 + E4/P0 CORE-31 7/7)

الدورة تعمل فعليًا عبر HTTP حقيقي من طرف إلى طرف: Login → Lesson (E4/CORE-31) → Activity → Attempt → Evidence → Assessment → Diagnosis → Learning Loop → PENDING → **Teacher Review Queue → Decision → Delivery** (E1/CORE-28) → **Progress/Recommendations** (E3/CORE-30) → **Dashboard/Mastery View** (E4/CORE-31) — كلها على PostgreSQL حقيقي.

**التحقق:** مُتحقَّق — E2E: `tests/core-28/` (11/11، دورة المعلّم) و`tests/core-31/` (7/7، دورة الطالب الكاملة بفجوة حقيقية وتوصية علاجية وإتقان من الكاتب الحقيقي) و`tests/core-30/` (6/6، التقدم والتوصيات) و`tests/core-29/` (10/10، نموذج المتعلم).

## 17. Teacher Runtime — ✅ مكتمل (E1 — CORE-28، دمج `9406a44`)

**تم في E1 (CORE-28، دمج `9406a44`):** Review Queue API، Teacher Decision API، Teacher Feedback API، Authorized Delivery API — الفجوة التي كانت تمنع إغلاق الدورة أُغلقت ومُثبتت بـ E2E 11/11.

## 18. Learner Model — ✅ Domain مكتمل + API مكتمل (E2 — CORE-29)

**الموجود:** Learner Model، Student state، Intelligence foundations — **وتم في E2:** `GET /v1/students/{studentId}/learner-model` (قراءة فقط، إسقاط لحظي من الأدلة الرسمية، عزل الطالب/المستأجر، بلا درجة كلية).
**تم في E4/P0 (CORE-31، دمج `990e725`):** العرض داخل لوحة الطالب — `GET /v1/students/{id}/dashboard` (تجميعة قراءة واحدة: نموذج المتعلم + SLR + الإتقان + التوصيات + النشاط التالي، بلا درجة كلية) + `GET /v1/lessons` و`GET /v1/lessons/:id` (Lesson Runtime) + Mastery View (SELECT فقط) — E2E 7/7.

**التحقق:** مُتحقَّق — `packages/database/src/learner/` كامل و`buildLearnerModel` مُصدَّر؛ **المسار الجديد** في `apps/api/src/v1/students.ts` (ملتزم `e2b5479fc81f9bda09948981c1c2869a67bba97b`، مدموج `490887fb7c54bdabc46a6d1f78cc6973e1e90066`)؛ E2E حزمة `tests/core-29/` (10/10 على قاعدة `core29_verify` مخصصة).

## 19. Dictation Engine — ⚠️ موجود جزئيًا

البنية الأساسية موجودة، لكن الـ modern runtime path غير مثبت بمستوى Numeracy/Assessment/Reading. يحتاج: Runtime integration proof، Unit tests، E2E proof، وتأكيد مروره بنفس Evidence/Learning Loop architecture.

**التحقق:** مُتحقَّق — `engines/dictation-engine/` موجود مع adapter مزامنة في `engine-adapters.ts` (DICTATION → compareDictation + computeMeasurements)؛ **28 اختبارًا وحدويًا أخضر (جولة 2026-09-13)**؛ لا يوجد E2E runtime مخصص بعد.

## 20. Intelligence / Recommendations — ✅ مربوط HTTP (E3/P0 — CORE-30)

**المربوط HTTP:** `GET /v1/students/{id}/insights` (قراءة فقط عبر `buildIntelligenceReport`) + **E3/P0 (CORE-30، دمج `58eb70e`):** `GET /v1/students/{id}/progress` (جدول زمني طولي متعدد السلاسل) و`GET /v1/students/{id}/recommendations` (أنماط الطالب → مسار تعلم بـ `requiresTeacherApproval:true`) — E2E 6/6 بعزل قيمي كامل.

**المتبقي:** واجهات UI فقط (خارج نطاق P0) — المنطق والربط مكتملان ومثبتان.

## 21. School / Educational Administration / Directorate — ⚠️ Domain logic موجود، المنتج المرئي غير مكتمل

**الموجود:** Aggregation، Scopes، Privacy، RBAC، Organization hierarchy. **المفقود:** واجهة Principal، واجهة الإدارة التعليمية، واجهة المديرية، تقارير عملية، Dashboards مرتبطة بالدورة.

---

# ثالثًا: المهام غير المنجزة حتى الآن (20 بندًا)

## 22. Teacher HTTP API Surface — ✅ أُنجزت (E1 — CORE-28)

المطلوب:
- `GET /v1/teacher/review-queue` لتغليف `buildTeacherReviewQueue`
- `POST /v1/interventions/{id}/decision` لتغليف `applyTeacherDecision`
- `POST /v1/interventions/{id}/feedback` لتغليف `recordTeacherFeedback`
- API للـ Delivery بعد `assertDeliveryAuthorized` ثم `startAttemptExecution`
- مع الحفاظ الكامل على Teacher Gate.

**التحقق:** مُتحقَّق — المسارات الأربعة في `apps/api/src/v1/teacher.ts` (E1، ملتزم `3a27c45`، مدموج `9406a44`)؛ Teacher Gate محفوظ (delivery محظور قبل APPROVED)؛ E2E `tests/core-28/` 11/11.

## 23. HTTP E2E Teacher Cycle — ✅ مثبتة (E1/CORE-28 — 11/11 على PostgreSQL وRedis حقيقيين)

إثبات دورة كاملة عبر HTTP حقيقي: Student Login → Create Attempt → Submit → Evidence → Assessment → Diagnosis → PENDING → Teacher Review Queue → Teacher Decision → Intervention → Execution → Reassessment → Outcome → Updated Student State → Administrative Visibility. **المُثبت:** `tests/core-28/e1-full-cycle-e2e.test.ts` — 11/11 على PostgreSQL وRedis حقيقيين (ملتزم `341aa4d`، مدموج `9406a44`).

## 24. Actual UI Application — ❌ غير مكتملة

**الموجود:** API contracts، Generated React API client، Backend architecture. **المطلوب لاحقًا:** Student Portal، Teacher Portal، Principal Portal، Educational Administration Portal، Directorate Portal، Admin Portal.

**التحقق:** مُتحقَّق — `lib/api-client-react` و`lib/api-spec` و`lib/api-zod` موجودة؛ لا يوجد أي تطبيق واجهة في المستودع.

## 25. Parent Portal — ❌ غير مكتمل

يحتاج: API، Permissions، Student relationship، Progress/feedback view، UI.

**التحقق:** مُتحقَّق — لا توجد مسارات parent في v1 (فحص سلبي)؛ دور `parent` معرف في `packages/security/src/rbac.ts` فقط.

## 26. Learner Model API — ✅ أُنجزت (E2 — CORE-29)

`GET /v1/students/{id}/learner-model` منفذ ومعتمد: RBAC (طالب = نفسه فقط؛ موظف عبر `assertStudentDetailAccess`)، Student isolation، Tenant isolation (عابر المستأجر = 404 بلا تسريب وجود)، Privacy (لا درجة كلية — `overallScore`/`student_level` غائبان عن الاستجابة كليًا)، UUID شاذ = 400 في المحوّل.

**التحقق:** مُتحقَّق — الالتزام `e2b5479fc81f9bda09948981c1c2869a67bba97b` + الوسم `core29-e2-learner-model` + E2E 10/10 (مستويات القواعد، الحتمية، الحالة المحدثة sampleCount/trend، العزل، السلبيات) — تشغيل حي بعد الدمج على `main` (11/11 مع core-28).

## 27. Production PostgreSQL — ❌ لم يكتمل

المطلوب: قاعدة إنتاج، Backup strategy، Restore test، RPO، RTO، Monitoring.

## 28. Production Redis — ❌ لم يكتمل

المطلوب: Redis إنتاج، Authentication، TLS، Recovery، Reconnect strategy، Production configuration.

## 29. S3 / Object Storage — ❌ لم يكتمل

المطلوب: Object storage إنتاجي، تخزين الصوت/الملفات، وصول آمن، Lifecycle، اعتبارات Backup/recovery.

## 30. Inference Gateway — ❌ لم يكتمل Production-wise

المطلوب: بوابة استدلال إنتاجية، تكامل مع AI engines، GPU/CPU execution strategy، Health/readiness، Monitoring، Failure/retry handling.

## 31. Health / Readiness / Liveness — ❌ غير مكتمل بالشكل الإنتاجي

المطلوب: API health، Database readiness، Redis readiness، Worker health، Inference health، Dependency health.

**التحقق:** مُتحقَّق جزئيًا — `GET /healthz` موجود ويعيد `{status:"ok"}` فقط (سطح أولي).

## 32. API Graceful Shutdown — ❌ غير مكتمل

Worker لديه graceful shutdown (`SIGTERM`/`SIGINT` مع إغلاق worker والطوابير — مُتحقَّق في `apps/worker/src/index.ts`)؛ API يحتاج استكمال نفس المستوى (لا توجد handlers في apps/api — فحص سلبي).

## 33. Metrics Security — ❌ غير مكتمل

`/metrics` موجود لكنه **عام** (`apps/api/src/routes/reading.ts` سطر 67: `router.get("/metrics", ...)`) ويحتاج: Auth/Authz أو Network restriction، Production security. (هذا GAP-007 من سجل G-5 — الخطة معتمدة، التنفيذ غير مصرح به بعد).

## 34. Logging / Redaction / Tracing — ⚠️ جزئي

**الموجود:** Structured logging (Pino)، Redaction module، Metrics foundation. **المتبقي:** wiring كامل للـ redaction، Trace completeness، OpenTelemetry (خارج نطاق القراءة الحالي)، ربط API/worker/inference/event flow. (GAP-013 — خطة معتمدة، تنفيذ معلق).

## 35. Production Monitoring / Alerts — ❌ غير مكتمل

المطلوب: Alerts، Error-rate monitoring، Queue monitoring، DLQ monitoring، Database monitoring، Redis monitoring، Inference monitoring، SLA/SLO monitoring.

## 36. CI/CD — ❌ غير مكتمل

المطلوب: CI pipeline، Automated tests، Build، Artifact، Deployment، Rollback، Migration strategy، Production approval gate.

**التحقق:** مُتحقَّق — لا توجد artifacts CI/CD في المستودع (فحص سابق: none found).

## 37. Docker / Infrastructure — ❌ غير مكتمل

المطلوب: Production Dockerfiles، Deployment configuration، Infrastructure artifacts، Environment management.

**التحقق:** مُتحقَّق — لا يوجد أي Dockerfile في المستودع (فحص find سلبي).

## 38. Dependency Vulnerabilities — G5-008 — ❌ PLANNED / NOT EXECUTED

يوجد تقرير vulnerabilities (الجلسة الأخيرة: 23 ثغرة — 1 critical، 12 high، 9 moderate، 1 low؛ وفي المسح الإنتاجي: critical 1، high 12، moderate 9 — AUDIT_EXIT=1)، والخطة معروفة (إزالة bcrypt، ترقية OpenTelemetry، Express/qs/uuid، ACR منفصل لـ drizzle-orm)، لكن التنفيذ لم يكن مفتوحًا ضمن آخر تفويض. **لا يجب اعتبارها مغلقة.**

## 39. Performance / Load Testing — ❌ غير مكتمل

المطلوب: Load test، Concurrent students، Queue throughput، API latency، Evidence throughput، AI inference latency، تحديد bottlenecks، مقارنة النتائج بالأهداف التشغيلية.

## 40. Recovery / Disaster Testing — ❌ غير مكتمل

المطلوب: Database restore، Redis recovery، Queue recovery، DLQ replay، Failure scenarios، قياس Recovery time.

## 41. Documentation Drift — ⚠️ Drift منخفض الخطورة فقط

الـ architecture الأساسية متماسكة، لكن بعض ملفات التخطيط القديمة في `docs/buytuk-master/` لم تُحدَّث بالكامل بعد V-3 وG5-A.1. ليست مشكلة Architecture، لكنها تحتاج تنظيفًا وتحديثًا قبل الإطلاق النهائي.

**التحقق:** مُتحقَّق — المجلد موجود ويضم ARCHITECTURE_MAP.md وAPI_CATALOG.md وDATABASE_CATALOG.md وغيرها.

---

# رابعًا: الحالة الإدارية الحالية للمشروع

| المجال | الحالة |
|---|---|
| Architecture Foundation | 🟢 مكتملة وقوية |
| Evidence Architecture | 🟢 مكتملة |
| Learning Loop | 🟢 مكتملة |
| Teacher Gate | 🟢 مكتملة |
| V-3 Runtime Integration | 🟢 مكتملة |
| Numeracy | 🟢 مكتملة ومثبتة |
| Assessment | 🟢 مكتملة ومثبتة |
| Reading | 🟢 البنية الأساسية مثبتة |
| Oversight Logic | 🟢 مكتملة |
| Production Secret Hardening G5-A.1 | 🟢 مكتملة |
| Teacher Runtime | 🟢 مكتمل ومثبت HTTP (E1/CORE-28 — 11/11) |
| Learner Model | 🟢 Domain + API (E2/CORE-29) + Dashboard/Lessons/Mastery View (E4/CORE-31 — 7/7) |
| Dictation | 🟡 موجود جزئيًا ويحتاج Proof |
| Intelligence | 🟢 مربوط HTTP (E3/P0 CORE-30 — progress + recommendations 6/6) |
| UI Platform | 🔴 غير مكتملة |
| Parent Portal | 🔴 غير مكتمل |
| Teacher HTTP Surface | 🔴 غير مكتمل |
| Production Infrastructure | 🔴 غير مكتملة |
| Production Security Hardening | 🔴 غير مكتملة بالكامل |
| CI/CD | 🔴 غير مكتمل |
| Load/Performance/Recovery | 🔴 غير مكتمل |
| Production Launch | 🔴 غير مصرح به |

---

# خامسًا: الأولوية التنفيذية الحالية

أهم شيء الآن **ليس إعادة بناء الـ Core** — تم بناؤه واختباره جيدًا. الأولوية إغلاق الفجوة بين الـ Domain والمنتج الفعلي:

**المنهج:** `CONNECT → PROVE → PRODUCTIZE → HARDEN → LAUNCH` — **وليس REBUILD.**

| الترتيب | المرحلة | المحتوى |
|---|---|---|
| 1 | **E1** ✅ | Teacher Runtime API — أُنجزت (CORE-28، دمج `9406a44`) |
| 2 | **E1 Proof** ✅ | HTTP/E2E للدورة التعليمية الكاملة — مثبتة: core-28 11/11 على PostgreSQL وRedis حقيقيين |
| 3 | **E2** ✅ | Learner Model API (`buildLearnerModel` — قراءة فقط) — **أُنجزت: `GET /v1/students/{id}/learner-model`، CORE-29 10/10، مدموجة `490887f`** |
| 4 | **E3** | Dictation Runtime Proof |
| 5 | **E4** | Actual UI: Student / Teacher / Principal / Administration / Directorate — **جزء العروض البرمجية للطالب (Dashboard/Lessons/Mastery View) أُنجز كـ API في CORE-31** |
| 6 | بعدها | Business E2E كامل |
| 7 | **G5** | Production Hardening: PostgreSQL، Backup/Restore، Redis، S3، Inference، Health، Shutdown، Metrics، Monitoring، Dependencies (G5-008)، CI/CD، Recovery، Performance |
| 8 | **Launch Gate** | Production Launch Gate — بقرار رسمي منفصل |

---

# سلسلة الالتزامات والوسوم المرجعية (مُتحقَّق منها في المستودع)

| الالتزام | الرسالة | الوسم |
|---|---|---|
| `e80a3e6` | core-27-r027-05-fix: loop-resumption idempotency | `core27-r027-05-fixed` |
| `2c7b8c5` | core-27-tests-batch2-2r: evidence suites | — |
| `9b942ae` | core-27-batch3-fix: R-027-01/R-027-02 closed | `core27-batch3-fixed` |
| `ce47180875430e53f53245261e586e2b1fbdffe5` | core-27-v3-runtime-integration: ADR-027/V-3 call sites | `core27-v3-integrated` |
| `bd7049768bb5026bf3334a3d41382b2d56118fb9` | core27-g5a-gap003-config-hardened | — |
| `341aa4d984cd45f9573424ca06a23a3c5a293937` | core-28 E2E full-cycle (إثبات E1) | `core28-e1-teacher-runtime` |
| `e2b5479fc81f9bda09948981c1c2869a67bba97b` | core-29 Learner Model API (E2) | `core29-e2-learner-model` |
| `04ed43ef37ed201a053f994f4b31ba2871271db1` | core-30 progress + recommendations (E3/P0) | `core30-e3-p0-progress-recommendations` |
| `a8d35d499ec11c7a6119a9dc2e481d1caada9a12` | core-31 student learning loop (E4/P0) | `core31-e4-p0-student-loop` |

**دموجات `main` بـ `--no-ff`:** E1 = `9406a44845c96401ff1f2c7bcefefd08088ee0f3` · E2 = `490887fb7c54bdabc46a6d1f78cc6973e1e90066` · E3/P0 = `58eb70e972e61d9cafe5e73dafdfaa9c4115ac97` · E4/P0 = `990e725421982f0c98486bd4d6232f9e84a1dd38`. بعدها مباشرة: **ACR-E4-002** (استعادة حد CORE-05 + Green Sweep لبنية الاختبارات) على `main` — انظر `git log -1`.

سلسلة الوسوم المكتملة في المستودع تشمل أيضًا: core-08-approved … core-15-checkpoint، core26c-zib-* (baseline/final/fix8b/recovery-fix5)، merge-p1…merge-p4-candidate، pre-merge. **git status نظيف (0 تغييرات)** عند إعداد هذه الوثيقة.

---

# الثوابت المعمارية غير القابلة للمساس (Invariants)

أي تنفيذ جديد يجب أن يخدم النتيجة النهائية ويحافظ على:

1. Canonical Evidence Ownership
2. Tenant Isolation
3. Student Isolation
4. RBAC
5. Teacher Gate
6. Learning Loop Domain
7. Execution Runtime
8. Contracts
9. Idempotency
10. Events/Outbox
11. Architecture Boundaries

---

# ⛔ بيان رسمي: لا تصريح بـ Production Ready

> **لا يوجد حاليًا — بموجب هذه الوثيقة المرجعية — أي تصريح باعتبار المشروع Production Ready، ولا تصريح بتنفيذ Production Deployment.**
>
> الإنتاج مرتبط ببوابات لم تُغلق بعد: **E3 (Dictation Runtime Proof)** و**E4 (Actual UI)** ثم G5 Production Hardening (بما فيها G5-008 للثغرات — غير المنفذة)، ثم Production Launch Gate بقرار رسمي منفصل. أما E1 وE2 وE3/P0 (CORE-30) وE4/P0 (CORE-31) فمُغلقة ومثبتة بسجلات حية. أي ادعاء بجاهزية الإنتاج قبل إغلاق هذه البوابات رسميًا يُعد مخالفًا للسجل الإداري للمشروع.

---

# ملحق: مصفوفة التحقق السريع (41 بندًا)

| # | البند | الحالة | دليل التحقق (2026-09-13) |
|---|---|---|---|
| 1 | Learning Loop foundation | ✅ | loop.ts + state-machine.ts + rbac.ts — ملفات موجودة ومقروءة |
| 2 | R-027-05 | ✅ | e80a3e6 + 2c7b8c5 + وسم core27-r027-05-fixed — git log/tag |
| 3 | Batch 3 isolation | ✅ | 9b942ae + وسم core27-batch3-fixed + LEARNER_DIMENSION_REGISTRY |
| 4 | ADR-027/V-3 | ✅ | docs/decisions/ADR-027-V3-RUNTIME-INTEGRATION.md (6,701B) |
| 5 | V-3 Runtime Integration | ✅ | ce47180 + وسم core27-v3-integrated + موضعا استدعاء في activity.ts وworker/index.ts |
| 6 | Evidence Architecture | ✅ | evidence-writer.ts + evidence-reader.ts |
| 7 | Contracts/Boundaries | ✅ | شجرة نظيفة؛ Drift PASS (سجل جلسة) |
| 8 | Events/Outbox/Queue | ✅ | dispatcher.ts + outbox.ts + idempotency.ts |
| 9 | Numeracy Engine | ✅ | engines/numeracy-engine + 41/41 (سجل جلسة) |
| 10 | Assessment Engine | ✅ | engines/assessment-engine + 37/37 (سجل جلسة) |
| 11 | Reading Engine | ✅ | engines/reading-engine + E2E core-26 (686 سطرًا) |
| 12 | Teacher Decision Logic | ✅ | القدرات الأربع + HTTP surface (teacher.ts، E1/CORE-28، 11/11) |
| 13 | Oversight Logic | ✅ | aggregation.ts + /v1/oversight/aggregates |
| 14 | G5-A.1 Secrets | ✅ | bd70497 = HEAD + ملفا env.ts/config.test.ts |
| 15 | الاختبارات | ✅ | 349/349، TSC 10/10، Drift/Scan PASS (سجلات جلسة) |
| 16 | Educational Full Cycle | ✅ | دورة الطالب الكاملة عبر HTTP (core-31: 7/7 + core-28: 11/11) |
| 17 | Teacher Runtime | ✅ | 4 واجهات API في teacher.ts + E2E (E1، دمج `9406a44`) |
| 18 | Learner Model | ✅ | packages/database/src/learner كامل + المسار في students.ts (E2/CORE-29) |
| 19 | Dictation Engine | ⚠️ | المحرك + adapter + 28/28 وحدوي؛ لا Runtime proof بعد |
| 20 | Intelligence | ✅ | insights + progress + recommendations عبر HTTP (E3/CORE-30، 6/6) |
| 21 | School/Admin/Directorate | ⚠️ | Domain مكتمل؛ لا واجهات مرئية |
| 22 | Teacher HTTP API Surface | ✅ | review-queue/decision/feedback/delivery (teacher.ts — E1) |
| 23 | HTTP E2E Teacher Cycle | ✅ | 11/11 على PostgreSQL وRedis حقيقيين (core-28 — ملتزم `341aa4d`) |
| 24 | Actual UI | ❌ | lib/api-client-react فقط؛ لا تطبيق |
| 25 | Parent Portal | ❌ | لا مسارات parent (فحص سلبي) |
| 26 | Learner Model API | ✅ | `e2b5479` + وسم `core29-e2-learner-model` + مدموج `490887f` + E2E 10/10 |
| 27 | Production PostgreSQL | ❌ | مذكور في المراجعة — بنية إنتاج غير موجودة |
| 28 | Production Redis | ❌ | مذكور في المراجعة |
| 29 | S3/Object Storage | ❌ | مذكور في المراجعة |
| 30 | Inference Gateway | ❌ | مذكور في المراجعة (افتراضي dev: localhost:50051) |
| 31 | Health/Readiness | ❌ | /healthz أولي فقط |
| 32 | API Graceful Shutdown | ❌ | Worker مكتمل (SIGTERM/SIGINT)؛ API بلا handlers |
| 33 | Metrics Security | ❌ | /metrics عام (reading.ts:67) — GAP-007 معلق التنفيذ |
| 34 | Logging/Redaction/Tracing | ⚠️ | redact.ts موجود؛ wiring غير مكتمل — GAP-013 معلق |
| 35 | Monitoring/Alerts | ❌ | مذكور في المراجعة — غير موجود |
| 36 | CI/CD | ❌ | لا artifacts (فحص سابق: none found) |
| 37 | Docker/Infra | ❌ | لا Dockerfile (فحص find سلبي) |
| 38 | G5-008 Dependencies | ❌ | AUDIT_EXIT=1 (1 critical، 12 high، 9 moderate) — PLANNED فقط |
| 39 | Performance/Load | ❌ | مذكور في المراجعة |
| 40 | Recovery/Disaster | ❌ | مذكور في المراجعة |
| 41 | Documentation Drift | ⚠️ | docs/buytuk-master/ موجود ويحتاج تحديثًا |

---

*نهاية الوثيقة المرجعية الموحدة — BuyTuk Academy — آخر تحديث: 2026-09-13 (إغلاق E4/P0 + ACR-E4-002) — HEAD الحالي: `git log -1` بعد فك الضغط*
