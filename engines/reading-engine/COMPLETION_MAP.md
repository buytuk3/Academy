# خريطة إكمال محرك القراءة — MOD-001 (من «الوثيقة الشاملة» إلى ملفات حقيقية)

النطاق: artifacts/reading-engine داخل monorepo v2.7.1
المصادر: BuyTuk-Reading-Engine-v4.0.zip (بنية تحتية) + BuyTuk-v4.0-Parts1-5.zip (مصدر المحرك) + «الوثيقة الشاملة» (قسم 5.2.1 والبنى المرتبطة)

## أ) موجود من الأرشيف — تم دمجه كما هو (لم يُعدل)
| بند الوثيقة | الملف الفعلي |
|---|---|
| pipeline/audio-enhancement.ts (DeepFilterNet) | src/pipeline/audio-enhancement.ts |
| pipeline/feature-extraction.ts (Essentia) | src/pipeline/feature-extraction.ts |
| pipeline/vad.ts (Silero VAD) | src/pipeline/vad.ts |
| pipeline/stt-client.ts (Whisper) | src/pipeline/stt.ts (اسم الملف stt.ts) |
| pipeline/forced-alignment-client.ts (WhisperX) | src/pipeline/forced-alignment.ts |
| pipeline/g2p-client.ts (CAMeL) | src/pipeline/g2p.ts |
| pipeline/ipa-mapper.ts | src/pipeline/ipa-mapper.ts |
| pipeline/phonetic-matrix.ts | src/pipeline/phonetic-matrix.ts |
| pipeline/alignment.ts (DTW) | src/pipeline/alignment.ts |
| pipeline/inference-client.ts (gRPC) | src/pipeline/inference-client.ts |
| engines/confidence.engine.ts | src/engines/confidence.ts |
| engines/reading-score.engine.ts | src/engines/reading-score.ts |
| engines/mastery.engine.ts | src/engines/mastery.ts |
| engines/gap.engine.ts | src/engines/gap.ts |
| engines/rule.engine.ts | src/engines/rule-engine.ts |
| engines/ai-feedback.engine.ts | src/engines/ai-feedback.ts |
| engines/recommendation.engine.ts | src/engines/recommendation.ts |
| engines/report-generator.engine.ts | src/report/generator.ts |
| queue (BullMQ + DLQ) | src/queue/bullmq.ts + src/queue/workers/analyze.worker.ts |
| security (AES-256-GCM + S3) | src/security/encryption.ts + s3-client.ts |
| exercises | src/exercises/library.ts + catalog.json |
| db schema + migration | src/db/schema.ts + src/db/migrations/001_initial.sql |
| config (9 ملفات) | config/*.ts |
| inference-gateway (proto + gateway.py + 4 workers) | inference-gateway/ |
| infra (docker/k8s/cloudformation/nginx/scripts/CI) | infra/ |

## ب) ناقص من الأرشيف → كُتب جديدًا وفق الوثيقة
| بند الوثيقة | الملف الجديد | ماذا يقدّم |
|---|---|---|
| مدخل engine (apps/engine entry) | src/index.ts | Express API + Helmet + CORS + RateLimit + Socket.IO + إيقاف آمن |
| REST API (sections analytics/passages/sessions/attempts/reports/audio/health/metrics) | src/http/routes.ts | auth/login + passages + sessions + attempts + analyze (async) + reports + presign + health + metrics |
| WebSocket (audio streaming → queue → report push) | src/realtime/socket.ts | session:start / audio_chunk / session:stop → تشفير → S3 → BullMQ → report_ready |
| JWT + RBAC | src/middleware/auth.ts | authenticate + authorize بدور funcs (admin/principal/teacher/student/parent) |
| Observability (pino + Prometheus) | src/observability/logger.ts + metrics.ts | logging منظم مع redaction + metrics |
| مدخل العامل (worker entry) | src/queue/workers/index.ts | تشغيل العامل وإيقافه |
| Drizzle CLI | drizzle.config.ts | generate/migrate/push/studio |
| Vitest | vitest.config.ts | تشغيل الاختبارات |
| أنواع WASM بلا تعريفات | src/types/vendor.d.ts | essentia.js / rnnoise-wasm |
| اختبارات وحدة | src/engines/__tests__/{reading-score,confidence,gap}.test.ts | 6 حالات |
| توثيق تشغيل | README.md | البنية + التشغيل + الاعتماديات الخارجية |

## ج) إصلاحات توافقية دقيقة (موثقة، دون تغيير سلوك)
- src/exercises/library.ts: `assert { type: "json" }` ← `with { type: "json" }` (لواصق ESM الحديثة).
- src/security/s3-client.ts: أُضيف `metadata` اختياري لرفع audio مع المفتاح المشفّر (كان مفقودًا رغم أن decrypt/download يقرأان `x-amz-key`).
- src/http/routes.ts: إنشاء passage يملأ teacherId تلقائيًا من صاحب الطلب (الجدول NOT NULL).
- package.json: أُضيف سكربت `typecheck` و `worker` فقط (بقية السكربتات كما وردت في الأرشيف).

## د) تعتمديات تشغيل خارجية غير مضمّنة في الأرشيف (لا يمكن التحقق منها هنا)
- ثنائي dfn-worker (DeepFilterNet) — audio-enhancement يشغّل عملية فرعية.
- أوزان النماذج: whisper-large-v3-turbo / WhisperX / MMS-fa / CAMeL (تُحمَّل داخل gateway.py).
- AWS (S3 + مفاتيح)، Redis، PostgreSQL، ومفتاح LLM (gemini/openai) لـ AI Feedback.
- package.json: أُزيل الاعتماد `rnnoise-wasm@^0.1.0` (غير موجود في سجل npm — `notarget` — وغير مستورد في أي ملف src؛ تحسين الصوت يعتمد على dfn-worker الأصلي). التثبيت بعد ذلك يحتاج `--legacy-peer-deps` بسبب تعارض peers في أدوات التطوير الموروثة من الأرشيف.
- tsconfig.json: `rootDir` من `./src` إلى `.` (كان البناء مكسورًا TS6059 لأن include يشمل `config/**/*`)، مع تحديث `main`/`start` إلى `dist/src/index.js` وإضافة سكربت `worker:start`. سكربت `worker` (tsx) يبقى للتطوير.
- إصلاحات فحص الأنواع (tsc، كلها توافقية لا تغيّر سلوك):
  - src/pipeline/feature-extraction.ts: Essentia كمساحة أسماء — حُل بإعلان صريح في src/types/vendor.d.ts (يفتح أنواع essentia.js).
  - src/db/index.ts: خيارات postgres `{min,max}` — تحويل ضمني `as any` (خيارات وقت تشغيل سليمة).
  - src/exercises/library.ts: تحويل الكتالوج إلى Exercise[] عبر `as unknown as`.
  - src/http/routes.ts: `expiresIn` من env يُمرَّر مطابقًا لنوع jwt.SignOptions.
  - src/index.ts: تمرير logger إلى pino-http بتحويل `as any` (تعارض أنواع pino child بين الإصدارات).
  - tsconfig.json: rootDir تم تغييره من "./src" إلى "." (كان TS6059 لأن include يشمل config/**/*) مع تحديث main/start إلى dist/src/index.js وإضافة سكربت worker:start.
- النتيجة النهائية للفحوصات الآلية: typecheck ناجح (0 أخطاء) والاختبارات 6/6 ناجحة.
- الإصلاحان النهائيان لفحص الأنواع: (1) src/types/vendor.d.ts: PitchMelodia يعيد {pitch, confidence} كأي (كود الأرشيف يقارن confidence بعدد)، (2) src/db/index.ts: onnotice بمعلمة صريحة unknown.

- الإصلاحان النهائيان لفحص الأنواع: vendor.d.ts (PitchMelodia يعيد أي) و db/index.ts (onnotice: unknown).
