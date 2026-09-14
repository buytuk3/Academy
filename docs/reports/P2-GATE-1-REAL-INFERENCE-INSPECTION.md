# P2-GATE-1 — REAL INFERENCE INSPECTION (تفتيش فقط — صفر تغييرات إنتاجية)

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)


**التاريخ:** 2026-09-14 · **شجرة التفتيش:** مستخرجة حديثًا من أرشيف V.01.2 المعتمدة، مضبوطة للقراءة فقط

---

## 1) Baseline (مُتحقَّق منه)

| البند | القيمة | التحقق |
|---|---|---|
| أرشيف V.01.2 | SHA-256 `b412134eda8d838f5cad8a0d511b732ef749a82484aa973c5b186729a48e9e3f` | `sha256sum` — مطابق للمعتمد حرفيًا |
| HEAD | `1823e9757af20c06825badb61e1563ae3f406906` | `git rev-parse HEAD` داخل المستخرَج |
| الوسم | `buytuk-v01.2` | `git describe` |
| الشجرة | نظيفة (DIRTY=0) + **قراءة فقط طوال الجولة** — صفر تعديلات | `git status` |

## 2) الملفات الفعلية ذات العلاقة

| الملف | الدور |
|---|---|
| `engines/reading-engine/src/engines/ai-feedback.ts` | **الوحيد** الذي يحتوي/يستدعي `mockLLMCall` |
| `engines/reading-engine/src/queue/workers/analyze.processor.ts` | المستهلك الوحيد للـ Engine (مرحلة 10 من خط الأنابيب) |
| `engines/reading-engine/src/pipeline/inference-client.ts` | عميل gRPC الحقيقي للـ Gateway (يخدم STT/Alignment/G2P) |
| `engines/reading-engine/inference-gateway/proto/inference.proto` | عقد الـ Gateway — فيه `Feedback` RPC جاهز وغير مستخدم |
| `engines/reading-engine/config/pipeline.config.ts` | مهلات لكل مرحلة + سياسة retry (غير موصولة بالعميل) |
| `engines/reading-engine/config/models.config.ts` | معرفات النماذج (Whisper/WhisperX/MMS/CAMeL/Silero/DeepFilterNet) |
| `packages/contracts/src/reading/types.ts` | عقد `AIFeedback` + نوع إعدادات `llm` |
| `packages/config/src/env.ts` | مفاتيح INFERENCE الثلاثة (بلا مفاتيح LLM) |
| `engines/reading-engine/src/engines/rule-engine.ts` + `exercises/library.ts` | اختيار التمرين — حتمي بلا LLM |
| `engines/reading-engine/src/container.ts` | ربط DI (معرف لكن غير مُستهلك) |

## 3) Call Graph لمسار `mockLLMCall`

```
analyze.processor.ts:43   const aiFeedback = new AIFeedbackEngine();        (الإنشاء المباشر — لا DI)
analyze.processor.ts:169  const feedbacks = await aiFeedback.generate([], gapResult, {name:`Student ${studentId}`, level, nativeLanguage:"ar"})
ai-feedback.ts:37         const personalized = await this.callLLM({exercise, match, studentProfile, errors})
ai-feedback.ts:56-64      private callLLM → buildPrompt (عربي، "لا تخترع تمريناً جديداً — فقط أعد الصياغة")
ai-feedback.ts:94         private async mockLLMCall(prompt) → قالب ثابت {instructions, explanation, rootCause}   ← الـ MOCK
أدناه:      feedbacks → reportGen.build(...) (processor:186-191) → reports.data (processor:195) — لا يستهلكه نموذج المتعلم/الحلقة
```
- **تعريف وحيد، استدعاء وحيد** (grep شامل: السطران 64 و94 فقط في كامل المستودع خارج node_modules/dist).
- **المنطق الحتمي لا يعتمد عليه:** اختيار التمرين عبر `RuleEngine.select(gaps)` (rule-engine.ts:9: "LLM is NOT involved in selection — only in reformulation") والمكتبة `getById` — الـ LLM يعيد الصياغة فقط.
- **النزول الوحيد للمخرجات:** تقرير القراءة (JSON في `reports.data`) — لا يغذي Evidence/Learner Model/Loop إطلاقًا.
- **الاستبدال Adapter-for-Adapter بدون تغيير callers: نعم** — الصنف `@injectable` (inversify)، والاستدعاء الوحيد عبر `callLLM` الداخلية؛ تبديل جسم/تنفيذ `callLLM` إلى مزوّد حقيقي لا يلمس `generate()` ولا المعالج (حتى لو ربطنا الـ adapter بالحقن أو كمعامل افتراضي في المُنشئ).

