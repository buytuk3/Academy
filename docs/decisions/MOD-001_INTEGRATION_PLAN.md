# خطة دمج MOD‑001 — MOD‑001_INTEGRATION_PLAN.md

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)

## الإصدار IP‑1.0 · 2026‑09‑06 · الحالة: للاعتماد (تُفتح MOD‑002 بعد اعتماد هذه الوثيقة + عقد المعمارية)

> تنفَّذ هذه الخطة **بعد** اعتماد ARCHITECTURE_CONTRACT.md رسميًا.
> المبدأ الحاكم: **نقل لا نسخ · 0 تعارض · 0 تكرار · 0 فقدان وظيفة · كل خطوة قابلة للبناء والاختبار**.
> الوضع الراهن (مثبت من جرد فعلي): محرك القراءة = 64 ملفًا، 27 اعتماد تشغيل، 14 جدولًا في schema المحرك، 13 نقطة نهاية REST/WS، 3 قوائم BullMQ، واجهة Inference بـ 6 خدمات gRPC.

---

## 1. النطاق والهدف

نقل MOD‑001 من `artifacts/reading-engine` إلى البنية المعيارية الموحّدة:

```
artifacts/reading-engine  →  engines/reading + apps/api + apps/worker
                              + packages/{contracts,database,queue,config,security,observability,shared}
```

مع:
- دمج كل الازدواج القائم (جداول، Auth، Types) في **موضع واحد** لكل كيان.
- بناء الملفات الناقصة فقط (المبينة في §6) — لا إعادة كتابة لمنطق موجود.
- تجميد الـ Schema ومصادر الحقيقة (لا تعديل على `engine/src/db` ولا `lib/db` بعد توقيع هذه الخطة حتى اكتمال الدمج).

## 2. مبادئ الدمج (Merge Principles)

1. **Move, then fix**: كل ملف يُنقل بنفس المحتوى تقريبًا، ثم تُصحَّح imports/package.json فقط.
2. **موضع واحد**: أي كود مكرر يُحذف في نفس خطوة النقل (لا «نسخة احتياطية» داخل الريبو).
3. **Leaf أولاً**: نقل الملفات عديمة التبعيات قبل المعتمدة (ترتيب §9).
4. **Gate لكل مرحلة**: `tsc --noEmit` = 0 أخطاء + `vitest` = كلها خضراء قبل الانتقال للمرحلة التالية.
5. **Zero-Loss Checklist**: لكل مجموعة ملفات قائمة قبل/بعد (§10) — لا يُغلق أي بند إلا بتأكيد مسؤول التنفيذ.
6. **Commit لكل مرحلة**: كل خطوة = commit مستقل + tag (للتراجع الآمن §11).
7. **لا ملف جديد خارج الخطة**: الالتزام الصارم بخريطة §5 و §6.

## 3. الهدف النهائي (Target Layout)

```
buytuk-unified/
├── apps/
│   ├── api/                      # Express 5 — Orchestration فقط (REST + WS)
│   │   └── src/ (index, app, routes/{health,auth,passages,analyze,reports,audio}, ws/socket)
│   └── worker/                   # BullMQ Workers
│       └── src/ (index, workers/analyze.worker)
├── engines/
│   ├── reading/                  # MOD‑001 الأساس (pipeline + reading-scoring + confidence + report + exercises + inference-client)
│   ├── learning-diagnosis/       # gap + rule-engine + recommendation (منقولة من MOD‑001)
│   └── mastery/                  # mastery.ts (منقول من MOD‑001)
├── packages/
│   ├── contracts/                # DTOs + Types + Events (من types/index.ts) + OpenAPI/Zod
│   ├── database/                 # schema موحّد + migrations + client (Pool واحدة)
│   ├── queue/                    # BullMQ إعدادات + أنواع + DLQ (كسر دورة bullmq→config)
│   ├── config/                   # env vars + إعدادات
│   ├── security/                 # auth موحّد + encryption + s3-client
│   ├── observability/            # logger + metrics
│   └── shared/                   # utils عامة (لا منطق تعليمي)
└── inference-gateway/            # يبقى خدمة مستقلة (Python gRPC) — خارج النقل
```

