# ADR-029 — PHASE-4: Express 5 هو الـ Gateway القانوني (API-GATEWAY-ALIGNMENT)

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md) (**دون تعديل**)
> **Execution Protocol:** [`docs/reference/MANDATORY_EXECUTION_PROTOCOL.md`](../reference/MANDATORY_EXECUTION_PROTOCOL.md)
> **Binding contract:** [`docs/decisions/ARCHITECTURE_CONTRACT.md`](ARCHITECTURE_CONTRACT.md) (AC-1.0) · [`docs/decisions/P4_APPLICATION_COMPOSITION_DECISIONS.md`](P4_APPLICATION_COMPOSITION_DECISIONS.md) (P4D-01)

**التاريخ:** 2026-09-16 · **المرحلة:** PHASE-4 — API-GATEWAY-ALIGNMENT · **الحالة:** معتمد تنفيذيًا (بوابة MASTER_ROADMAP: «chosen gateway architecture documented + contract tests green»)

## السياق
- V1 §3.1/§6.2 يسمّي «API Gateway (NestJS 10)». الفحص الفعلي (مثبت في TRACEABILITY MATRIX ARCH-002): لا وجود لـ `@nestjs`/`NestFactory` في المستودع؛ البوابة الفعلية Express في `apps/api/src/{app,index}.ts`.
- **العقد المعماري الملزم AC-1.0** («أي تعارض بين وثيقة أخرى وهذه الوثيقة: هذه الوثيقة هي المرجع») نصّ صراحة: «إطار الـ API حالياً: **Express 5** (D-01)»، و`P4D-01` أكده: «apps/api = Express 5 Application Composition Layer».
- معيار خروج PHASE-4 (MASTER_ROADMAP حرفيًا): **«Align runtime architecture with documented gateway direction without breaking working domains» → «chosen gateway architecture documented + contract tests green»**.

## القرارات

### 1. المعمارية المختارة — Express 5 يبقى الـ Gateway القانوني
اعتمادًا للعقد المعماري الملزم (AC-1.0 D-01 + P4D-01)، تُوثَّق هذه المرحلة رسميًا: **Express 5 هو البوابة القانونية المختارة**. تبني NestJS 10 الآن = إعادة بناء بدون مبرر مثبت (مخالف لمبدأ Reuse-first وللبوابة «without breaking working domains»)، مع خيار ترحيل لاحق عبر ADR مستقبلي يقدمه المالك — نفس نمط ACR-E5-001/DEV-001.

### 2. العقد أولًا — المحاذاة باتجاهين مع openapi.yaml
`lib/api-spec/openapi.yaml` هو السطح الموثق للبوابة. **قانون PHASE-4 الملزم:** كل مسار موثق يجب أن يكون مخدومًا فعليًا، وكل مسار مخدوم يجب أن يكون موثقًا — مفروض باختبار دائم.

### 3. فجوات المحاذاة المغلقة (إضافية فقط — لا كسر)
- **G2:** `GET /healthz` الجذري (موثق) — فُعِّل عبر mount إضافي لراوتر الصحة القائم في `app.ts` (نفس المعالج الوحيد `HealthCheckResponse` — لا ازدواج).
- **G1b:** `GET /api/healthz` (منفذ فعليًا) — وُثّق في openapi.yaml.
- **G3:** `POST /api/auth/forgot-password` و`POST /api/auth/reset-password` (منفذان فعليًا في `routes/auth.ts:100,114`) — وُثّقا في openapi.yaml.
- (`/api/health` و`/api/metrics` تبيّن بالفحص أنهما مخدومان أصلًا عبر راوتر القراءة — ليستا فجوة.)

### 4. الإثبات
اختبار جديد `apps/api/test/gateway-contract.test.ts` (4 اختبارات) على التطبيق الحقيقي بلا محاكاة: كل مسار `/api/*` موثق = مخدوم (لا 404)؛ كل مسار مخدوم (20 مسارًا) = موثق؛ سطح `/v1` القانوني (25 مسارًا من `v1.yaml`) مخدوم بالكامل؛ `/healthz` الجذري = 200 `{status:"ok"}`.

## الحدود
- **مجمّد ولا يُمس:** V1، `_history/`، الوسم `BuyTuk.V0.1.3`، `lib/api-spec/v1.yaml` (مصدر توليد api-zod — لا انجراف)، migrations/schemas، أي منطق auth/RBAC/tenant/RLS (حدود PHASE-2).
- **لا تبعيات جديدة** (لا NestJS، لا supertest — الملفات تُفحص نصيًا)، **لا إعادة كتابة معمارية**، **لا تغييرات كسارة للنطاقات العاملة**.
- **DEV-002** → PARTIALLY RESOLVED (تكافؤ وظيفي وعقدي مثبت؛ تبنّي حزمة NestJS نفسها مؤجل لـADR مستقبلي).