## 4) بنية Inference الحالية (كما هي)

- **عميل gRPC حقيقي كامل** (`inference-client.ts`): يحمّل proto من `INFERENCE_PROTO_PATH` (افتراضي `./inference-gateway/proto/inference.proto`)، يتصل بـ `INFERENCE_GATEWAY_URL` (افتراضي `localhost:50050`)، يرسل `authorization: Bearer INFERENCE_API_KEY` + `x-correlation-id` (الأسطر 3-5، 49-50)، مع metrics جاهزة: `modelLatency` (57-59) و`pipelineErrors` (61-63) و`healthCheck()` (77-83).
- **عقد الـ proto موجود في المستودع** ويصرّح 6 طرق: `Health, Transcribe, AlignWord, AlignPhoneme, G2P, Feedback` — **وفيه `Feedback` RPC جاهز بالضبط لحالتنا**: `FeedbackRequest{prompt, model, temperature, correlation_id}` → `FeedbackResponse{text, model_used, tokens_used}` — **غير مستدعى من أي مكان**.
- **خدمة الـ Gateway نفسها (السيرفر) غير موجودة في المستودع ولا منشورة** — الموجود: العميل + العقد فقط.
- **المستدعى الحقيقي للعميل اليوم:** STT (`stt.ts:29`)، AlignWord/AlignPhoneme (`forced-alignment.ts:63,98`)، G2P (`g2p.ts:29,64`) — كلها تعمل فقط إن وُجدت الخدمة؛ وفي E2E (core-26/31) كلها mock عند مآخذ المزودين الخارجيين المعتمدة.
- **المدخل الصوتي من المتصفح:** لا يوجد مسار رفع صوت في `/v1` — `audioKey` يُمرَّر كنص عبر `submit` (`activity.ts:238-241`)، و`presignUrl` موجودة بلا route يستهلكها (`s3-client.ts:75-86`)؛ وواجهة الطالب تُعلن أن VOICE غير مدعوم بعد (ACR-E5-001).

## 5) Provider Abstraction الموجودة

- **`ai-provider.ts`: غير موجود** (find سلبي) — **لا abstraction برمجية قائمة**.
- **لا SDK مزودين في الإنتاج** (grep سلبي: anthropic/openai/gemini/openrouter كحزم). الموجود فقط: معرفات نماذج HF-style في `models.config.ts:6` (مثل `openai/whisper-large-v3-turbo` — تسمية نموذج لا SDK)، ونوع إعدادات `llm: {provider: "gemini" | "openai", apiKey}` في `contracts/src/reading/types.ts:378-381`.
- **حارس معماري قائم:** اختبا core-15/16 تمنع محركات numeracy/assessment من استيراد SDK مزودين (`core-15.test.ts:633`, `core-16.test.ts:473`) — النية المعمارية: المحركات لا تتكامل مع مزود مباشرة.
- **timeout/retry:** قيم مُصرَّحة في `pipeline.config.ts` (aiFeedback: 30000؛ retry: maxRetries 3 لـ TIMEOUT/NETWORK_ERROR) — **لكن العميل لا يفرضها** (لا deadline ولا retry في `inference-client.ts` — من قراءة الملف كاملًا).
- **DI:** inversify موجود (`@injectable`، container.ts:65 يربط AIFeedbackEngine) لكن **container غير مُستهلك** — المعالج ينشئ الكائن مباشرة (processor:43).
- **tenant isolation عند الـ Gateway:** ميتاداتا gRPC تحمل authorization + correlationId فقط — **لا tenantId** (inference-client.ts:49-50).

## 6) مصفوفة Reading/Voice runtime (Browser → … → Recommendation)

