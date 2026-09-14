# P2-MID-GATE — Real LLM Path (أول مسار حقيقي مكتمل — بانتظار الاعتماد قبل إثبات الصوت)

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)


**التاريخ:** 2026-09-14 · **الفرع:** `p2-real-inference` · **الأساس:** `buytuk-v01.2` @ `1823e9757af20c06825badb61e1563ae3f406906`

## 1) الالتزامات (ثلاثة مترابطة، منفصلة وفق بوابة "لا تجمع تغييرات غير مترابطة")
| الالتزام | المحتوى |
|---|---|
| `e9c0a04` | **P2-1/P2-2** — عقد `LLMProvider` + `GatewayLLMAdapter` (المزود الحقيقي الأول: إعادة استخدام عميل gRPC القائم + `Feedback` RPC) + إضافات العميل (deadline مفروض + `x-tenant-id`) + ربط DI إضافي |
| `fae2caa` | **P2-4/P2-5** — حذف `mockLLMCall` من الإنتاج نهائيًا؛ `callLLM` يستهلك المزود المُحقن؛ الفشل = `degraded:true` صريح (سلوك error-safe لا ادعاء نجاح) + حقل `AIFeedback.degraded?` الإضافي |
| `d1c23cf` 🏷 `core33-p2-real-llm-path` | **P2-8** — إثباتات core-33 (8/8) + قرار **ACR-E6-001** |

**حالة الشجرة:** نظيفة DIRTY=0 · HEAD `d1c23cf1699651d731c465e2a2e98acce6cea7af`

## 2) الملفات التي تغيرت
**جديد (7):** `engines/reading-engine/src/engines/llm/{types,config,gateway-adapter,index}.ts` · `tests/core-33/{p2-llm-path.test.ts,vitest.config.ts}` · `docs/decisions/ACR-E6-001-P2-REAL-LLM-PATH.md`
**معدل (5):** `ai-feedback.ts` (استبدال mock بالمزود + fallback مُعلَن) · `inference-client.ts` (إضافي فقط: `{deadlineMs, tenantId}` اختيارية — إغفالها = السلوك القديم حرفيًا) · `container.ts` (ربط `LLMProvider` إضافي) · `packages/contracts/src/reading/types.ts` (`degraded?: boolean` — إضافة متوافقة وحيدة) · `engines/reading-engine/vitest.config.ts` (تثبيت مسار الـ proto الرسمي)

## 3) ما أُعيد استخدامه (بلا إعادة كتابة)
عميل gRPC القائم + **`Feedback` RPC الموجود في `inference.proto` الإنتاجي** · `pipelineConfig.timeouts.aiFeedback` (30000) و`retry.maxRetries:3` و`retryableErrors` · observability (Pino + modelLatency/pipelineErrors) · `RuleEngine`/`ExerciseLibrary` (الاختيار الحتمي لم يُمس) · **`analyze.processor.ts:169` لم يتغير إطلاقًا** (الاستبدال Adapter-for-Adapter كما خُطط).

## 4) المزود المختار والمسار النهائي
- **Provider = Gateway** (`GatewayLLMAdapter` → `Feedback RPC`): يفصل المحرك عن أي مزود نهائي، يوحّد الملاحظة والأمان، ويستثمر عقدًا قائمًا.
- **المسار النهائي لمرحلة P2: Gateway LLM path** — الـ adapters المباشرة (OpenAI-compatible/Gemini/OpenRouter/Ollama) تبقى إضافات مستقبلية خلف واجهة `LLMProvider` نفسها بالإعدادات فقط (provider-agnostic، بلا SDKs متعددة الآن، وحارس core-15/16 يمنع SDK داخل المحركات).

