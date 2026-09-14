# ARCHITECTURE_MAP — Buytuk Academy
## خريطة المعمارية | فهم النظام كاملاً في 5 دقائق

---

```
الإصدار : 1.0.0
التاريخ  : 2026-07-18
الغرض   : أي مهندس جديد يرى كيف تتصل الطبقات ببعض قبل لمس الكود
```

---

## الخريطة الكاملة — من الواجهة إلى قاعدة البيانات

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER / CLIENT                         │
│                 artifacts/school-platform (React + Vite)        │
│                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────┐ │
│  │ Teacher  │ │ Student  │ │  Parent  │ │Principal │ │Admin │ │
│  │ Portal   │ │ Portal   │ │ Portal   │ │ Portal   │ │Portal│ │
│  │ ~28 tabs │ │ 6 panels │ │ 3 panels │ │ 5 views  │ │4 tabs│ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └──┬───┘ │
│       │             │             │             │           │     │
│       └─────────────┴─────────────┴─────────────┴───────────┘   │
│                              │                                   │
│                    lib/api-client-react                          │
│              (React Query hooks — generated from OpenAPI)        │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTPS / JWT
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API GATEWAY LAYER                          │
│               artifacts/api-server (Express 5 + TypeScript)     │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Middleware Stack                      │   │
│  │   cors → helmet → rate-limit → auth → rbac → logger    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                               │                                 │
│  ┌────────────────────────────▼──────────────────────────────┐  │
│  │                      Route Layer                          │  │
│  │  /api/auth  /api/users  /api/schools  /api/exams         │  │
│  │  /api/reading-sessions   /api/dictation-sessions         │  │
│  │  /api/writing-sessions   /api/pronunciation-sessions     │  │
│  │  /api/fluency-thinking   /api/learning-behavior          │  │
│  │  /api/mastery  /api/diagnostics  /api/remediation        │  │
│  │  /api/impact   /api/ai                                   │  │
│  └─────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    INTELLIGENCE ENGINES                         │
│              (Service + Calculator — طبقة الأعمال)             │
│                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ Reading  │ │Dictation │ │ Writing  │ │  Pronunciation   │  │
│  │ Engine   │ │ Engine   │ │ Engine   │ │     Engine       │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────────┬─────────┘  │
│       │             │             │                │            │
│  ┌────┴─────────────┴─────────────┴────────────────┴──────┐    │
│  │                                                         │    │
│  │  ┌─────────────────────┐  ┌───────────────────────┐   │    │
│  │  │  Fluency & Thinking  │  │   Learning Behavior   │   │    │
│  │  │       Engine        │  │        Engine          │   │    │
│  │  └─────────────────────┘  └───────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────┘   │
│                               │                                 │
│  ┌────────────────────────────▼───────────────────────────────┐ │
│  │               CROSS-ENGINE PIPELINE                        │ │
│  │  Mastery Engine → Diagnostics Engine → Remediation Engine  │ │
│  │          → Impact Engine → Reporting Engine                │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                       AI LAYER (Optional)                       │
│                    @google/generative-ai (Gemini)               │
│                                                                 │
│   AIProviderService → GeminiAdapter (prod) | MockAdapter (dev)  │
│   AIAnalysisService → AIRecommendationService                   │
│   Cache Layer (5 min TTL) → يُقلل التكلفة ويُسرّع الاستجابة   │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DATABASE LAYER                             │
│                 lib/db (Drizzle ORM + PostgreSQL)               │
│                                                                 │
│  Evidence Tables:          Engine Sessions (6 tables)          │
│  Computed Tables:          mastery_records, learning_gaps       │
│  Action Tables:            remediation_assignments              │
│  Measurement Tables:       impact_measurements                  │
│  System Tables:            users, schools, tenants, audit_logs  │
└──────────────────────────────────────────────────────────────────┘
```

---

## تدفق طلب API نموذجي (POST /api/reading-sessions)

```
1. Browser → POST /api/reading-sessions (+ JWT header)
       ↓
2. Middleware: cors → helmet → rate-limit (100/min)
       ↓
3. Middleware: auth (verify JWT → decode userId, tenantId)
       ↓
4. Middleware: rbac (confirm role = teacher | admin)
       ↓
5. Route Handler: reading.routes.ts
   → Validate body with Zod schema
   → Call ReadingService.createSession()
       ↓
6. ReadingService:
   → readingCalculator.computeScore(input)  [sync, pure]
   → db.insert(reading_sessions, result)
   → masteryService.updateMastery(studentId, standardId)
   → diagnosticsEngine.checkForGaps(studentId, standardId)
       ↓
7. DiagnosticsEngine:
   → إذا درجتان متتاليتان < 60 → db.insert(learning_gaps)
   → إذا < 30 → إنشاء فجوة حرجة فورياً
       ↓
8. Response: 201 + { sessionId, overallScore, performanceCategory, gapDetected? }
       ↓
9. AI (اختياري — إذا طلب المعلم):
   → AIAnalysisService.analyze(sessionData)
   → GeminiAdapter.generate(prompt)
   → Cache result (5 min)
```

---

## هيكل المجلدات

```
/ (monorepo root)
├── artifacts/
│   ├── api-server/           ← Express 5 Backend
│   │   └── src/
│   │       ├── routes/       ← Route handlers (thin layer)
│   │       ├── services/     ← Business logic
│   │       ├── middleware/   ← auth, rbac, rate-limit, logger
│   │       └── lib/ai/       ← AI adapters
│   │
│   └── school-platform/      ← React + Vite Frontend
│       └── src/
│           ├── components/   ← Portal + Panel components
│           ├── engines/      ← Calculators (Frontend copy)
│           └── lib/          ← dbService (→ API calls)
│
├── lib/
│   ├── db/                   ← Schema + Drizzle (shared)
│   ├── api-spec/             ← OpenAPI YAML (source of truth)
│   └── api-client-react/     ← Generated hooks (from OpenAPI)
│
└── docs/buytuk-master/       ← أنت هنا
```

---

## قواعد المعمارية (لا تُكسَر)

```
1. الاتجاه واحد: Frontend → API → Service → Calculator → DB
   ← لا استدعاء عكسي في أي اتجاه

2. Calculator معزول تماماً:
   ← لا يستورد من DB أو API أو React

3. OpenAPI هو مصدر الحقيقة الوحيد للـ Contract:
   ← Frontend لا يكتب API calls يدوياً — يستخدم الـ generated hooks

4. Multi-tenant by default:
   ← كل query يحمل tenant_id — الـ RBAC Middleware يُضيفه تلقائياً

5. AI اختياري — النظام يعمل كاملاً بدونه:
   ← MockAdapter = نفس الـ interface بلا شبكة
```

---

*"الخريطة لا تُبدِّل الواقع — لكنها تجعل الواقع مفهوماً."*
