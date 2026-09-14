# BuyTuk Academy — CHANGELOG

سجل الإصدارات المرحلية (كل إثبات بأوامر حية موثقة في تقارير الإغلاق داخل `docs/reports/`).

## 2026-09-14 — BuyTuk.V.01.7 — Phase 1 Security & Authentication Hardening

### ما نُفّذ فعليًا
- إضافة تشديد صريح لإعدادات الأمان عبر `.env.example` مع مفاتيح `JWT_SECRET`, `AUDIO_KEK`, وحدود rate limiting قابلة للضبط من البيئة.
- توسيع قدرة المصادقة الحالية لاستخدام مدد JWT من البيئة، تدوير refresh token، وإضافة forgot/reset password مع تخزين `password_reset_tokens`.
- إضافة rate limiter مخصص لمسارات `/api/auth` و`/v1/auth` فوق الـ global limiter.
- ترقية واجهة `/ui` لتدعم: دخول الطالب، دخول الفريق، حفظ الجلسة، safe logout، forgot password، reset password.
- إضافة اختبار Phase 1 يغطي: bad password، expired token، auth bypass، rate-limit lockout، وreset password.
- إضافة migration جديدة: `packages/database/migrations/0006_core35_auth_phase1_hardening.sql`.

### ما لم يُنفّذ في هذه النسخة
- لم تُنفّذ أدوات penetration/XSS/CSRF/SQLi الاحترافية بعد؛ بقيت ضمن المرحلة اللاحقة لاختبارات الأمن الموسعة.
- لم تُبنَ لوحات المعلم/الإدارة بعد؛ الواجهة الحالية تضيف wiring آمنًا فقط.


## 2026-09-14 — BuyTuk.V.01.6 — Administrative Approval + Release Identity Upgrade

### نطاق الاعتماد
- **القرار:** اعتماد المرحلة **CORE-34A / P2-VOICE Browser Intake + Presigned Upload Wiring** كمرحلة منجزة رسميًا داخل المشروع.
- **طبيعة هذه النسخة:** ترقية هوية الإصدار والحزمة من **BuyTuk.V.01.4** إلى **BuyTuk.V.01.6** دون تغيير وظيفي جديد على الكود beyond closeout/release metadata.
- **التالي مباشرة:** يبقى **CORE-34B / P2-VOICE Runtime Proof** هو أول بند غير مكتمل في خارطة التنفيذ.

### ما تم تحديثه في ملفات المشروع
- `docs/reference/PROJECT_VERSION.md` → الهوية الرسمية أصبحت **BuyTuk.V.01.6**.
- `CHANGELOG.md` → إضافة سجل الاعتماد الإداري لهذه النسخة.
- `EXPORT_README.md` → ترقية وصف الحزمة وروابط الدليل إلى النسخة الجديدة.
- `MANIFEST.sha256` → إعادة توليد manifest النهائي بعد تحديث ملفات الإصدار.
- `docs/reports/V0.1.6-RELEASE-APPROVAL.md` → تقرير اعتماد الإصدار.

### الحالة الوظيفية الموروثة في V0.1.6
- **CORE-34A** معتمد كما أُنجز في النسخة السابقة: UI صوتي، presigned upload، وsubmit حقيقي غير متزامن.
- **لا يوجد claim جديد** بإثبات Browser → Worker → Gateway → STT في هذه النسخة؛ هذا يبقى ضمن **CORE-34B**.

## 2026-09-14 — BuyTuk.V.01.4 — CORE-34A / P2-VOICE Browser Intake + Presigned Upload Wiring

### نطاق المرحلة المعتمدة
- **الهدف:** بدء التنفيذ الفعلي لـ **P2-VOICE** دون إعادة بناء المعمارية: تفعيل واجهة الطالب للأنشطة الصوتية عبر اختيار ملف صوتي من المتصفح، طلب presigned URL من المسار القائم، رفع الملف، ثم إرسال المحاولة إلى مسار القراءة غير المتزامن الحقيقي.
- **خارج النطاق في هذه النسخة:** تشغيل Gateway/STT end-to-end، إضافة خدمات جديدة، أو اختلاق درجات/نتائج صوتية غير موجودة.

