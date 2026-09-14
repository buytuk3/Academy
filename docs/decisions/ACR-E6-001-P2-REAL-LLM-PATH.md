# ACR-E6-001 — P2: تحويل LLM Feedback من Mock إلى Real Provider Path (عبر Gateway Adapter)

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)


**التاريخ:** 2026-09-14 · **الفرع:** `p2-real-inference` (من `buytuk-v01.2` @ `1823e9757af20c06825badb61e1563ae3f406906`) · **الحالة:** منفذ ومُثبت (P2-MID-GATE بانتظار اعتماد المالك) · **المرجع:** P2-GATE-1 (تقرير التفتيش المعتمد)

## السياق
تقرير التفتيش (P2-GATE-1) أثبت: `mockLLMCall` له تعريف واستدعاء وحيدان (`ai-feedback.ts:64,94`)، الـ LLM مستقل عن Evidence/Learner Model/Diagnosis/Recommendation، عقد `Feedback` RPC جاهز في `inference.proto` وغير مستخدم، لا abstraction مزودين قائمة، Timeout/Retry معلنان وغير موصولين، لا tenant context في ميتاداتا gRPC.

## القرارات (وفق Scope المالك المعتمد)

### P2-1 — عقد المزود (بدل SDK)
`LLMProvider` interface: `complete(request) → {text, modelUsed, tokensUsed}` + `LLMProviderError{code, retryable}` في `engines/reading-engine/src/engines/llm/types.ts` — المحرك يعتمد الواجهة لا SDK. **بلا Breaking Change:** `AIFeedback` و`generate(wordReport, gaps, studentProfile)` كما هما (الإضافة الوحيدة بالعقد: حقل اختياري `degraded?: boolean`).

### P2-2 — Gateway Adapter (المزود الحقيقي الأول — Reuse)
`GatewayLLMAdapter` (`llm/gateway-adapter.ts`) يستدعي `callInferenceGateway("Feedback", {prompt, model, temperature, correlation_id})` — **إعادة استخدام كاملة** للعميل gRPC القائم والعقد الرسمي؛ التعديل الوحيد على العميل **إضافي**: خيار `{deadlineMs, tenantId}` (القِيَم القديمة للـ STT/Align/G2P لا تتأثر — إغفالها = السلوك القديم حرفيًا).

### P2-3 — Provider Strategy
مزود حقيقي واحد فقط في P2: **Gateway** (يفصل البنية عن المزود النهائي ويوحد الملاحظة). الواجهة تسمح بإضافة OpenAI-compatible/Gemini/OpenRouter/Ollama لاحقًا كـ adapters جديدة دون لمس المحرك — بلا SDKs متعددة الآن. حارس core-15/16 (منع SDK داخل المحركات) يبقى نافذًا: التكامل عبر وحدة `llm/` حصرًا.

### P2-4 — إزالة Mock + الـ Fallback
`mockLLMCall` **حُذف نهائيًا** (إثبات ثابت: grep شامل → صفر تطابق مطلق). عند فشل المزود: **تدهور مُعلَن** — التعليمات الأصلية + `rootCause:"غير محدد"` + العلامة `degraded:true` (عقدًا) — سلوك error-safe واضح، **ليس ادعاءً أن الـ LLM اشتغل**.

### P2-5 — Configuration
`LLM_PROVIDER` (gateway) · `LLM_MODEL` · `LLM_TEMPERATURE` (0.3 افتراضيًا، محدودة 0–2) · `LLM_TIMEOUT_MS` (افتراضي `timeouts.aiFeedback`=30000) — قراءة env مباشرة بنمط الوحدة (سر في env فقط: `INFERENCE_API_KEY` القائم). لا تسجيل لأي مفتاح ولا لنص الـ prompt.

### P2-6 — Timeout/Retry/Errors (تفعيل المعلَن)
- **Timeout مفروض فعليًا:** gRPC `deadline = Date.now()+timeoutMs` في العميل (الخيارات الإضافية) — مُثبت باتصال حقيقي لخادم صامت → `DEADLINE_EXCEEDED` فعلي.
- **Retry محدود:** `maxRetries: 3` من `pipelineConfig.retry` — للأكواد القابلة فقط (`DEADLINE_EXCEEDED→TIMEOUT`، `UNAVAILABLE→INFERENCE_UNAVAILABLE`) بـ backoff أقصاه 1s (لا تكلفة غير محدودة). أكواد غير قابلة (`INVALID_ARGUMENT`، `UNAUTHENTICATED→AUTH_REJECTED`) تفشل من المحاولة الأولى — مُثبت.

### P2-7 — Tenant + Security
`x-tenant-id` يُضاف لميتاداتا gRPC عند تمرير tenantId (مُثبت: الخادم الحقيقي في الاختبار يقرأه من الميتاداتا ويطابقه). **صفر تغيير DB schema/migrations.** حد الـ prompt محفوظ حرفيًا: معرف مستعار `Student ${studentId}` + أخطاء فونيمية فقط؛ اللوج: method/duration/model_used/tokens_used فقط — بلا prompt وبلا مفاتيح.

## الإثبات (core-33 — 8/8، خادم gRPC حقيقي داخل العملية مبني من `inference.proto` الإنتاجي نفسه)
- **Static:** `grep -rn mockLLMCall` (engines/apps/packages/tests، خارج node_modules/dist) → **صفر تطابق مطلق**.
- **Integration (C):** `callLLM → GatewayLLMAdapter → Feedback RPC حقيقي عبر socket → استجابة محلولة` (prompt حقيقي يصل كما هو + tenant metadata مطابقة).
- **Behavioral (D):** خطأان فونيميان حقيقيان مختلفان (θ→s مقابل dˤ→zˤ) → مخرجان مختلفان مشتقان من الأخطاء الفعلية (القالب الثابت عاجز عن ذلك) — واختيار التمرين من **الكتالوج الحقيقي** عبر RuleEngine (`sd-interdentals` / `sd-emphatics` — سلوك الكتالوج الفعلي بلا حقل `type` موثق داخل الاختبار).
- **Timeout (P2-6):** خادم صامت → `TIMEOUT` حقيقي خلال 251ms/محاولة، الإجمالي محدود.
- **Retry:** UNAVAILABLE×2 → نجاح بالمحاولة الثالثة؛ AUTH_REJECTED → فشل سريع بمحاولة واحدة.
- **Degraded (B2/B3):** مزود فاشل أو نص غير قابل للتحليل → `degraded:true` + التعليمات الأصلية + `rootCause:"غير محدد"` — بلا ادعاء نجاح.
- **Regression (F):** TSC شامل EXIT=0 · انحدار core-25→32 = **102/102** على قواعد PG نظيفة حديثة الإنشاء · محركات 16/41/37 · config 11/11 · Drift PASS · Secret Scan نظيف.

## الأثر المعماري
صفر جداول/هجرات · صفر تغيير راوترات/واجهة طالب/محركات أخرى · proto ثابت (لا حاجة لإضافات) · العقود: إضافة اختيارية متوافقة واحدة (`degraded`) · الاستدعاء الوحيد في المعالج لم يتغير (processor:169).

## الحدود
الـ Feedback RPC يحتاج خدمة Gateway فعلية للتشغيل في الإنتاج (العميل + العقد + الـ adapter جاهزة ومثبتة ضد خادم حقيقي من العقد نفسه) — تجهيز/تشغيل Gateway الصوتي (STT/Align/G2P) = المرحلة التالية بعد اعتماد هذا الـ MID-GATE.