| المرحلة | الحكم | الدليل |
|---|---|---|
| Browser → تسجيل/رفع الصوت | **MISSING** (في الواجهة/API) | لا route رفع في /v1 (فحص سلبي)؛ `presignUrl` غير موصولة؛ UI تُعلن VOICE غير مدعوم (ACR-E5-001) |
| API → Reading submit | **REAL** | `activity.ts:219-281` + enqueue حقيقي (core-26: 20/20 على PG+Redis حقيقيين) |
| Audio download/decrypt | **REAL** (كود) — غير مثبت بتشغيل شبكي | `s3-client.ts` + `encryption.ts:4` AES-256-GCM |
| Enhancement (DeepFilterNet) | **PARTIAL** — تنفيذ محلي عبر `spawn` (`audio-enhancement.ts:2`)، يحتاج ثنائية النموذج؛ في E2E seam مُحاكى | معتمد ضمن WAVE-4A seams |
| VAD (Silero) | **PARTIAL** — كود محلي بلا اعتماد Gateway (`vad.ts:1-5`)؛ في E2E seam مُحاكى | — |
| STT (Whisper) | **MOCK في التشغيل الفعلي** — عميل gRPC حقيقي لكن الخدمة غير موجودة؛ في E2E `WhisperSTT` مُحاكى (seam معتمد) | `stt.ts:29` + seams core-26/31 |
| Alignment (WhisperX/MMS) | **MOCK في التشغيل الفعلي** — نفس الوضع (عميل حقيقي/خدمة غائبة/seam مُحاكى) | `forced-alignment.ts:63,98` |
| Pronunciation/Error Analysis | **PARTIAL** — منطق GapEngine حتمي حقيقي يعمل على مخرجات الـ alignment | `gap.compute` (processor:166) |
| Score | **REAL** (منطق حتمي، unit tests ضمن 16 اختبار القراءة) — في E2E seam مُحاكى | `ReadingScoreEngine` |
| Evidence | **REAL** — مُثبت بقاعدة حقيقية (core-26/31) | `recordEvidence` |
| Learner Model | **REAL** (core-09/29) | — |
| Diagnosis | **REAL** (V-3، core-27) | — |
| Recommendation | **REAL** (core-30) | — |
| **LLM Feedback** | **MOCK** — `mockLLMCall` (ai-feedback.ts:64,94) | **هدف P2** |

> ملاحظة أمانة: وجود ملف العميل لا يعني أن الخدمة تعمل — STT/Alignment/G2P **غير مثبتة بتشغيل حقيقي** (لا خدمة)، وهذه الفجوة ستُغطى عند تشغيل الـ Gateway لصوت حقيقي (بعد LLM).

## 7) الفجوات الدقيقة
1. لا يوجد LLM Provider Adapter ولا interface للمزودين (فقط نوع إعدادات في العقود).
2. `mockLLMCall` يعيد قالبًا ثابتًا دائمًا — لا ديناميكية إطلاقًا.
3. خدمة Inference Gateway (سيرفر الـ proto) غير موجودة/غير منشورة — STT/Alignment/G2P معطلة فعليًا بدونها.
4. العميل gRPC بلا deadline/timeout ولا retry — رغم وجود الإعدادات.
5. لا tenant context في ميتاداتا gRPC (عزل المستأجر عند الـ Gateway غير مفروض).
6. لا مفاتيح LLM في `packages/config/src/env.ts`.
7. مخرجات الـ feedback حبيز `reports.data` فقط — لا استهلاك لاحق (لا مشكلة، لكن يحدد نطاق الإثبات).
8. DI موجود لكن غير مستخدم — الحقن سيحتاج إما تفعيل container أو حقن بمنشئ افتراضي.