### ما نُفّذ فعليًا
- **واجهة الطالب** (`apps/api/src/public/index.html`, `app.js`, `styles.css`): لم يعد النشاط الصوتي مجرد notice unsupported؛ أصبح له شاشة تنفيذ حقيقية داخل المنتج.
- **Browser voice intake:** اختيار ملف صوتي `audio/*` من جهاز الطالب، وإظهار metadata الحقيقية (`passageId`, `sessionId`, `expectedText`) إن كانت منشورة على النشاط.
- **Presigned upload wiring:** استدعاء `GET /api/audio/presign?...op=putObject` ثم رفع الملف إلى الـ signed URL قبل إرسال المحاولة.
- **Reading submit wiring:** تمرير `audioKey + passageId + sessionId + expectedText` إلى `/v1/attempts/:id/submit` ليُنشئ صف محاولة القراءة ويضع job في المسار غير المتزامن.
- **اختبار متصفح حقيقي جديد**: `tests/core-32/p2-voice-ui-upload.e2e.test.ts` يثبت browser file selection + presign request + upload + real async submit.

### نتيجة المرحلة
- **تم بدء التنفيذ الفعلي للصوت من جهة المنتج (UI + upload + async submit)**.
- **الحالة الحالية للمحاولة الصوتية في هذه النسخة:** `SUBMITTED` بشكل حقيقي، بلا اختلاق evidence أو score قبل اكتمال العامل.
- **التالي مباشرة:** CORE-34B لإثبات Browser → Worker → Gateway → STT.

## 2026-09-14 — BuyTuk.V.01.3 — Consolidated Full Project Release (V0.1.2 + approved P2 + preserved P2-VOICE inspection)

### توحيد المشروع في مستودع BuyTuk الواحد
- **نفس المشروع، ليس مشروعًا ثانيًا:** هذه النسخة تجمع **BuyTuk.V.01.2** baseline الرسمية + كل أعمال **P2 Real LLM** المعتمدة + artifacts الفحص الحالية الخاصة بـ **P2-VOICE** داخل نفس الشجرة والتاريخ.
- **الحفاظ على baseline السابقة:** الوسم `buytuk-v01.2` يبقى مرجعًا ثابتًا لـ `1823e9757af20c06825badb61e1563ae3f406906`؛ لا rewrite للتاريخ.
- **حفظ artifacts خارج الشجرة:** تم إدخال التقرير الخارجي `P2-GATE-1-REAL-INFERENCE-INSPECTION.md` إلى `docs/reports/` وتسجيل inventory تصنيفي في `docs/reference/archive-inventory/V0.1.3-CONSOLIDATION-INVENTORY.md`.

### ما الذي أصبح مضمنًا رسميًا في V0.1.3
- **P2 Real LLM**: `LLMProvider` + `GatewayLLMAdapter` + تحديث `inference-client.ts` (deadline / timeout / retryable failure handling / `x-tenant-id`) + `degraded` fallback + أدلة **core-33**.
- **المراجع التنفيذية:** ربط `BUY-TUK-ACADEMY-V1.0.0.md` و`EXECUTION-REFERENCE.md` و`DOCUMENT-V1-COMPLIANCE-AUDIT.md` في ADRs والتقارير وسجل الإصدارات بحيث يبدأ أي مطور جديد من الوثيقة المرجعية أولًا.
- **P2-VOICE:** **Inspection-only / HOLD** — لا Gateway صوتي جديد، لا upload endpoint جديد، لا DB schema changes، لا Docker/K8s جديدة في هذه النسخة.

### الوضع الوظيفي عند هذه النسخة
- **Student UI:** ما زالت البوابة الحقيقية الوحيدة — **UI Coverage = 20%**.
- **Learning Loop:** **14/14** انتقالًا Real من المتصفح.
- **LLM path:** الإنتاج لم يعد يحتوي `mockLLMCall`؛ المسار الحقيقي المعتمد هو `LLMProvider → GatewayLLMAdapter → Feedback RPC`.
- **Voice runtime:** ما زال غير مُثبت من Browser→Gateway→STT؛ يبقى Phase B inspection only.

## 2026-09-14 — BuyTuk.V.01.2 — Baseline رسمية (P1 Student Web UI + تثبيت الوثيقة المرجعية)