**قواعد ملزمة**: لا Business Logic في `apps/*` · لا معرفة بـ Express في `engines/*` · لا اعتماد عكسي من `packages/*` إلى `engines/*` · لا Engine→Engine مباشر (عبر Contracts فقط).

## 4. سجل الازدواج والتعارضات (0 تعارض 0 تكرار — الحلول المعتمدة)

| # | التعارض/الازدواج الحالي | الموقعان | الحل المعتمد (في هذه الخطة) |
|---|---|---|---|
| C‑01 | جداول `users` / `students` / `audit_logs` مكررة | engine `src/db/schema.ts` vs `lib/db` | دمج في `packages/database` بهوية موحّدة (أساس `lib/db` + دمج أعمدة engine المفقودة) — §5B |
| C‑02 | `/auth/login` مكرر | `api-server/src/routes/auth.ts` vs engine `src/http/routes.ts` | Auth واحد في `packages/security` + نقطة تقديم واحدة في `apps/api` — المحرك يستهلك عبر Contract |
| C‑03 | Express نسختان | api-server `^5.2.1` vs engine `^4.19.2` | توحيد **Express ^5** (D‑01) — تعديل package.json فقط، لا تغيير منطق |
| C‑04 | نزاع تسمية `sessions` | engine `sessions` vs lib/db `reading_sessions` | اعتماد `reading_sessions` الموحّد + **ADR‑008** (مسجلة في العقد §21) |
| C‑05 | إعداد Queue داخل المحرك | `src/queue/bullmq.ts` ← `src/config/pipeline.config.ts` | `packages/queue` يستقبل **الإعداد مع اعتماداته** — كسر الدورة (النقل يعكس التبعية) |
| C‑06 | Types مزدوجة المصدر | `src/types/index.ts` vs `lib/api-zod` (يغطي healthz فقط) | `packages/contracts` هو المصدر؛ api‑zod يُولَّد لاحقًا من نفس المصدر — حذف التكرار الجزئي |
| C‑07 | gap/rule/mastery/recommendation داخل reading | `src/engines/*` | **نقل** لملاكها (learning-diagnosis / mastery) — لا نسخ، وفق D‑02 |
| C‑08 | `http` و`socket` تتصلان بـ db مباشرة | engine تتصل بـ db مباشرة | `apps/api` تصل عبر Contracts + `packages/database` — لا وصول عشوائي |

## 5. خريطة النقل ملفًا-ملفًا (File-by-File Migration Map)

### A → `packages/contracts`
| المصدر | الوجهة | النوع |
|---|---|---|
| `src/types/index.ts` | `packages/contracts/src/reading/types.ts` | نقل + تصدير موحّد |
| `src/types/vendor.d.ts` | `packages/contracts/src/reading/vendor.d.ts` (أو types إعلانية) | نقل |
| — (جديد) | `packages/contracts/src/index.ts` (barrel واحد) | **جديد** |
| — (جديد) | `packages/contracts/src/events/*.ts` (12 حدثًا §12 من العقد) | **جديد** |
يتبعه: تجميد `api-spec`/`api-zod` على هذا المصدر.