## 8) خطة تنفيذ P2 (مقترح — خطوات صغيرة، لا تنفيذ قبل الاعتماد)
- **P2-1 — عقد المزود:** `LLMProvider` interface (`complete(req): Promise<{text, modelUsed, tokensUsed}>`) + ملفات `engines/reading-engine/src/engines/llm/` (واجهة + adapters).
- **P2-2 — Adapter الأساسي (Gateway):** `GatewayLLMAdapter` يستدعي `callInferenceGateway("Feedback", {prompt, model, temperature, correlation_id})` — **إعادة استخدام كاملة للعميل والعقد الحاليين** (الـ RPC جاهز في الـ proto:22-27).
- **P2-3 — adapters مباشرة اختيارية خلف نفس الواجهة:** OpenAI-compatible / Gemini / OpenRouter / Ollama — يُفعَّل أحدها بالإعدادات فقط (provider-agnostic؛ لا اعتماد معماري على مزود).
- **P2-4 — الاستبدال:** جسم `callLLM` في `ai-feedback.ts` يستدعي المزود المُحقون بدل `mockLLMCall`؛ حذف `mockLLMCall` نهائيًا؛ الإبقاء على الـ fallback الحالي عند الفشل (ai-feedback.ts:66-75 — يعيد التعليمات الأصلية: تدهور رشيق وليس mock).
- **P2-5 — الإعدادات:** `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY`, `LLM_TEMPERATURE`, `LLM_TIMEOUT_MS` في `packages/config/src/env.ts` (التحقق الصارم نفسه).
- **P2-6 — Timeout/Retry:** فرض deadline على استدعاء gRPC من `pipelineConfig.timeouts.aiFeedback` (30s) + retry بحد `maxRetries:3` للأخطاء القابلة (الموجودة في الإعدادات).
- **P2-7 — Gateway الحقيقي:** تنفيذ خدمة الـ proto (Python) للطرق الصوتية (Transcribe/Align/G2P) — **مطلوبة للصوت لا للـ LLM**؛ للـ LLM وحده يكفي adapter مباشر (إجابة سؤالك: Python Gateway ليس شرطًا لكل inference — الـ LLM يمكن أن يبقى داخل بنية الـ API عبر adapter؛ الصوت/النماذج الصوتية تبقى مكانها الطبيعي Gateway لأن العميل والعقد جاهزان).
- **P2-8 — الإثبات:** core-33 (أدناه) + ACR-E6-001 + Closeout.

## 9) الملفات التي ستتغير (مقترح)
`ai-feedback.ts` (استبدال mock بالمزود) · `inference-client.ts` (deadline + ميتاداتا) · `packages/config/src/env.ts` (مفاتيح LLM) · **جديد:** `engines/reading-engine/src/engines/llm/*` (الواجهة + adapters) · `tests/core-33/*` · (اختياري: `inference.proto` — حقل tenant إضافي متوافق) · `pipeline.config.ts` (قسم llm إن لزم).

## 10) الملفات التي لن تتغير
`analyze.processor.ts` (لا تغيير استدعاء) · `packages/contracts` (عقد AIFeedback ثابت) · كل الـ DB schema/الهجرات · `apps/api` بكل راوتراتها · واجهة الطالب `apps/api/src/public/` · باقي المحركات · proto (طرقه القائمة تُحفظ — أي إضافة additive فقط).

## 11) العقود التي ستُحفظ
`AIFeedback` (types.ts:167-173) · توقيع `generate(wordReport, gaps, studentProfile) → Promise<AIFeedback[]>` · دلالة buildPrompt (إعادة صياغة فقط، لا توليد تمارين — ai-feedback.ts:80-92) · أسلوب التدهور الرشيق عند الفشل · proto: نفس الرسائل والطرق (إضافات متوافقة فقط) · عزل النماذج في `models.config.ts`.

## 12) Security + Tenant Isolation
- المفتاح عبر env فقط (`INFERENCE_API_KEY` قائم) — لا أسرار في الكود (Secret Scan بوابة قائمة).
- **معالجة PII:** الـ prompt الحالي يرسل اسم الطالب كـ `Student ${studentId}` (معرّف مستعار — processor:170-172) + الأخطاء الفونيمية فقط؛ **نمنع** إرسال أي PII إضافية، ولا نسجّل نص الـ prompt في اللوج (السجل الحالي يسجل method/duration فقط — نبقيه كذلك).
- **Tenant:** إضافة `x-tenant-id` في ميتاداتا gRPC + حقل اختياري في الطلب (additive)، وفرض الفصل في خدمة الـ Gateway عند تشغيلها؛ اليوم العزل مفروض أعلى الـ Gateway (كل استدعاء داخل سياق طالب/مستأجر مفحوص).
- مزود LLM خارجي: اختيار مزود بإعدادات عدم-تدريب/احتفاظ بيانات عند التفعيل المباشر.

