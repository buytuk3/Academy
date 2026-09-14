# 📚 الوثيقة الشاملة لمشروع BuyTuk Academy

> **Official Reference / Source of Execution** for every future phase. Companion files: [`EXECUTION-REFERENCE.md`](./EXECUTION-REFERENCE.md), [`DOCUMENT-V1-COMPLIANCE-AUDIT.md`](./DOCUMENT-V1-COMPLIANCE-AUDIT.md), [`PROJECT_VERSION.md`](./PROJECT_VERSION.md).


**الإصدار:** 1.0.0  
**التاريخ:** 2026-08-30  
**الحالة:** وثيقة رسمية

---

## 📑 جدول المحتويات

1. [نظرة عامة على المشروع](#1-نظرة-عامة-على-المشروع)
2. [الرؤية والأهداف](#2-الرؤية-والأهداف)
3. [المعمارية التقنية](#3-المعمارية-التقنية)
4. [الهيكل الكامل للمشروع](#4-الهيكل-الكامل-للمشروع)
5. [الميزات والوظائف](#5-الميزات-والوظائف)
6. [التقنيات المستخدمة](#6-التقنيات-المستخدمة)
7. [كيفية البدء والتطوير](#7-كيفية-البدء-والتطوير)
8. [النشر والإنتاج](#8-النشر-والإنتاج)
9. [الأمان والأداء](#9-الأمان-والأداء)
10. [الاختبارات](#10-الاختبارات)
11. [التوثيق الإضافي](#11-التوثيق-الإضافي)

---

## 1. نظرة عامة على المشروع

### 1.1 ما هو BuyTuk Academy؟

**BuyTuk Academy** هو منصة تعليمية موحّدة شاملة مصممة للمدارس العربية، تجمع بين:
- **محركات تعلم متخصصة** (قراءة، إملاء، تقييم، تشخيص)
- **بوابات متعددة** (طالب، معلم، ولي أمر، مدير، مسؤول)
- **دعم متعدد اللغات** (عربي، إنجليزي، رياضيات، علوم)
- **ميزات إدارية شاملة** (محفظة، نقاط، حضور، تقييمات)
- **ذكاء اصطناعي** (تغذية راجعة، توصيات مخصصة)

### 1.2 المشكلة التي يحلها المشروع

1. **تشتت الأدوات التعليمية**: المدارس تستخدم أنظمة متعددة غير متكاملة
2. **غياب التقييم الذكي**: لا توجد أنظمة تقييم قراءة عربية دقيقة
3. **ضعف التغذية الراجعة**: الطلاب لا يحصلون على تحليل مفصل لأدائهم
4. **صعوبة متابعة الأهل**: أولياء الأمور لا يرون تقدم أبنائهم بشكل واضح
5. **عدم التكيف مع المستوى**: المحتوى لا يتكيف مع مستوى كل طالب

### 1.3 الحل المقدم

منصة موحّدة تستخدم **الذكاء الاصطناعي** لتقييم القراءة العربية بدقة عالية، مع:
- تحليل النطق على مستوى الحروف (Phoneme-level)
- تقارير مفصلة عن الأخطاء ونقاط القوة
- توصيات مخصصة لكل طالب
- واجهات مخصصة لكل دور (طالب، معلم، ولي أمر)

---

## 2. الرؤية والأهداف

### 2.1 الرؤية

أن نكون **المنصة التعليمية الرائدة** في العالم العربي التي تجمع بين التقنية المتقدمة والمحتوى التعليمي عالي الجودة.

### 2.2 الأهداف الاستراتيجية

| الهدف | المؤشر | المستهدف |
|---|---|---|
| **تغطية السوق** | عدد المدارس | 1000 مدرسة في 3 سنوات |
| **جودة التقييم** | دقة تحليل النطق | 95%+ |
| **رضا المستخدمين** | NPS Score | 70+ |
| **الأداء** | وقت الاستجابة | < 200ms |
| **التوفر** | Uptime | 99.9% |

### 2.3 الأهداف التقنية

1. **Scalability**: دعم 100,000+ طالب متزامن
2. **Maintainability**: كود نظيف وقابل للصيانة
3. **Testability**: تغطية اختبارية 85%+
4. **Security**: أمان على مستوى البنوك
5. **Observability**: مراقبة كاملة للنظام

---

## 3. المعمارية التقنية

### 3.1 نظرة عامة على المعمارية

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js 14)                     │
│         Student | Teacher | Parent | Principal | Admin      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway (NestJS 10)                   │
│              Auth | RBAC | Modules | WebSocket              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   Specialized Engines                        │
│  Reading | Assessment | Content | Lesson | Dictation | Diag │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                Inference Gateway (Python + gRPC)             │
│     Whisper | Alignment | G2P | Feedback (GPU + CPU)        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  Storage & Infrastructure                    │
│         PostgreSQL | Redis | S3 | BullMQ | Observability    │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 نمط المعمارية

**Monorepo Architecture** مع **Domain-Driven Design (DDD)**:

- **Monorepo**: كل الكود في مستودع واحد باستخدام `pnpm workspaces` + `Turborepo`
- **DDD**: تنظيم حسب المجالات التعليمية (عربي، إنجليزي، رياضيات، علوم)
- **Microservices Logic**: منطق معزول في محركات متخصصة (Engines)

### 3.3 طبقات المعمارية

#### 3.3.1 Presentation Layer
- **Next.js 14** مع App Router
- **React 18** مع Server Components
- **Tailwind CSS** للتصميم
- **Socket.IO** للتواصل الفوري

#### 3.3.2 Application Layer
- **NestJS 10** للـ API
- **BullMQ** للمهام الخلفية
- **WebSocket** للتواصل الفوري

#### 3.3.3 Domain Layer
- **6 محركات متخصصة** (Reading, Assessment, Content, Lesson, Dictation, Diagnosis)
- **4 مجالات تعليمية** (Arabic, English, Math, Science)

#### 3.3.4 Infrastructure Layer
- **PostgreSQL 16** مع Drizzle ORM
- **Redis 7** للـ Cache والـ Queue
- **AWS S3** لتخزين الملفات
- **OpenTelemetry** للمراقبة

---

## 4. الهيكل الكامل للمشروع

### 4.1 الهيكل العام

```
buytuk-academy/
├── apps/                    # التطبيقات القابلة للنشر
│   ├── api/                # NestJS Backend
│   ├── web/                # Next.js Frontend
│   └── worker/             # BullMQ Workers
├── engines/                # المحركات المتخصصة
│   ├── reading-engine/     # محرك القراءة
│   ├── assessment-engine/  # محرك التقييم
│   ├── content-engine/     # محرك المحتوى
│   ├── lesson-engine/      # محرك الدروس
│   ├── dictation-engine/   # محرك الإملاء
│   └── learning-diagnosis/ # التشخيص التعليمي
├── domains/                # المجالات التعليمية
│   ├── arabic/             # العربية
│   ├── english/            # الإنجليزية
│   ├── math/               # الرياضيات
│   └── science/            # العلوم
── packages/               # الحزم المشتركة
│   ├── ui/                 # مكونات UI
│   ├── contracts/          # Types & DTOs
│   ├── config/             # Configuration
│   ├── shared/             # Utilities
│   ├── queue/              # BullMQ
│   ├── database/           # Drizzle + Schema
│   ├── security/           # Security layer
│   ├── observability/      # Logs + Metrics + Traces
│   ├── exercises-catalog/  # Exercise data
│   ├── curriculum/         # Curriculum data
│   └── i18n/               # Internationalization
├── inference-gateway/      # Python ML workers
├── docker/                 # Dockerfiles
├── k8s/                    # Kubernetes manifests
├── scripts/                # Dev scripts
├── tests/                  # All tests
├── docs/                   # Documentation
└── provider_configs/       # Model configs
```

### 4.2 تفاصيل كل قسم

#### 4.2.1 Apps (التطبيقات)

**apps/api/** - NestJS Backend
```
src/
├── main.ts                 # نقطة الدخول
├── app.module.ts           # الجذر Module
├── common/                 # أدوات مشتركة
│   ├── filters/           # Exception filters
│   ├── guards/            # Auth & Role guards
│   ├── pipes/             # Validation pipes
│   ├── interceptors/      # Logging & Transform
│   ├── decorators/        # Custom decorators
│   ├── logging/           # Logging module
│   ├── crypto/            # Hash service
│   ├── redis/             # Redis service
│   ├── security/          # Rate limiter
│   └── validation/        # Custom validators
└── modules/               # Feature modules (32 module)
    ├── auth/              # المصادقة
    ├── users/             # إدارة المستخدمين
    ├── students/          # إدارة الطلاب
    ├── teachers/          # إدارة المعلمين
    ├── parents/           # إدارة أولياء الأمور
    ├── school-principals/ # إدارة المدراء
    ├── classes/           # إدارة الفصول
    ├── subjects/          # إدارة المواد
    ├── lessons/           # إدارة الدروس
    ├── sessions/          # جلسات القراءة
    ├── attempts/          # محاولات القراءة
    ├── reports/           # التقارير
    ├── exercises/         # التمارين
    ├── mastery/           # الإتقان
    ├── analytics/         # التحليلات
    ├── audio/             # إدارة الصوت
    ├── content/           # إدارة المحتوى
    ├── curriculum/        # المنهج
    ├── wallet/            # المحفظة
    ├── points/            # النقاط
    ├── messages/          # الرسائل
    ├── notes/             # الملاحظات
    ├── support/           # الدعم
    ├── attendance/        # الحضور
    ├── ratings/           # التقييمات
    ├── exams/             # الامتحانات
    ├── notifications/     # الإشعارات
    ├── webhooks/          # Webhooks
    ├── audit/             # سجل التدقيق
    ├── rbac/              # الصلاحيات
    ├── admin/             # لوحة الإدارة
    ├── websocket/         # WebSocket gateway
    └── health/            # Health checks
```

**apps/web/** - Next.js Frontend
```
app/
├── layout.tsx             # Root layout
├── page.tsx               # Home page
├── providers.tsx          # Client providers
├── (auth)/                # المصادقة
│   ├── login/
│   ├── register/
│   └── forgot-password/
├── (student)/             # بوابة الطالب
│   ├── dashboard/
│   ├── read/
│   ├── learn/
│   ├── practice/
│   ├── reports/
│   ├── exercises/
│   ├── progress/
│   ├── messages/
│   ├── notes/
│   ├── wallet/
│   ├── points-store/
│   ── support/
├── (teacher)/             # بوابة المعلم
│   ├── dashboard/
│   ├── passages/
│   ├── lessons/
│   ├── students/
│   ├── classes/
│   ├── reports/
│   ├── exercises/
│   ├── analytics/
│   ├── schedule/
│   ├── attendance/
│   ├── ratings/
│   ├── voice-qa/
│   └── settings/
├── (parent)/              # بوابة ولي الأمر
│   ├── dashboard/
│   ├── children/
│   ├── progress/
│   ├── reports/
│   └── communication/
├── (principal)/           # بوابة المدير
│   ├── dashboard/
│   ├── teachers/
│   ├── students/
│   ├── classes/
│   ├── analytics/
│   └── reports/
── (admin)/               # بوابة المسؤول
│   ├── dashboard/
│   ├── users/
│   ├── queue/
│   ├── audit/
│   ├── models/
│   └── settings/
└── (english)/             # تعلم الإنجليزية
    ├── dashboard/
    ├── reading/
    ├── writing/
    ├── listening/
    ├── speaking/
    ├── grammar/
    ├── vocabulary/
    ├── exercises/
    └── progress/
```

**apps/worker/** - BullMQ Workers
```
src/
├── main.ts                # نقطة الدخول
├── worker.module.ts       # Root module
└── processors/            # Job processors
    ├── reading-analysis.processor.ts
    ├── lesson-processing.processor.ts
    ├── content-generation.processor.ts
    ├── notification.processor.ts
    ├── webhook.processor.ts
    ├── analytics-aggregation.processor.ts
    ├── report-generation.processor.ts
    ├── retry.processor.ts
    ├── cleanup.processor.ts
    └── scheduled-tasks.processor.ts
```

#### 4.2.2 Engines (المحركات المتخصصة)

**engines/reading-engine/** - محرك القراءة
```
src/
├── index.ts               # Entry point
├── pipeline/              # خط معالجة الصوت
│   ├── audio-enhancement.ts    # DeepFilterNet
│   ├── feature-extraction.ts   # Essentia
│   ├── vad.ts                  # Silero VAD
│   ├── stt-client.ts           # Whisper
│   ├── forced-alignment-client.ts # WhisperX
│   ├── g2p-client.ts           # CAMeL Tools
│   ├── ipa-mapper.ts           # IPA mapping
│   ├── phonetic-matrix.ts      # Phonetic distance
│   ├── alignment.ts            # DTW alignment
│   └── inference-client.ts     # gRPC client
├── engines/               # محركات التحليل
│   ├── confidence.engine.ts      # Confidence scoring
│   ├── reading-score.engine.ts   # Reading score
│   ├── mastery.engine.ts         # Mastery tracking
│   ├── gap.engine.ts             # Gap detection
│   ├── rule.engine.ts            # Rule engine
│   ├── ai-feedback.engine.ts     # AI feedback
│   ├── recommendation.engine.ts  # Recommendations
│   └── report-generator.engine.ts # Report generation
└── types/                 # Types
    └── index.ts
```

**engines/assessment-engine/** - محرك التقييم
```
src/
├── index.ts
── scoring/
│   ├── score-calculator.ts
│   ├── grade-calculator.ts
│   ── percentile-calculator.ts
├── evaluation/
│   ├── formative-assessment.ts
│   ├── summative-assessment.ts
│   └── diagnostic-assessment.ts
├── rubrics/
│   ├── rubric-manager.ts
│   ── rubric-templates.ts
└── types/
    └── index.ts
```

**engines/content-engine/** - محرك المحتوى
```
src/
├── index.ts
├── generation/
│   ├── content-generator.ts
│   ├── question-generator.ts
│   └── exercise-generator.ts
├── management/
│   ├── content-manager.ts
│   ├── version-control.ts
│   ── approval-workflow.ts
├── delivery/
│   ├── content-delivery.ts
│   ├── adaptive-content.ts
│   └── personalized-content.ts
└── types/
    └── index.ts
```

**engines/lesson-engine/** - محرك الدروس
```
src/
├── index.ts
├── planning/
│   ├── lesson-planner.ts
│   ├── objective-mapper.ts
│   └── activity-sequencer.ts
├── delivery/
│   ├── lesson-delivery.ts
│   ├── timeline-manager.ts
│   ── pacing-controller.ts
├── interaction/
│   ├── student-interaction.ts
│   ├── teacher-interaction.ts
│   └── collaborative-learning.ts
└── types/
    └── index.ts
```

**engines/dictation-engine/** - محرك الإملاء
```
src/
── index.ts
├── dictation/
│   ├── dictation-session.ts
│   ├── word-presentation.ts
│   └── response-evaluation.ts
├── correction/
│   ├── error-detection.ts
│   ├── correction-suggestions.ts
│   └── feedback-generator.ts
└── types/
    └── index.ts
```

**engines/learning-diagnosis/** - التشخيص التعليمي
```
src/
├── index.ts
├── diagnosis/
│   ├── learning-gap-detector.ts
│   ├── misconception-detector.ts
│   └── skill-mastery-analyzer.ts
├── intervention/
│   ├── intervention-planner.ts
│   ├── remediation-strategy.ts
│   └── support-recommendation.ts
├── cognitive/
│   ├── cognitive-profile.ts
│   ├── learning-style-analyzer.ts
│   └── multiple-intelligence.ts
└── types/
    └── index.ts
```

#### 4.2.3 Domains (المجالات التعليمية)

**domains/arabic/** - اللغة العربية
```
src/
├── index.ts
├── reading/           # القراءة
├── writing/           # الكتابة
── grammar/           # النحو
├── vocabulary/        # المفردات
├── tajweed/           # التجويد
└── types/
```

**domains/english/** - اللغة الإنجليزية
```
src/
├── index.ts
├── reading/
├── writing/
├── listening/
├── speaking/
├── grammar/
├── vocabulary/
├── pronunciation/
└── types/
```

**domains/math/** - الرياضيات
```
src/
├── index.ts
├── arithmetic/
├── algebra/
├── geometry/
├── calculus/
└── types/
```

**domains/science/** - العلوم
```
src/
├── index.ts
── physics/
├── chemistry/
── biology/
└── types/
```

#### 4.2.4 Packages (الحزم المشتركة)

**packages/ui/** - مكونات UI (19 مكون)
- Button, Input, Textarea, Card, Badge
- Sidebar, Table, Modal, Tabs, Dropdown
- ProgressBar, Avatar, Toast
- VoiceInput, AudioPlayer, Waveform
- ErrorState, LoadingState, EmptyState

**packages/contracts/** - Types & DTOs (36 ملف)
- enums, auth, user, student, teacher, parent, principal
- class, subject, lesson, session, attempt, report
- exercise, mastery, scoring, phoneme, alignment, gap
- recommendation, analytics, audio, content, curriculum
- wallet, points, messages, notes, attendance, exams
- rbac, audit, websocket

**packages/config/** - Configuration (9 ملفات)
- app.config.ts, database.config.ts, redis.config.ts
- security.config.ts, audio.config.ts, scoring.config.ts
- pipeline.config.ts, models.config.ts

**packages/shared/** - Utilities (9 ملفات)
- error-codes.ts, constants.ts, normalize.ts
- time.ts, ids.ts, arabic-utils.ts
- english-utils.ts, math-utils.ts

**packages/queue/** - BullMQ (5 ملفات)
- queues.ts, messages.ts, bullmq.config.ts, dlq.service.ts

**packages/database/** - Drizzle + Schema (28 ملف)
- drizzle.service.ts, drizzle.module.ts
- 22 schema files (users, students, teachers, etc.)

**packages/security/** - Security (6 ملفات)
- encryption.ts, signed-urls.ts, api-keys.ts
- rls.ts, token.ts

**packages/observability/** - Observability (5 ملفات)
- logger.ts, metrics.ts, tracing.ts, health.ts

**packages/exercises-catalog/** - Exercise Data
- arabic/, english/, math/

**packages/curriculum/** - Curriculum Data
- standards/, objectives/, scope-sequence/, mapping/

**packages/i18n/** - Internationalization
- ar.json, en.json, config.ts

#### 4.2.5 Inference Gateway

```
inference-gateway/
├── pyproject.toml
├── requirements.txt
── Dockerfile
├── proto/
│   └── inference.proto
├── gateway/
│   ├── server.py
│   ├── circuit_breaker.py
│   └── auth.py
├── workers/
│   ├── whisper_worker.py
│   ├── alignment_worker.py
│   ├── g2p_worker.py
│   └── feedback_worker.py
└── models/
    ├── whisper_service.py
    ├── whisperx_service.py
    ├── mms_service.py
    ├── camel_service.py
    └── llm_service.py
```

---

## 5. الميزات والوظائف

### 5.1 الميزات الأساسية

#### 5.1.1 نظام المصادقة والصلاحيات
- **تسجيل دخول آمن** باستخدام JWT
- **5 أدوار**: Admin, Principal, Teacher, Parent, Student
- **RBAC** (Role-Based Access Control)
- **Row Level Security** في قاعدة البيانات
- **تسجيل خروج آمن** مع invalidation للـ tokens

#### 5.1.2 بوابة الطالب
- **لوحة تحكم** تعرض التقدم والإحصائيات
- **قراءة نصوص** مع تسجيل صوتي
- **تمارين تفاعلية** (إملاء، قراءة، فهم)
- **تقارير مفصلة** عن الأداء
- **محفظة ونقاط** للتحفيز
- **رسائل** للمعلمين

#### 5.1.3 بوابة المعلم
- **إدارة الفصول** والطلاب
- **إنشاء دروس** وتمارين
- **تقييم أداء الطلاب**
- **تقارير تحليلية**
- **جدول الحصص**
- **تسجيل الحضور**

#### 5.1.4 بوابة ولي الأمر
- **متابعة تقدم الأبناء**
- **تقارير دورية**
- **تواصل مع المعلمين**
- **إشعارات فورية**

#### 5.1.5 بوابة المدير
- **إحصائيات المدرسة**
- **إدارة المعلمين**
- **تقارير شاملة**
- **تحليلات الأداء**

#### 5.1.6 بوابة المسؤول
- **إدارة المستخدمين**
- **مراقبة النظام**
- **إدارة الطوابير**
- **سجل التدقيق**

### 5.2 الميزات المتقدمة

#### 5.2.1 محرك القراءة الذكي
- **تحليل النطق** على مستوى الحروف (Phoneme-level)
- **كشف الأخطاء** بدقة عالية
- **تقييم الطلاقة** (Fluency)
- **تقييم النبر** (Prosody)
- **توصيات مخصصة** للتحسين

#### 5.2.2 نظام التقييم التكيفي
- **تقييم تكويني** (Formative)
- **تقييم تلخيصي** (Summative)
- **تقييم تشخيصي** (Diagnostic)
- **تكييف المحتوى** حسب المستوى

#### 5.2.3 نظام المحفظة والنقاط
- **كسب النقاط** من الإنجازات
- **صرف النقاط** في المتجر
- **مستويات** (Leveling system)
- **شارات** (Badges)

#### 5.2.4 نظام الإشعارات
- **إشعارات فورية** عبر WebSocket
- **إشعارات بريد إلكتروني**
- **إشعارات Push** (FCM)
- **تخصيص الإشعارات** حسب الدور

---

## 6. التقنيات المستخدمة

### 6.1 Frontend

| التقنية | الإصدار | الاستخدام |
|---|---|---|
| **Next.js** | 14.2 | Framework |
| **React** | 18.3 | UI Library |
| **TypeScript** | 5.4 | Type Safety |
| **Tailwind CSS** | 3.4 | Styling |
| **Socket.IO Client** | 4.7 | Real-time |
| **Zustand** | 4.5 | State Management |
| **React Hot Toast** | 2.4 | Notifications |

### 6.2 Backend

| التقنية | الإصدار | الاستخدام |
|---|---|---|
| **NestJS** | 10.3 | Framework |
| **Node.js** | 20.11 | Runtime |
| **TypeScript** | 5.4 | Type Safety |
| **Drizzle ORM** | 0.31 | Database ORM |
| **PostgreSQL** | 16 | Database |
| **Redis** | 7 | Cache & Queue |
| **BullMQ** | 5.7 | Job Queue |
| **JWT** | 9.0 | Authentication |
| **Passport** | 0.7 | Auth Strategies |
| **Socket.IO** | 4.7 | WebSocket |

### 6.3 ML & AI

| التقنية | الإصدار | الاستخدام |
|---|---|---|
| **Whisper** | Large V3 | Speech-to-Text |
| **WhisperX** | 3.1 | Forced Alignment |
| **MMS** | 1B | Arabic Phonemes |
| **CAMeL Tools** | 1.2 | Arabic NLP |
| **DeepFilterNet** | 2 | Audio Enhancement |
| **Silero VAD** | - | Voice Activity Detection |
| **OpenAI GPT** | - | AI Feedback |
| **Gemini** | - | AI Feedback |

### 6.4 Infrastructure

| التقنية | الإصدار | الاستخدام |
|---|---|---|
| **Docker** | 24.0 | Containerization |
| **Kubernetes** | 1.29 | Orchestration |
| **AWS S3** | - | File Storage |
| **Prometheus** | - | Metrics |
| **OpenTelemetry** | 0.51 | Tracing |
| **Pino** | 9.1 | Logging |
| **GitHub Actions** | - | CI/CD |

### 6.5 Development Tools

| التقنية | الإصدار | الاستخدام |
|---|---|---|
| **pnpm** | 9.0 | Package Manager |
| **Turborepo** | 2.0 | Monorepo Build |
| **ESLint** | 9.3 | Linting |
| **Prettier** | 3.2 | Formatting |
| **Husky** | 9.0 | Git Hooks |
| **Jest** | 29.7 | Testing |
| **k6** | - | Load Testing |

---

## 7. كيفية البدء والتطوير

### 7.1 المتطلبات

```bash
# Node.js
node -v  # يجب أن يكون >= 20.11.0

# pnpm
pnpm -v  # يجب أن يكون >= 9.0.0

# Docker
docker -v  # يجب أن يكون >= 24.0

# Python (للـ inference-gateway)
python3 --version  # يجب أن يكون >= 3.10
```

### 7.2 التثبيت والإعداد

```bash
# 1. استنساخ المشروع
git clone https://github.com/Codeplus3/buytuk-academy.git
cd buytuk-academy

# 2. تثبيت التبعيات
pnpm install

# 3. إعداد متغيرات البيئة
cp .env.example .env
# عدّل القيم في .env حسب بيئتك

# 4. تشغيل الخدمات الأساسية
docker-compose up -d postgres redis

# 5. انتظار جاهزية الخدمات
sleep 10

# 6. إعداد قاعدة البيانات
pnpm db:push

# 7. إضافة بيانات تجريبية
pnpm db:seed

# 8. تشغيل المشروع
pnpm dev
```

### 7.3 الوصول للتطبيق

بعد التشغيل:
- **Frontend**: http://localhost:3000
- **API**: http://localhost:4000
- **API Docs**: http://localhost:4000/api/docs
- **Health Check**: http://localhost:4000/health/ready
- **Metrics**: http://localhost:4000/metrics

### 7.4 حسابات تجريبية

| الدور | اسم المستخدم | كلمة المرور |
|---|---|---|
| طالب | student | student123 |
| معلم | teacher | teacher123 |
| ولي أمر | parent | parent123 |
| مدير | principal | principal123 |
| مسؤول | admin | admin123 |

### 7.5 أوامر التطوير الشائعة

```bash
# تشغيل كل شيء
pnpm dev

# تشغيل API فقط
pnpm dev:api

# تشغيل Frontend فقط
pnpm dev:web

# تشغيل Workers فقط
pnpm dev:worker

# بناء المشروع
pnpm build

# بناء API فقط
pnpm build:api

# بناء Frontend فقط
pnpm build:web

# فحص الكود
pnpm lint

# تصحيح الكود
pnpm lint:fix

# تنسيق الكود
pnpm format

# فحص الأنواع
pnpm type-check

# تشغيل الاختبارات
pnpm test

# تشغيل اختبارات الوحدة
pnpm test:unit

# تشغيل اختبارات التكامل
pnpm test:integration

# تشغيل اختبارات E2E
pnpm test:e2e

# تغطية الاختبارات
pnpm test:coverage

# تنظيف المشروع
pnpm clean

# إدارة قاعدة البيانات
pnpm db:generate  # إنشاء migrations
pnpm db:migrate   # تطبيق migrations
pnpm db:push      # Push schema مباشرة
pnpm db:seed      # إضافة بيانات تجريبية
pnpm db:studio    # فتح Drizzle Studio
```

### 7.6 هيكل التطوير

#### 7.6.1 إضافة Feature جديد

1. **إنشاء Module في API**:
```bash
# في apps/api/src/modules/
mkdir new-feature
cd new-feature
touch new-feature.module.ts
touch new-feature.controller.ts
touch new-feature.service.ts
```

2. **إضافة Route في Frontend**:
```bash
# في apps/web/app/
mkdir (student)/new-feature
touch (student)/new-feature/page.tsx
```

3. **إضافة Types**:
```bash
# في packages/contracts/src/
touch new-feature.ts
```

4. **تحديث Schema**:
```bash
# في packages/database/src/schema/
touch new-feature.ts
```

#### 7.6.2 إضافة Engine جديد

```bash
# في engines/
mkdir new-engine
cd new-engine

# إنشاء package.json
cat > package.json << 'EOF'
{
  "name": "@buytuk/new-engine",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts"
}
EOF

# إنشاء tsconfig.json
cat > tsconfig.json << 'EOF'
{
  "extends": "../../packages/config/tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
EOF

# إنشاء src/index.ts
mkdir src
touch src/index.ts
```

#### 7.6.3 إضافة Domain جديد

```bash
# في domains/
mkdir new-domain
cd new-domain

# إنشاء package.json و tsconfig.json
# (نفس الخطوات السابقة)

# إنشاء src/
mkdir src
touch src/index.ts
```

---

## 8. النشر والإنتاج

### 8.1 النشر باستخدام Docker Compose

```bash
# بناء الصور
docker-compose build

# تشغيل في الخلفية
docker-compose up -d

# مشاهدة السجلات
docker-compose logs -f

# إيقاف الخدمات
docker-compose down

# النشر مع GPU (للـ inference)
docker-compose --profile gpu up -d

# النشر للإنتاج
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### 8.2 النشر باستخدام Kubernetes

```bash
# تطبيق الـ Namespace
kubectl apply -f k8s/namespace.yaml

# تطبيق الـ ConfigMap و Secrets
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml

# تطبيق الـ Deployments
kubectl apply -f k8s/api-deployment.yaml
kubectl apply -f k8s/web-deployment.yaml
kubectl apply -f k8s/worker-deployment.yaml
kubectl apply -f k8s/inference-deployment.yaml

# تطبيق الـ Database
kubectl apply -f k8s/postgres-statefulset.yaml
kubectl apply -f k8s/redis-deployment.yaml

# تطبيق الـ Ingress
kubectl apply -f k8s/ingress.yaml

# تطبيق الـ HPA
kubectl apply -f k8s/hpa.yaml

# تطبيق الـ Network Policies
kubectl apply -f k8s/network-policy.yaml
```

### 8.3 CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 9
      - run: pnpm install
      - run: pnpm lint

  test:
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 9
      - run: pnpm install
      - run: pnpm test:unit
      - run: pnpm test:integration

  build:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 9
      - run: pnpm install
      - run: pnpm build

  deploy:
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Deploy to Production
        run: |
          # Deployment logic here
          echo "Deploying to production..."
```

### 8.4 Monitoring & Observability

```bash
# Prometheus Metrics
curl http://localhost:4000/metrics

# Health Checks
curl http://localhost:4000/health/live
curl http://localhost:4000/health/ready
curl http://localhost:4000/health/detailed

# Logs (Docker)
docker-compose logs -f api
docker-compose logs -f worker

# Logs (Kubernetes)
kubectl logs -f deployment/buytuk-api
kubectl logs -f deployment/buytuk-worker
```

---

## 9. الأمان والأداء

### 9.1 الأمان

#### 9.1.1 Authentication & Authorization
- **JWT Tokens**: Access tokens (7 أيام) + Refresh tokens (30 يوم)
- **Password Hashing**: bcrypt مع 12 rounds
- **RBAC**: صلاحيات دقيقة لكل دور
- **Row Level Security**: في قاعدة البيانات

#### 9.1.2 Data Protection
- **Audio Encryption**: AES-256-GCM
- **Signed URLs**: لرفع وتحميل الملفات
- **API Keys**: للـ inference gateway
- **Rate Limiting**: 100 طلب / 15 دقيقة

#### 9.1.3 Network Security
- **CORS**: مسموح فقط للنطاقات المعروفة
- **Helmet**: HTTP security headers
- **HTTPS**: في الإنتاج فقط
- **Network Policies**: في Kubernetes

#### 9.1.4 Audit & Compliance
- **Audit Logs**: كل العمليات مسجلة
- **Correlation IDs**: لتتبع الطلبات
- **Data Retention**: سياسات واضحة

### 9.2 الأداء

#### 9.2.1 Caching Strategy
- **Redis Cache**: للـ sessions والـ tokens
- **CDN**: للـ static assets
- **Database Indexes**: على الحقول المستخدمة

#### 9.2.2 Database Optimization
- **Connection Pooling**: 5-20 connection
- **Query Optimization**: باستخدام Drizzle
- **Read Replicas**: في الإنتاج

#### 9.2.3 API Performance
- **Response Compression**: gzip
- **Pagination**: للبيانات الكبيرة
- **Lazy Loading**: للـ images والـ components

#### 9.2.4 ML Inference Performance
- **GPU Acceleration**: للـ Whisper و Alignment
- **Batch Processing**: للمهام الكبيرة
- **Queue System**: BullMQ للـ async processing

#### 9.2.5 Frontend Performance
- **Next.js App Router**: Server Components
- **Code Splitting**: تلقائي
- **Image Optimization**: Next.js Image component
- **Font Optimization**: Next.js Font component

### 9.3 Scalability

#### 9.3.1 Horizontal Scaling
- **API**: 3-10 replicas (HPA)
- **Workers**: 2-5 replicas (HPA)
- **Frontend**: 3-8 replicas (HPA)

#### 9.3.2 Vertical Scaling
- **PostgreSQL**: Aurora RDS
- **Redis**: Cluster mode
- **S3**: Cross-region replication

#### 9.3.3 ML Scaling
- **GPU Instances**: للـ inference
- **Auto-scaling**: حسب الحمل
- **Model Caching**: لتقليل التحميل

---

## 10. الاختبارات

### 10.1 أنواع الاختبارات

#### 10.1.1 Unit Tests
- **الموقع**: `packages/*/src/**/*.spec.ts`
- **الهدف**: اختبار الوحدات المنفردة
- **التغطية**: 70%+

#### 10.1.2 Integration Tests
- **الموقع**: `tests/integration/`
- **الهدف**: اختبار تكامل المكونات
- **التغطية**: 60%+

#### 10.1.3 E2E Tests
- **الموقع**: `tests/e2e/`
- **الهدف**: اختبار السيناريوهات الكاملة
- **التغطية**: 50%+

#### 10.1.4 Contract Tests
- **الموقع**: `tests/contract/`
- **الهدف**: اختبار API contracts
- **التغطية**: 80%+

#### 10.1.5 Acceptance Tests
- **الموقع**: `tests/acceptance/`
- **الهدف**: اختبار متطلبات العمل
- **التغطية**: 70%+

#### 10.1.6 Security Tests
- **الموقع**: `tests/security/`
- **الهدف**: اختبار الأمان
- **التغطية**: 90%+

#### 10.1.7 Load Tests
- **الموقع**: `tests/load/`
- **الهدف**: اختبار الأداء تحت الحمل
- **الأداة**: k6

### 10.2 تشغيل الاختبارات

```bash
# كل الاختبارات
pnpm test

# اختبارات الوحدة
pnpm test:unit

# اختبارات التكامل
pnpm test:integration

# اختبارات E2E
pnpm test:e2e

# مع التغطية
pnpm test:coverage

# Load tests
k6 run tests/load/api.load.js
```

### 10.3 معايير الجودة

- **Coverage**: 70%+ (هدف 85%+)
- **Linting**: 0 errors
- **Type Checking**: 0 errors
- **Build**: ناجح دائماً
- **Tests**: كل الاختبارات تمر

---

## 11. التوثيق الإضافي

### 11.1 Architecture Decision Records (ADRs)

المشروع يحتوي على 16 ADR في `docs/adr/`:

1. **0001-monorepo-structure.md**: لماذا Monorepo؟
2. **0002-unified-architecture.md**: المعمارية الموحدة
3. **0003-engine-separation.md**: فصل المحركات
4. **0004-domain-driven-design.md**: DDD
5. **0005-reading-engine.md**: محرك القراءة
6. **0006-assessment-engine.md**: محرك التقييم
7. **0007-content-engine.md**: محرك المحتوى
8. **0008-lesson-engine.md**: محرك الدروس
9. **0009-dictation-engine.md**: محرك الإملاء
10. **0010-learning-diagnosis.md**: التشخيص التعليمي
11. **0011-curriculum-intelligence.md**: ذكاء المنهج
12. **0012-adaptive-learning.md**: التعلم التكيفي
13. **0013-multi-language-support.md**: دعم اللغات
14. **0014-role-based-access.md**: RBAC
15. **0015-wallet-and-points.md**: المحفظة والنقاط
16. **0016-parent-engagement.md**: مشاركة أولياء الأمور

### 11.2 وثائق تقنية

- **ARCHITECTURE.md**: نظرة عامة على المعمارية
- **PIPELINE.md**: خط معالجة القراءة
- **SECURITY.md**: الأمان
- **DEPLOYMENT.md**: النشر
- **API.md**: API Reference
- **PHONEME_ANALYSIS.md**: تحليل الحروف
- **SCORING_MODEL.md**: نموذج التقييم
- **CURRICULUM.md**: المنهج
- **openapi.yaml**: OpenAPI Specification

### 11.3 Configuration Files

- **provider_configs/**: إعدادات النماذج
  - whisper-large-v3.yaml
  - whisperx-alignment.yaml
  - mms-fa-arabic.yaml
  - camel-tools.yaml
  - silero-vad.yaml
  - deepfilternet.yaml

---

## 📊 إحصائيات المشروع

| الفئة | العدد |
|---|---|
| **إجمالي الملفات** | 362+ |
| **التطبيقات** | 3 (API, Web, Worker) |
| **المحركات** | 6 |
| **المجالات** | 4 |
| **الحزم المشتركة** | 11 |
| **Modules في API** | 32 |
| **صفحات Frontend** | 60+ |
| **Schema Tables** | 22 |
| **ML Models** | 6 |
| **اختبارات** | 7 أنواع |

---

## 🎯 خارطة الطريق

### المرحلة 1: الأساس (شهر 1-2)
- ✅ إعداد المشروع
- ✅ المصادقة والصلاحيات
- ✅ البنية الأساسية للـ API
- ✅ Frontend أساسي

### المرحلة 2: المحركات (شهر 3-4)
- ✅ محرك القراءة
- ✅ محرك التقييم
- ✅ Inference Gateway

### المرحلة 3: الميزات (شهر 5-6)
- ✅ بوابات المستخدمين
- ✅ نظام النقاط
- ✅ الرسائل والإشعارات

### المرحلة 4: التحسين (شهر 7-8)
- ✅ الأداء
- ✅ الأمان
- ✅ الاختبارات

### المرحلة 5: الإنتاج (شهر 9-10)
- ✅ النشر
- ✅ المراقبة
- ✅ الصيانة

---

## 📞 الدعم والتواصل

- **GitHub**: https://github.com/Codeplus3/buytuk-academy
- **Documentation**: `docs/`
- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions

---

##  الترخيص

جميع الحقوق محفوظة © 2026 BuyTuk Academy

---

**نهاية الوثيقة**

---

هذه الوثيقة الشاملة تغطي كل جوانب مشروع BuyTuk Academy من البداية إلى النهاية. يمكنك استخدامها كمرجع كامل للمشروع.