### B → `packages/database` (أكبر خطوة — توحيد)
| المصدر | الوجهة | النوع |
|---|---|---|
| `src/db/schema.ts` (14 جدولًا) | `packages/database/src/schema/reading/*.ts` | نقل مع إعادة تسمية (`sessions`→`reading_sessions`, `mastery_records`→mastery, `gaps`/`remediation_*`→diagnosis/intervention) |
| `lib/db/src/schema/*.ts` (13 جدولًا: tenants, users, schools, classes, students, refresh_tokens, reading_sessions, gaps, remediation_plans, remediation_activities, evidence_items, impact_measurements, audit_logs) | `packages/database/src/schema/identity|assessment|diagnosis|intervention|analytics/*.ts` | نقل + توحيد |
| `src/db/index.ts` (Pool) | `packages/database/src/client.ts` (Pool واحدة + تهيئة) | نقل + تعديل |
| `src/db/migrations/` + `lib/db/migrations/` | `packages/database/drizzle/` (هجرة موحّدة) | دمج + توليد هجرة جديدة من schema الموحّد |
| — (جديد) | `packages/database/src/index.ts` + `drizzle.config.ts` | **جديد** |

**قاعدة توحيد الجداول المتكررة (C‑01):** جدول `users`: أعمدة `lib/db` أساس + أعمدة engine الإضافية (حقول التعريف) تُدمج؛ `students`: نفسه؛ `audit_logs`: schema واحد يُكتب منه عبر Audit Pipeline (لا يبقى «جدولًا صامتًا»).

### C → `packages/queue`
| المصدر | الوجهة | النوع |
|---|---|---|
| `src/queue/bullmq.ts` | `packages/queue/src/bullmq.ts` | نقل (يبقى إعداد Redis/قوائم) |
| — (جديد) | `packages/queue/src/types.ts` (JobPayload: AnalyzeJob…) | **جديد** (مشتق من `types/index.ts`) |
| — (جديد) | `packages/queue/src/index.ts` | **جديد** |

### D → `packages/config`
| المصدر | الوجهة | النوع |
|---|---|---|
| `src/config/pipeline.config.ts` + `src/config/models.config.ts` | `packages/config/src/*.ts` | نقل (يبقى تعريف النماذج والإعداد هنا) |
| — (جديد) | `packages/config/src/index.ts` (قراءة env موحّدة + تحقق Zod) | **جديد** |

### E → `packages/security`
| المصدر | الوجهة | النوع |
|---|---|---|
| `src/security/encryption.ts`, `src/security/s3-client.ts` | `packages/security/src/*.ts` | نقل |
| `src/middleware/auth.ts` | `packages/security/src/auth/*.ts` (Unified Auth: access 15m + rotating refresh — C‑02) | نقل + تعديل (توحيد مع api‑server auth) |
| — (جديد) | `packages/security/src/index.ts` + `src/auth/refresh-token.ts` (روتاتينغ Refresh) | **جديد** |

### F → `packages/observability`
| المصدر | الوجهة | النوع |
|---|---|---|
| `src/observability/logger.ts`, `src/observability/metrics.ts` | `packages/observability/src/*.ts` | نقل |
| — (جديد) | `packages/observability/src/trace.ts` (OTel ربط) | **جديد** |

### G → `apps/api` (Transport only)
| المصدر | الوجهة | النوع |
|---|---|---|
| `src/http/routes.ts` | `apps/api/src/routes/{health,auth,passages,analyze,reports,audio}.ts` | نقل + **تجريد منطق الأعمال** (Controllers تستدعي Engines عبر Contracts فقط) |
| `src/realtime/socket.ts` | `apps/api/src/ws/socket.ts` | نقل |
| `src/index.ts` | `apps/api/src/index.ts` (bootstrap Express 5 + middleware) | نقل + تعديل |
| — (جديد) | `apps/api/src/app.ts` (helmet, cors, json, pino, rate-limit, error handler موحّد) | **جديد** |
| `api-server/src/{app.ts,index.ts}` | يُدمج في `apps/api` (نفس الوجهة) | دمج (إزالة الازدواج C‑02/C‑03) |

