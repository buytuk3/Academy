# عقد المعمارية — BuyTuk Academy

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)

## ARCHITECTURE_CONTRACT.md · الإصدار AC-1.0 · 2026-09-06 · الحالة: رسمي (Approved)

> الوثيقة الرسمية الملزمة التي يُبنى عليها كل شيء لاحقًا. صادرة بعد اعتماد قرارات D-01 → D-05.
> كل Engine جديد وكل تغيير معماري يجب أن يجتاز بوابات هذا العقد قبل أي تنفيذ.
> أي تعارض بين وثيقة أخرى وهذه الوثيقة: **هذه الوثيقة هي المرجع**.

---

## 1. System Vision (رؤية النظام)

BuyTuk Academy هي منصة **Educational Intelligence Platform** — وليست Reading Engine Platform.

- **الطالب هو مركز المنظومة**، وليس الـ Engine.
- المحرك الأول (MOD-001 / Reading) هو **Capability Engine** داخل المنظومة، وليس مركز النظام.
- المسار: آلاف → مئات الآلاف → ملايين الطلاب → منصة عالمية، **دون إعادة كتابة Core Architecture**.
- المنصة نفس البنية يجب أن تخدم طالبًا في مصر أو السعودية أو أي دولة، وبأي لغة أو منهج، دون إعادة بناء Core.

القيم غير القابلة للتفاوض:
1. الطالب يملك **سجل تعلم طويل الأمد** (Student Learning Record).
2. القرارات التعليمية **مبنية على الأدلة** (Evidence-Based)، وAI مساعد وليس صاحب القرار الوحيد.
3. الفصل الواضح بين **Core Learning Platform** و **Expanded Platform** في مراحل التنفيذ.
4. **Capability-first** وليس Code-first: «لدي ملفات كثيرة» لا يعني «النظام يتقدم».

---

## 2. Architecture Principles (مبادئ المعمارية)

1. **Modular Monolith أولاً** → Horizontal Scaling → Service Extraction عند الحاجة فقط (بلا Overengineering).
2. **Single Owner + Clear Contract** لكل Capability — لا تكرار مسؤوليات.
3. **Framework-independent Core**: Business Rules لا تُربط بـ Express (أو أي إطار). إطار الـ API حالياً: **Express 5** (D-01).
4. **لا Business Logic تعليمية داخل Express Controllers** — Controllers = Transport فقط.
5. **Zero Duplication**: كل كود له موضع واحد فقط في النظام.
6. **Data Ownership**: Single Source of Truth في `packages/database`، وكل مجموعة بيانات لها Owner واحد.
7. **Event Contracts اليوم، Event Bus لاحقًا** عند الحاجة المثبتة.
8. **Heavy Workloads** (Audio, STT, Alignment, Reports, Content, Analytics, AI, Imports) → Worker/Queue دائمًا، لا حجز للـ API.
9. **Model Independence**: تغيير النموذج (Whisper → X) لا يعيد كتابة أي Engine — عبر Inference Gateway فقط.
10. **Security & Observability من التصميم**، لا بعد الإطلاق.
11. **Multi-tenancy readiness من اليوم** (لا إعادة تصميم Identity عند إضافة منظمات/مدارس/مناطق).
12. **Platform beats Feature**: لا دخول Feature كبيرة إلى Core لمجرد وجودها في وثيقة — عبر ADR فقط.

---

## 3. Module Boundaries (حدود الوحدات)

### 3.1 الهيكل المستهدف (الوجهة النهائية)