### P1 — Student Web UI (CORE-32، فرع `p1-student-ui`، التزام `43c42a6`، وسم `core32-p1-student-ui`، دمج `b2e09e6`)
- **واجهة الطالب** (`apps/api/src/public/` — SPA عربية RTL صفرية البناء، تُقدم من عملية الـ API الحقيقية نفسها): دخول → لوحة → الدروس → النشاط → الإرسال → النتيجة → التقدم/الإتقان/الفجوات/التوصيات → إعادة — **صفر بيانات وهمية**: كل قيمة من `/v1` حرفيًا؛ القراءة الصوتية تُعلن «غير مدعومة في الواجهة بعد».
- **كشف `metadata`** (إضافي فقط): mapper + عقود zod + OpenAPI — نص السؤال الحقيقي المُحاور يصل الواجهة (ACR-E5-001).
- **حسم Remediation**: اعتماد الـ MVP القائم (توصية → nextActivity → إعادة → تحسن) — لا كاتب جداول علاج حتى قرار مستقبلي (نمط ACR-E4-001).
- **E2E المتصفح الحقيقي 5/5** (core-32، Playwright Chromium v1243): الدورة الكاملة على PG+Redis+HTTP حقيقيين، صفر API mocks — إجابة خاطئة (91≠92 → FINAL_ANSWER_ERROR حقيقي) → EVIDENCE_RECORDED → إعادة صحيحة → strong/improving في نموذج المتعلم الحقيقي.
- الأمن: 401 بلا توكن · 403 خارج النطاق · عزل مستأجر بالقيم · IDOR · UUID شاذ (400) · cross-tenant (404).

### تثبيت الوثيقة المرجعية (Source of Execution)
- `docs/reference/BUY-TUK-ACADEMY-V1.0.0.md` — الوثيقة الشاملة الأصلية (2026-08-30) **حرفيًا byte-identical** (SHA-256 `4d43e011…`) — Baseline غير قابل للتعديل.
- `docs/reference/EXECUTION-REFERENCE.md` — بروتوكول ملزم: راجع الوثيقة → افحص الكود والـ ADRs → نفّذ الناقص فقط (Requirements Reference → Current Architecture → Reuse → Integrate → Complete → Prove).
- `docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md` — خط الأساس الرسمي (🟠 FUNCTIONALLY PARTIAL) + تحديث ما بعد P1: **UI Coverage 0% → 20%** (بوابة الطالب حقيقية)، **Learning Loop 14/14** من المتصفح، الحكم يبقى 🟠 حتى إغلاق بقية الفجوات.
- `docs/reference/PROJECT_VERSION.md` — هوية هذه النسخة.

### Green Sweep التجميعي (على شجرة الدمج `b2e09e6`)
TSC شامل EXIT=0 · انحدار core-25→31 = **98/98** على قواعد نظيفة · core-32 5/5 · config 11/11 + curriculum 18/18 · Schema Drift **PASS** (db-push-verify → schema-drift-check، EXIT=0) · Secret Scan نظيف · الشجرة نظيفة (0).

## 2026-09-13 — إغلاق P0 الكامل: دورة الطالب عبر HTTP من طرف إلى طرف (CORE-28→31 + ACR-E4-002)

### ACR-E4-002 — استعادة حد الملكية CORE-05 + Green Sweep لبنية الاختبارات (على `main`)
- **اكتشاف جولة التحقق الشاملة:** كتلة تقارب R-026-05 في معالج القراءة كانت تستعلم `evidenceTable` مباشرة — خرق لحد الملكية CORE-05 (المحركات عبر recordEvidence/القارئ فقط).
- **الإصلاح المعماري:** قدرة قراءة قياسية جديدة `findEvidenceByOperationKey` في core-platform (`evidence-reader.ts`، مُصدَّرة من `@workspace/db`) — المحرك لم يعد يلمس الجدول.
- **Green Sweep:** حصر 6 إعدادات vitest بملكيتها (`test.include` بالنمط القانوني: config/observability/security/api/worker/reading-engine) + حذف 5 استيرادات `reflect-metadata` شاردة بلا إعلان + تحديث mock CORE-03A ليتوافق مع بوابة التقارب.
- **الجولة النهائية على الشجرة:** **609 اختبارًا أخضر فريدًا** + TSC شامل EXIT=0 + Schema Drift PASS عبر `db-push-verify.mjs` (EXIT=0، صفر انحراف صلب) + Secret Scan نظيف.