### H → `engines/reading` (منطق القراءة فقط — ملكية حصرية)
| المصدر | الوجهة | النوع |
|---|---|---|
| `src/pipeline/{feature-extraction,alignment,stt,orchestrate}*` | `engines/reading/src/pipeline/` | نقل |
| `src/engines/{reading-score,confidence}.ts` | `engines/reading/src/engines/` | نقل |
| `src/report/generator.ts` | `engines/reading/src/report/` | نقل |
| `src/exercises/library.ts` | `engines/reading/src/exercises/` | نقل |
| `src/integration/inference-client.ts` | `engines/reading/src/integration/` | نقل (يستدعي Gateway فقط) |
| — (جديد) | `engines/reading/src/index.ts` — **Reading Application Contract** (Facade: `analyzeReading()`, `getReport()`, `getPassages()`) | **جديد** — الواجهة التي يستهلكها apps/api فقط |

### I → `engines/learning-diagnosis` (نقل لا نسخ)
| المصدر | الوجهة | النوع |
|---|---|---|
| `src/engines/gap.ts` | `engines/learning-diagnosis/src/gap.ts` | نقل |
| `src/engines/rule-engine.ts` | `engines/learning-diagnosis/src/rule-engine.ts` | نقل |
| `src/engines/recommendation.ts` | `engines/learning-diagnosis/src/recommendation.ts` | نقل |
| — (جديد) | `engines/learning-diagnosis/src/index.ts` (Contract: `diagnose(sessionResult) → {gaps, misconceptions, evidence}`) | **جديد** |

### J → `engines/mastery`
| المصدر | الوجهة | النوع |
|---|---|---|
| `src/engines/mastery.ts` | `engines/mastery/src/mastery.ts` | نقل |
| — (جديد) | `engines/mastery/src/index.ts` (Contract: `updateMastery(studentId, result)`, `getMastery`) | **جديد** |

### K → `apps/worker`
| المصدر | الوجهة | النوع |
|---|---|---|
| `src/queue/workers/index.ts`, `src/queue/workers/analyze.worker.ts` | `apps/worker/src/workers/` | نقل |
| — (جديد) | `apps/worker/src/index.ts` (تشغيل workers + معالجة retries/DLQ/status) | **جديد** |