```
buytuk-unified/
├── apps/
│   ├── api/          # Orchestration + Transport فقط (REST + WebSocket)
│   └── worker/       # تنفيذ غير متزامن (BullMQ Workers)
├── engines/
│   ├── reading/                  # MOD-001 (Accredited Foundation)
│   ├── assessment/               # MOD-002 (لاحقًا — بوابة)
│   ├── learning-diagnosis/       # تشخيص فجوات/مفاهيم خاطئة
│   ├── mastery/                  # حالة الإتقان وتقييمها (واحد فقط)
│   ├── intervention/             # تخطيط وتتبع التدخل
│   ├── learning-intelligence/    # قرار تعليمي شامل + توصيات
│   ├── content/                  # توليد وإدارة المحتوى
│   └── lesson/                   # تخطيط الدروس وتوصيلها
├── domains/          # معرفة المادة: arabic · english · math · science (…)
├── packages/
│   ├── contracts/    # نقطة التعاقد الوحيدة: DTOs + Types + Events + OpenAPI
│   ├── database/     # مصدر الحقيقة الوحيد: schema موحّد + migrations + seeding
│   ├── queue/        # BullMQ موحّد (إعدادات + أنواع + DLQ)
│   ├── config/       # Env vars + إعدادات مشتركة
│   ├── security/     # Auth + Encryption + S3 + RLS أدوات
│   ├── observability/ # Logger + Metrics + Tracing
│   └── shared/       # utils عامة بلا منطق تعليمي
├── inference-gateway/  # خدمة مستقلة (Python/gRPC) — الحد الرسمي للنماذج
└── infra/             # docker · k8s · cloudformation · CI
```

### 3.2 قواعد الطبقات (Layering)

```
Transport (apps/api Controllers)
        ↓
Application Services (Orchestration)
        ↓
Engine Contracts (packages/contracts)
        ↓
Engines / Domains (منطق تعليمي)
        ↓
Packages (database · queue · security · observability …)
```

**قواعد ملزمة:**
- `apps/*` **لا تحتوي** منطقًا تعليميًا — Orchestration فقط.
- `engines/*` **لا تعرِف** Express/Socket — تتعامل عبر Contracts فقط.
- `packages/*` **لا تعرِف** Engines إطلاقًا (لا اعتماد عكسي).
- `domains/*` تستهلك Engines ولا تعيد بناءها.

---

## 4. Engine Ownership (من يملك ماذا)

| Capability | يملك حصريًا | لا يملك أبدًا | الحالة |
|---|---|---|---|
| **Reading Engine** (MOD-001) | AudioProcessing · VAD · STT · ForcedAlignment · G2P · PhonemeAnalysis · ReadingAccuracy · Fluency · ReadingScoring · ReadingFeedback · ReadingAnalysis | Mastery العام · التقييم العام · التشخيص · تخطيط التدخل · التوليد العام للمحتوى | ✅ معتمد كأساس |
| **Assessment Engine** | GeneralAssessment · Evaluation · Scoring · Grading · Percentile · Formative/Summative/Diagnostic | Reading-specific internals · Mastery الخاصة بالقراءة | 🔒 بوابة (MOD-002) |
| **Mastery** | MasteryState + MasteryEvaluation (نسخة واحدة في النظام كله) | لا ثانية داخل Reading/Diagnosis/Adaptive | 🔒 بوابة |
| **Learning Diagnosis** | LearningGaps · Misconceptions · Diagnosis · DiagnosticEvidence · DiagnosisHistory | Mastery · التدخل · التقييم | 🔒 بوابة |
| **Intervention** | InterventionPlanning · RemediationStrategy · InterventionTracking | التشخيص · توليد المحتوى | 🔒 بوابة |
| **Learning Intelligence** | CrossDomainDecision · EvidenceAggregation · RecommendationOrchestration · DecisionPolicies · AI-assisted Reasoning | تنفيذ التدخل · حالة الإتقان | 🔒 بوابة |
| **Content Engine** | ContentGeneration · Question/ExerciseGeneration · ContentManagement · Versioning · Approval · AdaptiveContent | التشخيص · التقييم | 🔒 بوابة |
| **Lesson Engine** | LessonPlanning · Objectives · Sequencing · Delivery · Pacing · Interaction | توليد المحتوى | 🔒 بوابة |

---

## 5. Domain Ownership (ملكية المعرفة)

- الدومينات (Arabic, English, Math, Science, …) تملك **معرفة المادة**: قواعد، صوتيات، مفردات، مناهج، معايير.
- Engines **عامة** (mechanism)، Domains **خاصة بمادة** (knowledge).
- الدومين يعرّف: معايير المحتوى، قواعد النطق للمادة، خرائط المفاهيم الخاطئة للمادة.
- **لا يبني الدومين Engine جديدًا ولا يكرر منطق Engine موجود.**