## 13) Timeout / Retry / Error Handling
- Timeout: فرض gRPC deadline = `timeouts.aiFeedback` (30000ms — pipeline.config.ts:42) لكل استدعاء.
- Retry: `maxRetries: 3` + backoff للأخطاء القابلة (TIMEOUT/NETWORK_ERROR — pipeline.config.ts:46-48)؛ الأخطاء المنطقية (4xx مزود) لا تُعاد.
- الفشل: **السلوك الحالي يُحفظ** — catch يعيد التعليمات الأصلية مع rootCause "غير محدد" (ai-feedback.ts:66-75)؛ فشل الـ LLM لا يُفشل الـ analyze job (النتيجة/الإتقان/الأدلة مستقلة عنه).

## 14) Observability
القائم يُعاد استخدامه: `modelLatency` + `pipelineErrors` (inference-client.ts:57-63) + Pino child بـ method/correlationId (:40). الإضافات: label للمزود/`model_used`/`tokens_used` (متاحة في FeedbackResponse)، عداد نجاح/فشل لكل مزود، وإبقاء اللوج بلا محتوى الـ prompt.

## 15) Test Strategy
- **Unit:** كل adapter ضد خادم HTTP/gRPC مزيف داخل العملية (إثبات الشكل/الأخطاء/المهلات) — mocks في الاختبارات فقط (مسموح).
- **Integration:** خدمة gRPC حقيقية مصغرة مبنية من `inference.proto` نفسه تثبت مسار `Feedback` من `callLLM` حتى الاستجابة.
- **E2E (core-33):** نفس دورة core-26/31 الصوتية لكن الـ AI feedback يمر بمزود حقيقي (env-gated بمفتاح تجريبي) أو بخدمة gateway محلية؛ تثبت أن النص ديناميكي مستجيب للأخطاء الفعلية وليس القالب الثابت.
- **Guard:** اختبار نمط core-15/16 يمنع استيراد SDK مزودين داخل المحركات مباشرة (التكامل عبر وحدة الـ adapter فقط).

## 16) إثبات اختفاء الـ Mock من مسار الإنتاج
1. **فحص سلبي آلي:** `grep -rn "mockLLMCall" engines apps packages` (خارج tests/node_modules/dist) → **صفر نتائج** بعد التنفيذ (يُرفق في الـ Closeout).
2. **مسار كود:** `callLLM` → `LLMProvider` مُحقون → استدعاء شبكي حقيقي (gateway أو مزود) — لا فرع ثابت في الإنتاج.
3. **سلوكي:** core-33 يثبت أن مخرجات الـ feedback تتغير بتغير مدخلات الأخطاء الفعلية (القالب الثابت لا يستطيع ذلك).
4. **توثيقي:** ACR-E6-001 + تقرير إغلاق P2 بـ SHA/وسم.

## 17) المخاطر والـ Rollback
| خطر | التخفيف |
|---|---|
| تسريب مفتاح مزود | env فقط + بوابة Secret Scan + لا مفاتيح في الكود/الأرشيف |
| زمن استجابة يبطئ خط الأنابيب | deadline 30s + fallback فوري (موجود) + عزل الـ LLM عن مسار الأدلة |
| تكلفة الاستدعاءات | حد tokens/temperature بالإعدادات + الاستدعاء مرة واحدة لكل تقرير تحليل |
| الاعتماد على مزود واحد | واجهة LLMProvider + adapters متعددة + حارس منع SDK داخل المحركات |
| جودة العربية | prompt عربي جاهز + إثبات على أخطاء فونيمية حقيقية في core-33 |
| جاهزية Gateway للصوت | خارج نطاق LLM — تُنفذ بمرحلة تشغيل Gateway (نفس proto) |
| Rollback | التزام واحد قابل للعكس (revert + retag)؛ صفر تغيير schema/DB؛ الـ fallback يضمن عدم انكسار التقارير |

---

### ✋ إقرار
**لم تُنفَّذ أي تغييرات إنتاجية في هذه الجولة** — شجرة التفتيش مقروءة فقط (مستخرجة من أرشيف V.01.2 المعتمدة، البصمة مطابقة، DIRTY=0). كل ما في الأقسام 8-17 **مقترحات تنفيذ بانتظار قرارك**، وفق البروتوكول الملزم `EXECUTION-REFERENCE.md`.