### L → البنية التحتية للـ monorepo
| البند | النوع | ملاحظة |
|---|---|---|
| `pnpm-workspace.yaml` (إضافة apps/*, engines/*, packages/*) | تعديل | إزالة `artifacts/*` بعد اكتمال النقل |
| `tsconfig.base.json` (references محدّثة) | تعديل | |
| `package.json` الجذر (scripts: build, test, typecheck, lint) | **جديد** | |
| `.dependency-cruiser` (فشل عند أي دورة/تكرار) | **جديد** | |
| `COMPLETION_MAP.md` + `TRACEABILITY_MATRIX.md` | تحديث مستمر | لكل مرحلة |

## 6. الملفات الناقصة التي تُبنى (New Files — إجمالي 16 ملفًا جديدًا)

| # | الملف | المحتوى/المواصفة | الاعتماد على |
|---|---|---|---|
| 1 | `packages/contracts/src/index.ts` | تصدير موحّد لكل أنواع reading + الأحداث | — |
| 2 | `packages/contracts/src/events/learning-events.ts` | عقود 12 حدثًا (id, type, version, occurredAt, actor, tenantId, studentId, payload) | types |
| 3 | `packages/database/src/index.ts` | تصدير schema موحّد + client + relations | schema |
| 4 | `packages/database/drizzle.config.ts` | إعداد Drizzle للهجرة الموحّدة | — |
| 5 | `packages/queue/src/types.ts` | أنواع Jobs + أسماء القوائم (analyze/analyze-dlq/realtime) | contracts |
| 6 | `packages/queue/src/index.ts` | تهيئة BullMQ + retries + DLQ defaults | config |
| 7 | `packages/config/src/index.ts` | env schema (Zod) + تحميل موحّد | — |
| 8 | `packages/security/src/auth/refresh-token.ts` | إصدار وتدوير Refresh (SHA‑256) + تخزين في refresh_tokens | database |
| 9 | `packages/security/src/index.ts` | حزمة auth + encryption + s3 باريل | — |
| 10 | `packages/observability/src/trace.ts` | بدء OTel trace + ربط request→job→inference | — |
| 11 | `apps/api/src/app.ts` | middleware موحّد + error handler | observability, security |
| 12 | `apps/api/src/routes/*.ts` (جزء جديد للـ orchestration) | Controllers تستدعي ReadingApplicationContract/Contracts — بلا منطق تعليمي | engines/reading |
| 13 | `engines/reading/src/index.ts` | Facade: analyzeReading/session/report — يغلف pipeline+score+confidence+queue submit | pipeline |
| 14 | `engines/learning-diagnosis/src/index.ts` | Contract التشخيص (يستهلك gap/rule/recommendation) | gap, rule, recommendation |
| 15 | `engines/mastery/src/index.ts` | Contract الإتقان (update/get) | mastery.ts |
| 16 | `apps/worker/src/index.ts` | boot workers + job status + recovery + observability | queue, engines |

> القاعدة: كل ملف «جديد» هو **Facade/Contract فقط** — المنطق موجود ومنقول، لا يُعاد كتابته.

## 7. جدول حل تعارضات التسمية

| الاسم الحالي (engine) | الموحّد في packages/database | القرار المرجعي |
|---|---|---|
| `sessions` | `reading_sessions` | ADR‑008 (العقد §21) |
| `attempts` | `attempts` (تبقى، ملكية reading) | — |
| `users/students/teachers/audit_logs` | دمج مع جداول `lib/db` المطابقة | C‑01 (§4) |
| `mastery_records` | `mastery_records` (ملكية mastery) | D‑02 |
| `gaps` + `remediation_plans` (engine لا يملكهما — يستهلك) | `gaps` + `remediation_plans` من lib/db (ملكية diagnosis/intervention) | D‑02 + C‑04 |
| `reports` | `reports` (ملكية reading) | — |
| `phoneme_stats` | `phoneme_stats` (ملكية reading حصرية) | — |

## 8. خريطة البيئة والإعدادات (Env & Config Map)

| المتغير (الحالي) | الوجهة الموحّدة | المالك |
|---|---|---|
| `DATABASE_URL` | `packages/config` → `packages/database` | database |
| `REDIS_URL` | `packages/config` → `packages/queue` | queue |
| `INFERENCE_GATEWAY_URL` | `packages/config` → `engines/reading` (integration) | reading |
| `JWT_SECRET` + `JWT_EXPIRES_IN=15m` + `REFRESH_TOKEN_BYTES` | `packages/config` → `packages/security` | security |
| `S3_*` (bucket/key/encryption) | `packages/config` → `packages/security` | security |
| `MODEL_*` (whisper/whisperx/mms/camel/silero/deepfilter) | `packages/config` (models.config) | config |

## 9. ترتيب التنفيذ وبوابات المراحل (Execution Order & Gates)

| المرحلة | المحتوى | التحقق (Gate) |
|---|---|---|
| **P0** | التجميد: `git tag pre-merge` + snapshot `BuyTuk-Academy-pre-merge.zip` + ضبط Schema Freeze | snapshot مطابق للجرد |
| **P1** | `packages/contracts` (نقل types + events + barrel) | tsc 0 + لا imports خلفية |
| **P2** | `packages/database` (توحيد schema + client + migration) | tsc 0 + هجرة migration تُبنى + لا جدول مكرر (grep لكل جدول = ورود واحد) |
| **P3** | `packages/{config,queue,security,observability}` | tsc 0 + دورة bullmq→config مكسورة (dependency-cruiser) |
| **P4** | `apps/api` + `apps/worker` bootstrap (نقل http/realtime/workers) | tsc 0 + vitest خضراء + `/health` يعمل على Express 5 |
| **P5** | `engines/reading` (نقل pipeline/report/exercises/inference-client + Facade) | tsc 0 + اختبارات pipeline (gap.test وغيرها) خضراء |
| **P6** | نقل mastery/gap/rule/recommendation لملاكها (engines/mastery + learning-diagnosis) | tsc 0 + لا نسخة متبقية في reading (find يثبت الغياب) |
| **P7** | إزالة الازدواج النهائي: Auth مزدوج → واحد؛ api-server يُدمج في apps/api؛ lib/db يُستبدل بـ packages/database | لا `/auth/login` ثاني، لا جدول مكرر، tsc 0 |
| **P8** | فحص ختامي: `tsc --noEmit` 0 · `vitest` كامل · dependency-cruiser نظيف · grep تكرار = 0 · تحديث COMPLETION_MAP + TRACEABILITY · بناء ZIP موحّد | **استيفاء §12** |

## 10. قائمة تحقق Zero‑Loss (لكل مجموعة — تُوقع قبل/بعد)

قائمة نموذجية لكل مجموعة (مثال مجموعة pipeline):
- [ ] كل ملفات `src/pipeline/*` موجودة في `engines/reading/src/pipeline/` (find يؤكد 1:1)
- [ ] لا ملف `src/pipeline` متبقٍ في المصدر
- [ ] imports الداخلية صححت (المسارات النسبية)
- [ ] لا وظيفة مفقودة: قائمة العقود (analyzeReading, sessions, reports) تُستدعى من apps/api بنجاح
- [ ] اختبارات المجموعة خضراء قبل وبعد النقل
- [ ] لا نسخة مكررة في أي وجهة أخرى

تُنفَّذ نفس القائمة على: types, db, queue, config, security, observability, http/socket, engines, workers.

## 11. استراتيجية التراجع (Rollback)

- كل مرحلة = commit مستقل + tag (`merge-p1` … `merge-p8`).
- التراجع الكلي: `git revert` المرحلة أو استعادة snapshot P0 (التجميد قبل أي نقل).
- لا تُحذف أي نسخة قبل نجاح Gate المرحلة الحالية.
- **فشل Gate مرتين متتاليتين في نفس المرحلة = توقف والرجوع للاعتماد** (لا مواصلة متجاهلة).

## 12. معايير القبول النهائية (DoD للدمج)

| المعيار | القياس |
|---|---|
| 0 تعارض | `tsc --noEmit` = 0 · vitest = خضراء · dependency-cruiser = نظيف |
| 0 تكرار | grep لكل جدول/كيان/route = ورود واحد · find يؤكد غياب النسخ في المصادر القديمة |
| 0 فقدان | قائمة §10 موقعة لكل مجموعة + اختبارات التكامل نفس النتائج قبل/بعد |
| بنية معتمدة | النقل مطابق لخريطة §5 + لا ملف خارج الخطة |
| Auth واحد | نقطة `/auth/login` واحدة · access 15m + rotating refresh |
| DB واحد | packages/database هو المصدر الوحيد · lib/db + schema المحرك ملغيان |
| Queue واحد | packages/queue · 3 قوائم (analyze/analyze-dlq/realtime) · retries + DLQ + idempotency |
| Contracts | كل التفاعل عبر packages/contracts · لا Types مكررة |
| توثيق | COMPLETION_MAP + TRACEABILITY + ADR‑008 محدّثة + ZIP موحّد نهائي |

## 13. خارج النطاق (حتى اعتماد الوثيقتين)

- MOD‑002 (Assessment Engine) — يُفتح بعد اعتماد العقد + هذه الخطة فقط.
- RLS كامل وتفعيل multi-tenancy (يأتي مع هجرة schema نهائية).
- Event Bus فعلي (Contracts فقط الآن).
- Frontend و Expanded Platform (D‑04).

---

### الإقرار
هذه الخطة تنفذ القرارات المعتمدة D‑01..D‑05 + عقد المعمارية AC‑1.0، وتُعدّ **البوابة الوحيدة** لدمج MOD‑001؛ لا يبدأ أي تنفيذ نقل قبل اعتمادها رسميًا.