---

## 6. Data Ownership (ملكية البيانات)

**Single Source of Truth = `packages/database`** (schema واحد + migrations + seeding + RLS-readiness).
**لكن**: وجود DB موحّد ≠ أن كل Engine يملك كل الجداول؛ كل مجموعة بيانات لها **Owner** واحد:

| مجموعة البيانات | Owner | الجداول |
|---|---|---|
| Identity | Shared (API/Auth) | `tenants` · `users` · `refresh_tokens` · `schools` · `classes` · `teachers` · `students` · `enrollments` · `api_keys` |
| Reading | Reading Engine | `passages` · `reading_sessions` · `attempts` · `reports` · `phoneme_stats` |
| Mastery | Mastery | `mastery_records` |
| Diagnosis | Learning Diagnosis | `gaps` · `diagnoses` · `diagnostic_evidence` |
| Intervention | Intervention | `intervention_plans` · `remediation_activities` · `remediation_assignments` |
| Assessment | Assessment Engine | `assessments` · `scores` · `assessment_results` |
| Learning Intelligence | Learning Intelligence | `recommendations` · `decision_logs` |
| Analytics | Analytics (Read Models) | `progress_snapshots` · `impact_measurements` · `teacher_insights` |
| System | Shared | `audit_logs` |

**قواعد الوصول:**
- الكاتب: **Owner فقط**. القارئ: عبر **Application Contracts** معتمدة — لا وصول مباشر عبر حدود الملكية.
- لا `Reading → يكتب في كل الجداول` ولا `Diagnosis → يكتب في كل الجداول` ولا `API → يكتب في كل الجداول`.
- أي جدول جديد → ADR + Owner + Contract قبل التنفيذ.

---

## 7. Contract Ownership (ملكية العقود)

- `packages/contracts` هي **نقطة التعاقد الوحيدة** (DTOs + Types + Events + OpenAPI/Zod schemas).
- **لا Types مكررة داخل Engines** — كل عقد له Owner واحد (وفق قائمة F في تقرير المحاذاة).
- تغيير عقد → **ADR + Versioning** — والعقود تُصدر بإصدارات semver.
- الأحداث موحّدة في `packages/contracts/events` (انظر §12).
- OpenAPI (api-spec) + Zod (api-zod) + React Query client (api-client-react) تُولَّد من عقد واحد — لا مصادر متعددة.

---

## 8. Dependency Rules (قواعد التبعيات)

1. الاتجاه المسموح: `apps → engines → packages` و `domains → packages` (Domains قد تستهلك Engines عبر عقودها فقط).
2. **ممنوع**: Engine → Engine مباشرة (التواصل عبر Contracts/Events فقط).
3. **ممنوع**: Package → Engine (لا اعتماد عكسي).
4. **ممنوع**: Circular Dependencies — لا import يعود للوراء؛ كل وحدة تُصنَّف Leaf أو Dependent.
5. التبعيات تُحقن عبر **واجهات/DI** (توحيد نهج Inversify الموجود في MOD-001 — داخل حدوده).
6. فحص تلقائي للتبعيات (dependency-cruiser) ضمن CI — أي حلقة جديدة = فشل البناء.
7. إصدارات موحّدة: **Express ^5** (ترقية engine من ^4.19.2 إلى ^5.x في الدمج)، Zod بنسخة واحدة (تجنّب تعارض drizzle-zod/Zod-v4: استخدام `z.string().email()` القياسية، لا `z.email()`، وعدم مزج schemas).

---

## 9. API Rules (قواعد الـ API)

1. **Controllers = Transport فقط** — لا Business Logic في Controller/Route.
2. `apps/api` يعمل **Orchestration** (تنسيق Engines) لا تنفيذًا تعليميًا.
3. REST موحّد: `/v1/...` + توثيق OpenAPI مولّد من `packages/contracts`.
4. Realtime (Socket.io) معزول في `apps/api` كطبقة WS مستقلة (events: `session:start`, `audio_chunk`, `session:stop`, `progress`, `completed`, `failed`, `disconnect`).
5. صحة المدخلات عبر Zod (نسخة واحدة) — رفض غير الصالح قبل دخول أي Engine.
6. أخطاء موحّدة: كود خطأ + معرف trace + رسالة آمنة (بلا تسريب تفاصيل داخلية).
7. Idempotency للإجراءات غير الآمنة (خاصة ما يحيل إلى Queue).