### E4/P0 — CORE-31 (دمج `990e725421982f0c98486bd4d6232f9e84a1dd38` ← `a8d35d499ec11c7a6119a9dc2e481d1caada9a12`، وسم `core31-e4-p0-student-loop`)
- **Lesson Runtime (المحور):** `GET /v1/lessons` + `GET /v1/lessons/:lessonId` — اكتشاف الدروس المنشورة (سجل kind مفتوح) وفتح الدرس مع تمارينه المرتبطة (ربط `content_id` القائم) — صفر جداول جديدة.
- **Student Dashboard:** `GET /v1/students/{id}/dashboard` — تجميب قراءة واحد: المهارات/نقاط القوة/الضعف/الفجوات (نموذج المتعلم) + التقدم (SLR) + الإتقان (الصفوف القائمة) + التوصيات والنشاط التالي (مسار تعلم مشتق من الأدلة) + آخر الأنشطة — **بلا overallScore/student_level**.
- **Mastery View:** `listMasteryRecords` — SELECT فقط فوق `mastery_records` القائم (الكاتب الوحيد يبقى معالج القراءة)؛ تعميم الكتابة = **ACR-E4-001 PENDING**.
- **E2E 7/7** على `core31_verify`: الدورة كاملة (درس → محاولة خاطئة → دليل بنوع خطأ حقيقي FINAL_ANSWER_ERROR → فجوة → توصية علاجية → إعادة → تحسن strong/IMPROVING → صف إتقان من الكاتب الحقيقي PROGRESSING/85 → قرار تعلم تالٍ مُعاد اشتقاقه) + الحزمة الأمنية (IDOR/نطاق/عبر-مستأجر/UUID شاذ/بلا توكن) + عزل بالقيم.
- إصلاحان نوعيان اكتشفهما TSC الحي (استيراد مكرر + قائمة بيضاء لحالة المحتوى) — لا تغيير سلوك.

### E3/P0 — CORE-30 (دمج `58eb70e972e61d9cafe5e73dafdfaa9c4115ac97` ← `04ed43ef37ed201a053f994f4b31ba2871271db1`، وسم `core30-e3-p0-progress-recommendations`)- `GET /v1/students/{id}/progress` (جدول زمني طولي — سلاسل متعددة الأبعاد، بلا درجة كلية).
- `GET /v1/students/{id}/recommendations` (أنماط الطالب → مسار تعلم، `requiresTeacherApproval:true`).
- E2E 6/6 على `core30_verify` (عزل بالقيم والمراجع + سلبيات RBAC كاملة).

### سابقة (خلاصة)
- **E2/CORE-29:** Learner Model API (`core29-e2-learner-model`، دمج `490887f`) — 10/10.
- **E1/CORE-28:** Teacher Runtime + دورة كاملة عبر HTTP (`core28-e1-teacher-runtime`، دمج `9406a44`/`ce47180`) — 11/11.
- **V-3/CORE-27:** ADR-027/V-3 + Runtime Integration (`core27-v3-integrated`، `ce47180`) + R-027-05 (`core27-r027-05-fixed`) + Batch3 (`core27-batch3-fixed`) + G5-A.1 (`bd70497`).

## إجمالي الاختبارات الخضراء عند هذا الإصدار (بلا ازدواج)
**609 فريدًا** = انحدار core-17→26 (209) + core-27 (31) + core-28 (11) + core-29 (10) + core-30 (6) + core-31 (7) + الحزم (208 تشمل core-07/learning-loop 31 وdatabase 55) + المحركات (122: numeracy 41، assessment 37، reading 16، dictation 28) + التطبيقان (5، اختبارا queue متروكان مقصودًا) — مع TSC 11/11 · Drift PASS · Secret Scan PASS.

## الحدود
لا تصريح Production Launch. بعد **BuyTuk.V.01.3** أصبح مسار **P2 Real LLM** مضمّنًا، لكن ما زال المتبقي من خارطة الطريق: **P2-VOICE vertical slice الحقيقي** + E3 (Dictation Runtime Proof) + Teacher/Parent/Admin UI + English/Science + Gamification + G5 Production Hardening. تعميم كتابة الإتقان يبقى **ACR-E4-001 PENDING**.
