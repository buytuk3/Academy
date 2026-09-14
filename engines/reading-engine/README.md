# BuyTuk Reading Engine — v4.0 (Module MOD-001)

محرك القراءة الذكي: تحليل النطق على مستوى الحروف (Phoneme-level)، تقييم الطلاقة والنبر،
تشخيص الفجوات، وتوليد تقارير وتوصيات وتمارين مخصصة — وفق «الوثيقة الشاملة» (القسم 5.2.1 وما يرتبط بها).

## البنية

```
artifacts/reading-engine/
├── src/
│   ├── index.ts                  # مدخل API (Express + Socket.IO + security middleware)  ← NEW
│   ├── http/routes.ts            # REST: auth, passages, sessions, attempts, analyze, reports, metrics  ← NEW
│   ├── realtime/socket.ts        # بث الصوت: session:start → audio_chunk → session:stop → queue → report  ← NEW
│   ├── middleware/auth.ts        # JWT + RBAC (admin/principal/teacher/student/parent)  ← NEW
│   ├── observability/            # pino logger + Prometheus metrics  ← NEW
│   ├── queue/                    # BullMQ: analyze queue + DLQ + worker (analyze.worker.ts)
│   ├── pipeline/                 # denoise → features → VAD → STT → G2P → forced alignment → DTW
│   ├── engines/                  # confidence, reading-score, mastery, gap, rule, recommendation, ai-feedback
│   ├── security/                 # AES-256-GCM audio encryption + S3 client
│   ├── report/generator.ts       # تقرير كلمة-بكلمة + صوت-بصوت
│   └── db/                       # Drizzle schema (14 tables) + migration 001_initial.sql
├── inference-gateway/            # gRPC gateway (Python): whisper, alignment, g2p, feedback workers
├── config/                       # scoring, models, pipeline, audio, security thresholds
└── infra/                        # docker-compose, k8s, cloudformation, nginx, scripts, CI/CD (من أرشيف v4)
```

## التشغيل (الاعتماديات الخارجية المفروضة)

```bash
# 1) تبعيات
npm install --ignore-scripts

# 2) متغيرات البيئة (انسخ .env.example ثم املأ القيم)
cp .env.example .env

# 3) قاعدة البيانات (PostgreSQL)
pnpm db:push        # أو pnpm db:migrate

# 4) Redis ثم Inference Gateway:
#    docker compose -f inference-gateway/docker-compose.workers.yml up -d

# 5) تشغيل
pnpm dev            # API + Socket.IO (منفذ 4000)
pnpm worker         # عامل المعالجة (BullMQ)

# 6) فحص
pnpm typecheck
pnpm test
```

## نقاط اتصال خارجية مطلوبة وقت التشغيل (غير مضمّنة في الأرشيف)

- `dfn-worker` الثنائي (DeepFilterNet) — `src/pipeline/audio-enhancement.ts` يشغّله كعملية فرعية.
- نماذج Inference: whisper-large-v3-turbo، WhisperX، MMS-fa، CAMeL (تُحمَّل داخل الـ gateway.py).
- AWS S3 + تسليم أزواج مفاتيح AWS، Redis، PostgreSQL، ومفتاح LLM (gemini/openai) للـ AI Feedback.

## التزامات تصميمية (من الوثيقة)

- LLM يُستخدم **لإعادة الصياغة فقط** — اختيار التمارين بقواعد تعليمية (Rule Engine)، لا بالذكاء الاصطناعي.
- الصوت يُشفَّر AES-256-GCM بمفتاح جلسة ملفوف بـ KEK، ويُخزَّن مشفّرًا في S3.
- كل التقدم يمر عبر BullMQ (queue + DLQ) مع Real-time push عبر Socket.IO.