---

## 10. Authentication / Authorization

```
Unified Identity → Authentication → Authorization/RBAC → Tenant/Organization Scope
```

1. **مصدر Auth واحد** — لا Reading Auth / API Auth / Teacher Auth منفصلة.
2. **Access Token: 15 دقيقة** + **Rotating Refresh Token** (SHA-256، تخزين آمن) — وفق D-03.
3. RBAC: `admin · principal · teacher · student · parent` (+ مستقبلًا: organization, school, district — دون إعادة تصميم Identity).
4. **Multi-tenancy readiness**: `tenant_id` في الجداول + Claims منذ اليوم، رغم أن التفعيل الكامل (RLS) يقع مع الهجرة النهائية.
5. JWT secrets: قابلة للإدارة والـ rotation؛ **ممنوع** قيم افتراضية في الإنتاج.
6. Auth يجلس في `packages/security` ويُستهلك من `apps/api` + Workers (تحقق ثانوي عند الحاجة).

---

## 11. Queue Rules (قواعد قوائم الانتظار)

1. كل عمل ثقيل (Audio Processing · STT · Alignment · Phoneme Analysis · Report Generation · Content Generation · Analytics Aggregation · AI Processing · Large Imports) → **Worker/Queue** — لا حجز للـ API.
2. BullMQ موحّد عبر `packages/queue` (إعداد + أنواع + DLQ) — لا نسخ إعدادات لكل Engine.
3. Worker يدعم: **retries · idempotency (job keys) · DLQ · job status · observability · recovery**.
4. منطق الأعمال **ليس** في إعداد الـ queue؛ `packages/queue` يملك إعدادات/بنية، وأي Worker يسكن `apps/worker`.
5. Worker يصل إلى البيانات عبر `packages/database` + يعمل عبر Engine Contracts — لا وصول مباشر عشوائي.
6. القوائم المعتمدة حاليًا: `analyze` · `analyze-dlq` · `realtime` (MOD-001) — تُوسَّع عند الحاجة المثبتة فقط.

---

## 12. Event Rules (قواعد الأحداث)

1. **Event Contracts اليوم، Event Bus لاحقًا** — الأحداث Contracts موثقة (id, type, version, occurredAt, actor, tenantId, studentId, payload) تصدر من Source of Truth واحد.
2. الأحداث المعتمدة (Contracts أولية):
   `StudentAttemptedExercise` · `StudentCompletedReading` · `ReadingAnalyzed` · `MistakeDetected` · `AssessmentCompleted` · `MasteryUpdated` · `DiagnosisCreated` · `InterventionAssigned` · `InterventionCompleted` · `TeacherReportGenerated` · `StudentResponseRecorded` · `InterventionOutcomeMeasured`
3. الأحداث تُنتجها **Owners** فقط وتُستهلك افتراضيًا في **Student Learning Record** (§18) والتحليلات.
4. لا أحداث ضخمة تحمل تفاصيل داخلية للـ Engine؛ الحدث يعلن «ماذا حدث»، والتفاصيل تُسترجَع عبر Contracts.
5. كل حدث قابل للتتبع إلى أدلة (evidence) — وفق مبدأ §8 من التوجيه (Evidence-Based).

---

## 13. Inference Boundary (حدود الاستدلال)

```
Engine → Inference Contract → Inference Gateway → Model
```

1. **إلزامي**: لا Python/Whisper/Model مباشر داخل API أو Worker — كل ML عبر Gateway.
2. Gateway خدمة مستقلة (gRPC): خدمات `Health` · `Transcribe` · `AlignWord` (WhisperX) · G2P (MMS) · VAD (Silero) · Enhancement (DeepFilterNet) — كما في MOD-001.
3. **Model Independence**: تبديل النموذج = تغيير داخل Gateway + config فقط (نماذج موثقة: `whisper-large-v3-turbo (2024.10)` · `whisperx-alignment (3.1.1)` · `mms-fa-arabic (2024.05)` · `camel-tools (1.6.2)` · `silero-vad (5.1)` · `DeepFilterNet (0.5.6)`).
4. Engine يعتمد عقد `InferenceClient` (واجهة) — التنفيذ الفعلي (gRPC) في `packages`/integration داخل حدود Gateway.