## 5) إثبات اختفاء الـ Mock
- **Static (A):** `grep -rn mockLLMCall` على engines/apps/packages/tests (خارج node_modules/dist) → **صفر تطابق مطلق**.
- **Code path:** `callLLM → LLMProvider (مُحقن) → استدعاء شبكي حقيقي` — لا فرع ثابت في الإنتاج.
- **Behavioral (D):** core-33 P2-D1 — خطأان فونيميان حقيقيان مختلفان (θ→s مقابل dˤ→zˤ) → مخرجان مختلفان مشتقان من الأخطاء الفعلية عبر الكتالوج الحقيقي (`sd-interdentals`/`sd-emphatics` — سلوك RuleEngine الفعلي موثق داخل الاختبار). القالب الثابت عاجز عن ذلك.
- **الـ Fallback ليس Mock متنكرًا:** مزود فاشل أو استجابة غير قابلة للتحليل → `degraded:true` + التعليمات الأصلية + `rootCause:"غير محدد"` (P2-B2/B3) — تدهور مُعلَن لا ادعاء نجاح.

## 6) الاختبارات والبوابات (كلها أوامر حية)
- **core-33: 8/8** — **خادم gRPC حقيقي داخل العملية مبني من `inference.proto` الإنتاجي نفسه**: تكامل كامل (callLLM→Adapter→Feedback RPC→نتيجة محلولة + مطابقة `x-tenant-id` من الميتاداتا) · timeout مفروض فعليًا (خادم صامت → `DEADLINE_EXCEEDED` حقيقي خلال 251ms → `TIMEOUT`) · retry محدود (2×UNAVAILABLE → نجاح بالمحاولة الثالثة؛ `AUTH_REJECTED` → فشل سريع بمحاولة واحدة) · degraded للحالتين (فشل/نص غير قابل للتحليل).
- **Regression (F):** انحدار core-25→32 = **102/102** على 8 قواعد PostgreSQL نظيفة حديثة الإنشاء (بما فيها core-32: **متصفح Chromium حقيقي 5/5**) · محركات: reading 16/16 · numeracy 41/41 · assessment 37/37 · config 11/11.
- **TSC شامل:** EXIT=0 · **Schema Drift: PASS** (EXIT=0 — **صفر تغيير schema/هجرات**) · **Secret Scan: نظيف** (لا مفاتيح، لا .env متعقب، لا ملفات أسرار في التغييرات).

## 7) الأمان (E)
- السر في env فقط (`INFERENCE_API_KEY` القائم) — لا مفاتيح في الكود/الأرشيف.
- **لا prompt logging** ولا تسجيل مفاتيح — اللوج: method/duration/model_used/tokens_used فقط.
- حد الـ prompt محفوظ حرفيًا: معرف مستعار `Student ${studentId}` + أخطاء فونيمية فقط — لا PII إضافية.
- Tenant isolation: `x-tenant-id` في ميتاداتا gRPC — **مُثبت فعليًا** (الخادم الحقيقي في الاختبار يقرأه ويطابقه).

## 8) تغييرات خارج Scope: **لا شيء**
صفر DB/schema/هجرات · صفر تغيير راوترات/apps/api · صفر تغيير Student UI · صفر تغيير باقي المحركات · صفر Docker/K8s/microservices · صفر SDKs جديدة · العقود: إضافة اختيارية متوافقة وحيدة (`degraded?`).

## 9) المتبقي بعد اعتمادك (النصف الثاني من P2)
1. **Gateway الصوتي — الحد الأدنى:** خدمة الـ proto الفعلية (Transcribe/AlignWord/AlignPhoneme/G2P) لتشغيل STT/Alignment/G2P الحقيقية (عميلها وعقدها جاهزان ومُعاد استخدامهما) — بأدنى نماذج مطلوبة فعليًا لا تنفيذ حرفي لكل أسماء الوثيقة.
2. **إثبات Reading/Voice runtime الحقيقي من المتصفح:** رفع صوت حقيقي (توصيل `presignUrl` القائمة) → الدورة الصوتية كاملة في core-34 + تحديث تدقيق المطابقة.