---

## 14. Security Rules (قواعد الأمان)

1. **RLS**: جزء من تصميم multi-tenancy — تُطبَّق مع الهجرة النهائية للـ schema الموحّد (لا تؤجَّل لمابعد الإطلاق).
2. **Audit Pipeline فعلي** وليس Table فقط: أحداث حساسة (login/logout, token refresh, role change, data export, intervention assign, teacher report) تُكتب عبر `packages/observability`/audit مع Owner.
3. **Children's Data**: Data Retention + Privacy Policy من التصميم (لا بعد الإطلاق).
4. الصوت: **AES-256-GCM** (KeK) + **Signed URLs** + Access Control + Retention ✅ (موجود في MOD-001 — يُحفظ كما هو).
5. JWT: إدارة secrets + rotation؛ لا افتراضيات في الإنتاج.
6. حماية عامة: helmet + rate limiting ✅ (موجود — يُوحَّد في apps/api).
7. لا تسجيل بيانات حساسة (PII) في logs.

---

## 15. Observability (المراقبة)

1. السلسلة: `Request → Trace → Application → Engine → Queue → Inference → Database`.
2. مقاييس معتمدة: latency · failures · queue delay · inference time · DB performance · model performance.
3. Logs منظمة (pino، موجود في MOD-001) + **Tracing (OTel)** + **Metrics (Prometheus)** — من اليوم لا لاحقًا.
4. كل Engine ينشر أهدافه (SLIs) المعروضة على `/metrics`.
5. عند ملايين الطلاب: logs وحدها لا تكفي — tracing مترابط إلزامي.

---

## 16. Multi-tenancy Readiness (الجاهزية)

1. `tenant_id` في كل جدول بيانات + Claims في الـ JWT (مطبَّق في التصميم من اليوم).
2. نمذجة: **Organization / School / District** ككيانات Tenant قابلة للتسلسل.
3. Isolation: بيانات الطلاب معزولة عن المعلمين/المدارس/المناطق — عبر RLS لاحقًا.
4. لا حاجة لإعادة تصميم Identity عند إضافة Tenants جديدة.

---

## 17. Scalability Principles (مبادئ القياس)

1. **Modular Monolith + Horizontal Scaling + Async Workers + Inference Gateway + Caching + Observability + Future Service Extraction**.
2. لا Microservices الآن (بلا Overengineering) — لكن كل Module **قابل** لأن يصبح Service إذا أثبتت البيانات حاجة فصله.
3. عمليات Stateless (API بلا حالة محلية) — الحالة في DB/Redis.
4. Connection Pooling لكل PostgreSQL (لا Pool لكل عملية).
5. كل مسار ساخن يقاس أولاً (لا تحسين تخميني).

---

## 18. Student Learning Record (سجل التعلم)

- **Longitudinal Learning State/History** للطالب — ليس Engine ولا يكرر مسؤوليات أحد.
- يجمع: `sessions · activities · attempts · assessments · mistakes · mastery · diagnosis · interventions · progress · recommendations · outcomes`.
- يُبنى من **الأحداث** (§12) التي تنتجها Engines — Aggregate/Read Model.
- Owner: **Learning Intelligence** (بالتعاون مع API) — القراءة للعرض للمعلم/ولي الأمر/الإدارة عبر Contracts.
- الطالب هو مركز المنظومة: كل Engine يغذّي هذا السجل ولا يملكه.

---

## 19. Learning Loop (دورة التعلم)

```
Student → Activity → Response → Measurement → Analysis → Diagnosis
→ Mastery Update → Learning Decision → Intervention → New Activity
→ Reassessment → Progress → Teacher Insight
```

1. هذه **دورة ملزمة** لكل تصميم Capability جديد.
2. كل Engine يخدم حلقة واحدة أو أكثر من الحلقة عبر Contract واضح.
3. القرار التعليمي داخل الحلقة يجب أن يجيب: **لماذا اتخذه النظام؟ وما الأدلة؟** (Evidence-Based) — وفق:

```
Raw Data → Measurement → Evidence → Rules/Models → Diagnosis
→ Decision → AI Assistance (where appropriate) → Intervention → Outcome
```

4. لا AI وحده يقرر؛ القرارات المهمة قابلة للتفسير (Explainable) ومسجلة.

---

## 20. Definition of Done (تعريف الإنجاز)

أي Engine/Capability **جاهز** فقط إذا توفر:

| البعد | المعيار |
|---|---|
| Why | غرض مكتوب وقرار معتمد (ADR/Gate) |
| Owner | Owner واحد معلن |
| Contract | عقود في `packages/contracts` + OpenAPI |
| Data | جداول Owner في `packages/database` + migrations |
| Dependencies | بلا دورات، بلا تكرار (فحص آلي في CI) |
| Tests | وحدة + تكامل (vitest) — خضراء |
| Observability | logs + metrics + trace |
| Security | Auth/RBAC + audit + retention |
| Scalability | مسارات ثقيلة عبر Queue + آماد قابلة للقياس |
| Integration | يعمل داخل Apps/API + Worker بدون فجوات |

**بوابة الحاجز: لا يبدأ تنفيذ Engine جديد قبل اجتياز Architecture Gate** (Why? Owner? Contract? Data? Dependencies? Duplication? Tests? Security? Scalability? Integration?).

---

## 21. ADR Index (سجل القرارات)

| ID | القرار | الحالة |
|---|---|---|
| ADR-001 | Modular Monolith + Single Owner + Engine Boundaries (يقابل D-02) | ✅ معتمد |
| ADR-002 | API Framework: Express 5 حاليًا + Framework-independent Core (D-01) | ✅ معتمد |
| ADR-003 | Unified Auth: Access 15m + Rotating Refresh + RBAC (D-03) | ✅ معتمد |
| ADR-004 | Core/Expanded Scope Separation — لا Expanded داخل Core بلا ADR (D-04) | ✅ معتمد |
| ADR-005 | Unified Database Source of Truth + Data Ownership (D-05) | ✅ معتمد |
| ADR-006 | Student Learning Record (قرار معماري مستقل) | ✅ معتمد |
| ADR-007 | Event Contracts First (بلا Event Bus الآن) | ✅ معتمد |
| ADR-008 | ذا يُفتح عند تغيير schema الـ Reading (`sessions` → `reading_sessions`) | 🕓 في خطة الدمج |

سجل مفتوح: **كل تغيير معماري جديد = ADR جديد** يُلحق هنا قبل التنفيذ.

---

## 22. Migration Rules (قواعد الهجرة)

1. **لا نقل ملفات خارج خطة الدمج المعتمدة** (MOD-001_INTEGRATION_PLAN.md).
2. **الترتيب**: Leaf أولاً → ثم التبعيات (كل خطوة قابلة للبناء والاختبار).
3. كل خطوة = **نقل + تحقق** (tsc 0 errors + tests خضراء) — لا كتلة واحدة كبيرة.
4. **إزالة الازدواج** تكون بقرار موثق في الخطة (لا حذف عشوائي).
5. **Zero Functionality Loss**: قائمة تحقق قبل/بعد لكل ملف منقول.
6. **Schema Freeze اليوم**: لا جداول/تعديلات جديدة في `engine/src/db` ولا `lib/db` — الدمج هو نقطة التوحيد الوحيدة.
7. الحالة الانتقالية مسجلة في `COMPLETION_MAP.md` + `TRACEABILITY_MATRIX.md` (يُحدَّثان مع كل خطوة).
8. **نقل لا نسخ**: كل ملف له وجهة واحدة — أي نسخة مكررة تُحذف في نفس خطوة النقل (لا تُترك «نسخة احتياطية» داخل الريبو).

---

### الإقرار
هذا العقد يعتمد D-01..D-05 + قرارات إضافية (Student Learning Record, Learning Loop, Evidence-Based, Event Contracts, Scalability, Heavy Workloads, Model Independence, Security, Observability) — وهو نافذ من تاريخ 2026-09-06.
