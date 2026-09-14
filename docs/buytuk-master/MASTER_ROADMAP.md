# MASTER ROADMAP — Buytuk Academy
## خارطة الطريق الشاملة | المرجع التنفيذي الأعلى

---

```
الإصدار    : 1.0.0
التاريخ    : 2026-07-18
المرجعية   : أعلى من ROADMAP.md الموجود في كل Artifact
الهدف      : ربط Business + Product + Engineering + Operations + Research
السلطة     : يُحدَّث بـ ADR رسمي فقط
```

> **"ما الخطوة التالية، ولماذا هي التالية؟"**
> هذه الوثيقة تجيب على هذا السؤال دائماً، لكل شخص، في أي وقت.

---

## هيكل الوثيقة

```
MASTER_ROADMAP.md                   ← أنت هنا (البوابة التنفيذية)
│
├── LEVEL 1 — Business Roadmap      ← إلى أين تتجه الشركة؟
├── LEVEL 2 — Product Roadmap       ← كيف يتطور المنتج؟
├── LEVEL 3 — Technical Roadmap     ← كيف يُنفَّذ تقنياً؟
├── LEVEL 4 — Enterprise Roadmap    ← كيف يصبح مؤسسياً؟
└── LEVEL 5 — Global Standard       ← كيف يصبح معياراً عالمياً؟
```

---

---

# LEVEL 1 — BUSINESS ROADMAP
## إلى أين تتجه الشركة؟

---

## استراتيجية السوق

### من العميل الحقيقي؟

```
الأولوية 1: مدارس حكومية في مرحلة الأساس (6-15 سنة)
            → حجم السوق: كبير، الألم: حقيقي، الميزانية: محدودة
            → المدخل: مذكرة تفاهم مع وزارة التربية

الأولوية 2: مدارس خاصة متوسطة وعالية
            → حجم السوق: متوسط، الألم: حقيقي، الميزانية: كافية
            → المدخل: عرض تجريبي + ROI واضح

الأولوية 3: معاهد التدريب وتطوير المعلمين
            → حجم السوق: صغير، لكن high-value
            → المدخل: شراكات مهنية

الأولوية 4: جامعات (تقييم + تشخيص)
            → مرحلة لاحقة، يحتاج تكيّف المحركات
```

### لماذا ستختار المدرسة BuyTuk؟

```
المشكلة الحالية للمدارس:
├── التقييم يُعطى كدرجة — بدون تشخيص سبب الضعف
├── المعلم يحكم بالانطباع لا بالدليل الموضوعي
├── العلاج عشوائي — ليس مبنياً على تشخيص دقيق
├── لا توجد بيانات تراكمية للطالب عبر السنوات
└── مدير المدرسة لا يرى صورة إجمالية قابلة للقياس

ما يقدمه BuyTuk:
├── تحويل التقييم من درجة إلى دليل
├── تشخيص تلقائي مبني على بيانات
├── علاج موجَّه لكل طالب بشكل مستقل
├── تقارير جودة للمدرسة والوزارة
└── تاريخ تعلمي كامل لكل طالب
```

### لماذا ستترك المدرسة النظام الحالي؟

```
الإجابة الصريحة: لن تتركه بسرعة.

الاستراتيجية:
1. لا تطلب من المدرسة "التحول" — اطلب "التجربة"
2. ابدأ بمعلم واحد في فصل واحد
3. أظهر نتيجة واضحة خلال 6 أسابيع
4. دع النتيجة تسوّق نفسها داخل المدرسة
```

---

## نموذج الإيرادات

```
الطبقة 1: Freemium للمدارس الصغيرة
├── حتى 100 طالب: مجاناً
├── الميزة: اكتساب مستخدمين + بيانات
└── التحويل: عندما يريدون تقارير متقدمة

الطبقة 2: اشتراك سنوي للمدارس
├── حتى 500 طالب: $X/سنة
├── حتى 2000 طالب: $Y/سنة
├── أكثر من 2000: Custom Pricing
└── يشمل: التدريب + الدعم الفني + التحديثات

الطبقة 3: عقود مؤسسية (وزارات/شبكات مدارس)
├── Multi-year contracts
├── SLA مضمون
└── Professional Services

الطبقة 4: Research & Certification
├── رسوم الاعتماد الأكاديمي
└── بيانات مجمّعة مُجهَّلة لجهات البحث
```

---

## مراحل النمو التجاري

### Phase B-0: Validation (الآن → 3 أشهر)
```
الهدف: إثبات أن المشروع يعمل مع مستخدمين حقيقيين

المهام:
□ تشغيل المشروع تقنياً (Database + API + Auth + Deployment)
□ اختيار مدرسة Pilot واحدة
□ تدريب 3-5 معلمين
□ 6 أسابيع تشغيل تجريبي

مؤشرات النجاح:
✓ 50+ طالب مُسجَّل
✓ 10+ جلسات تقييم مكتملة
✓ ولي أمر واحد يستخدم البوابة
✓ مدير المدرسة يرى تقريراً واحداً

الخروج: موافقة المدرسة على الاستمرار
```

### Phase B-1: Traction (3 → 12 شهراً)
```
الهدف: 5 مدارس + إيراد حقيقي

المهام:
□ تحويل 2 مدارس Pilot إلى عقد مدفوع
□ إضافة 3 مدارس جديدة
□ بناء فريق دعم فني صغير
□ نموذج اشتراك رسمي

مؤشرات النجاح:
✓ 1000+ طالب نشط
✓ ARR أول (Annual Recurring Revenue)
✓ NPS ≥ 40
✓ Churn rate ≤ 10%

الخروج: مدرسة واحدة على الأقل جاءت بمدرسة أخرى
```

### Phase B-2: Scale (12 → 36 شهراً)
```
الهدف: 50+ مدرسة + اتفاقية مؤسسية

المهام:
□ فريق مبيعات متخصص
□ Partner Program للموزعين الإقليميين
□ عقد مع جهة حكومية (وزارة أو مديرية)
□ نظام onboarding ذاتي

مؤشرات النجاح:
✓ 20,000+ طالب نشط
✓ ARR: $XM
✓ CAC/LTV ratio صحي

الخروج: منتج يبيع نفسه بالإحالات
```

---

---

# LEVEL 2 — PRODUCT ROADMAP
## كيف يتطور المنتج؟

---

## مبادئ تطوير المنتج

```
1. أولوية الألم الحقيقي — لا نبني ما يبدو جميلاً بل ما يحل مشكلة
2. MVP قابل للاستخدام — كل Phase تنتج شيئاً يمكن وضعه في يد مستخدم
3. لا Scope Creep — كل ميزة جديدة تمر بـ SYSTEM_BOUNDARIES.md
4. Data beats opinions — كل قرار منتج مبني على بيانات استخدام
5. قبل إضافة محرك → أسأل: هل يحل مشكلة مُوثَّقة؟
```

---

## Phase P-0: Core Loop (الآن → 3 أشهر)
```
الهدف: أول Loop كامل يعمل بالبيانات الحقيقية

المكونات الضرورية:
□ تسجيل دخول حقيقي (JWT)
□ إنشاء مدرسة / صف / طالب
□ تسجيل جلسة تقييم واحدة (Reading أو Dictation)
□ عرض نتيجة في بوابة الطالب
□ تقرير أساسي في بوابة المعلم

ما يُؤجَّل:
✗ الإشعارات
✗ AI التلقائي
✗ Multi-tenancy متقدم
✗ Analytics معقدة

مؤشرات النجاح:
✓ معلم يستطيع تسجيل تقييم كامل في 5 دقائق
✓ طالب يرى نتيجته فور الانتهاء
✓ ولي الأمر يرى تقدم ابنه
```

### Definition of Success (P-0)
```
لا تُعلن اكتمال هذه المرحلة إلا عند:
[ ] تسجيل الدخول يعمل لجميع الأدوار
[ ] إنشاء مدرسة يعمل
[ ] إنشاء معلم يعمل ويرتبط بالمدرسة
[ ] إنشاء طالب يعمل ويرتبط بصف
[ ] أول تقييم يُحفظ في قاعدة البيانات
[ ] أول تقرير يُولَّد من بيانات حقيقية
[ ] بيانات اليوم موجودة غداً (Persistence حقيقية)
```

---

## Phase P-1: Full Engines (3 → 6 أشهر)
```
الهدف: توصيل المحركات الستة بالـ Backend الحقيقي

المحركات:
□ Reading Engine → API حقيقي
□ Dictation Engine → API حقيقي
□ Writing Engine → API حقيقي
□ Pronunciation Engine → API حقيقي
□ Fluency & Thinking Engine → API حقيقي
□ Learning Behavior Engine → API حقيقي

AI Integration:
□ Gemini API حقيقي (ليس Mock)
□ تحليل AI للقراءة والإملاء
□ Cache ذكي للردود (لتقليل التكلفة)

مؤشرات النجاح:
✓ جميع المحركات تحفظ في DB
✓ AI يُنتج تحليلاً حقيقياً
✓ تقرير Impact يعمل على بيانات حقيقية
```

---

## Phase P-2: Multi-Tenancy (6 → 9 أشهر)
```
الهدف: كل مدرسة بيئة معزولة كاملة

Schema:
□ tenant_id في كل جدول
□ Row-Level Security في PostgreSQL
□ Admin Portal لإدارة المستأجرين

Onboarding:
□ تسجيل ذاتي للمدرسة
□ إعداد أولي موجَّه (Wizard)
□ Import بيانات من ملف Excel

مؤشرات النجاح:
✓ مدرسة A لا ترى بيانات مدرسة B أبداً
✓ مدرسة جديدة تعمل في أقل من 30 دقيقة
✓ 10 مدارس تعمل في نفس الوقت بدون تداخل
```

---

## Phase P-3: Intelligence Layer (9 → 18 شهراً)
```
الهدف: المنصة تتعلم وتتكيف

Workflow Engine:
□ سير العمل قابل للتكوين لكل مؤسسة
□ اعتماد نتائج بخطوات متعددة
□ صلاحيات مرنة قابلة للضبط

Recommendations:
□ AI يوصي بعلاجات مخصصة
□ تنبيه مبكر للطلاب في خطر
□ نمذجة تعلمية تتراكم عبر الزمن

Mobile App:
□ تطبيق iOS/Android
□ يعمل Offline
□ إشعارات فورية

مؤشرات النجاح:
✓ AI يقترح علاجاً دقيقاً بنسبة ≥ 70% موافقة معلم
✓ تطبيق يعمل بدون إنترنت لمدة 48 ساعة
✓ معدل استخدام المعلم: ≥ 4 مرات/أسبوع
```

---

## Phase P-4: Ecosystem (18 → 36 شهراً)
```
الهدف: منصة مفتوحة للتكامل

Public API:
□ REST API موثَّق للمطورين الخارجيين
□ Webhook system
□ SDK (JavaScript + Python)

Integrations:
□ Google Classroom
□ Microsoft Teams for Education
□ أنظمة SIS الرئيسية
□ LMS: Moodle, Canvas

Marketplace:
□ محركات تقييم من جهات خارجية
□ محتوى تعليمي من ناشرين

مؤشرات النجاح:
✓ 3+ تكاملات خارجية تعمل في production
✓ 5+ شركاء خارجيون يستخدمون API
```

---

---

# LEVEL 3 — TECHNICAL ROADMAP
## كيف يُنفَّذ تقنياً؟

---

## الديون التقنية المعروفة (أولوية فورية)

```
TD-001: localStorage → PostgreSQL
    الأثر: HIGH — بيانات تُفقد عند مسح المتصفح
    الحل: توصيل dbService.ts بـ API hooks الحقيقية
    السبرنت المستهدف: Phase T-0

TD-002: Auth غير موصولة بالواجهة
    الأثر: HIGH — لا يمكن تشغيل المنصة مؤسسياً
    الحل: AuthScreen.tsx → POST /api/auth/login + JWT token
    السبرنت المستهدف: Phase T-0

TD-003: Gemini API غير متصل
    الأثر: MEDIUM — المحركات تعمل بـ Mock
    الحل: ضبط GEMINI_API_KEY + AIProviderService فعلي
    السبرنت المستهدف: Phase T-1

TD-004: لا E2E Tests
    الأثر: MEDIUM — أي تغيير قد يكسر Flows موجودة
    الحل: Playwright E2E لأهم 5 User Journeys
    السبرنت المستهدف: Phase T-1

TD-005: Multi-tenancy غير مبني
    الأثر: HIGH (للمستقبل) — Schema الحالي بدون tenant_id
    الحل: Migration شاملة + Row-Level Security
    السبرنت المستهدف: Phase T-2

TD-006: لا Monitoring / Observability
    الأثر: HIGH — لن تعرف وقت الأعطال
    الحل: Structured logging + Metrics + Alerting
    السبرنت المستهدف: Phase T-1
```

---

## Phase T-0: Make It Run (أسبوعان)
```
المتطلبات:
□ DATABASE_URL مُضبوط وقاعدة البيانات تعمل
□ pnpm --filter @workspace/db run push ✓
□ pnpm --filter @workspace/api-server run seed ✓
□ JWT_SECRET + SESSION_SECRET مُضبوطان
□ GEMINI_API_KEY مُضبوط
□ GET /api/health → { status: "ok" }
□ POST /api/auth/login يُعيد token حقيقي
□ الواجهة تتحدث مع API (ليس localStorage)
□ النشر على خادم حقيقي

Exit Criteria:
✓ معلم يسجل دخوله من أي جهاز
✓ يسجل تقييماً
✓ يرى النتيجة
✓ يعود في اليوم التالي ويجد البيانات موجودة
```

---

## Phase T-1: Make It Stable (شهر واحد)
```
Backend:
□ API validation شامل بـ Zod
□ Error handling موحَّد
□ Rate limiting
□ Request logging (كل طلب مُسجَّل)

Database:
□ Indexes على الحقول المُستعملة في الـ Queries
□ Connection pooling
□ Backup يومي تلقائي

Testing:
□ Integration tests للـ Routes الأساسية
□ E2E tests لـ 5 User Journeys الأهم
□ CI/CD Pipeline (GitHub Actions)

Monitoring:
□ Uptime monitoring
□ Error tracking (Sentry أو مكافئ)
□ Performance metrics

Exit Criteria:
✓ MTTR (Mean Time to Recovery) < 1 ساعة
✓ Uptime ≥ 99%
✓ E2E tests تمر في كل deployment
```

---

## Phase T-2: Make It Scale (2-4 أشهر)
```
Multi-Tenancy:
□ tenant_id في جميع الجداول
□ RLS في PostgreSQL
□ Tenant provisioning API

Architecture:
□ Background jobs (Queue) للمهام الثقيلة
□ AI processing غير متزامن
□ File storage للتسجيلات الصوتية (إن وجدت)

Security:
□ OWASP Top 10 Audit
□ Penetration Testing
□ GDPR / data privacy compliance
□ Audit logs كاملة (من فعل ماذا ومتى)

Exit Criteria:
✓ 10 مستأجرين بدون تداخل
✓ أي Tenant يُعطَّل بدون تأثير على الآخرين
✓ Security audit صفر critical findings
```

---

## Phase T-3: Make It Reliable (4-6 أشهر)
```
High Availability:
□ Database replication (primary + replica)
□ Application redundancy (2+ instances)
□ Zero-downtime deployments

Disaster Recovery:
□ RTO (Recovery Time Objective) < 4 ساعات
□ RPO (Recovery Point Objective) < 1 ساعة
□ Automated restore test شهرياً

Performance:
□ API response time < 200ms (p95)
□ Page load < 3 ثوانٍ على شبكة متوسطة
□ Mobile offline capability

Exit Criteria:
✓ Disaster recovery drill ناجح
✓ Performance budget محقق
✓ Load test: 1000 مستخدم متزامن بدون تدهور
```

---

---

# LEVEL 4 — ENTERPRISE ROADMAP
## كيف يصبح المنتج مؤسسياً؟

---

## متطلبات المؤسسات الكبيرة

```
SSO / LDAP:
□ SAML 2.0 / OAuth 2.0
□ Active Directory / LDAP
□ Azure AD / Google Workspace
الجدول: Phase E-1

Audit & Compliance:
□ Audit logs شاملة وغير قابلة للتعديل
□ Data Retention Policies قابلة للتكوين
□ تقارير compliance تلقائية
الجدول: Phase E-1

Data Governance:
□ معرفة مكان كل بيانة (Data Lineage)
□ إمكانية حذف بيانات مستخدم (Right to Erasure)
□ Data Classification (Public/Private/Sensitive)
الجدول: Phase E-2

License Management:
□ نظام تراخيص قابل للتتبع
□ Usage metrics للفوترة
□ Multi-year contract management
الجدول: Phase E-1

SLA Guarantees:
□ Uptime SLA: 99.9%
□ Support Response SLA: < 4 ساعات
□ Contractual penalties
الجدول: Phase E-2
```

---

## Phase E-0: Enterprise Foundations
```
□ Audit log كامل لكل عملية
□ Role-based access control مرن
□ Data export للمؤسسات (CSV/Excel/JSON)
□ رسائل دعم فني داخل المنصة
□ User management dashboard للمؤسسة

Exit Criteria:
✓ كل عملية في النظام مُسجَّلة بـ: من + ماذا + متى + لماذا
✓ مدير المؤسسة يدير المستخدمين بدون تدخل فريق BuyTuk
```

---

## Phase E-1: Enterprise Integration
```
□ SSO (SAML/OAuth)
□ LDAP/Active Directory
□ API للتكامل مع SIS الحالي
□ Webhook notifications
□ Branded portal للمؤسسة (White-label)

Exit Criteria:
✓ مؤسسة تُعيِّن مستخدمين من AD بدون إنشاء حسابات يدوية
✓ نظام SIS خارجي يُزامن البيانات تلقائياً
```

---

## Phase E-2: Enterprise Scale
```
□ Multi-region deployment
□ Dedicated infrastructure (للمؤسسات الكبرى)
□ Compliance reports (ISO, SOC2 ready)
□ Custom SLA contracts
□ Professional Services team

Exit Criteria:
✓ وزارة/جامعة كبيرة تقبل BuyTuk كحل رسمي
✓ Security audit شامل بنتيجة إيجابية
```

---

---

# LEVEL 5 — GLOBAL STANDARD ROADMAP
## كيف يصبح BuyTuk معياراً عالمياً؟

---

> **تحذير:** هذا المستوى لا يبدأ قبل:
> - 10,000+ طالب نشط على المنصة
> - بيانات كافية لإثبات الأثر
> - فريق بحثي متخصص

---

## Phase G-0: Evidence Generation (السنة 2-3)
```
البحث:
□ دراسة أثر أولى: هل تحسّنت النتائج؟
□ شراكة مع جامعة محلية
□ نشر النتائج في مجلة تعليمية محكّمة

التوثيق:
□ GES Protocol v1.0 (وثيقة المعيار المقترح)
□ Validation Studies لكل محرك من المحركات الستة
□ Psychometric validation: Reliability + Validity

Exit Criteria:
✓ ورقة بحثية واحدة على الأقل منشورة
✓ معامل الموثوقية (Cronbach's Alpha) ≥ 0.8 للمحركات
```

---

## Phase G-1: Open Protocol (السنة 3-4)
```
□ GES Protocol v1.0 مفتوح المصدر
□ Public API للمنصات الأخرى
□ SDK لبناء محركات متوافقة
□ برنامج اعتماد رسمي للمدارس
□ Certification Mark (شارة BuyTuk Certified)

Exit Criteria:
✓ منصة خارجية واحدة تتبنى GES Protocol
✓ هيئة تعليمية رسمية تعتمد المعيار
```

---

## Phase G-2: International Expansion (السنة 4-5)
```
□ دعم لغات متعددة في المحركات
□ Curriculum mapping للمناهج الدولية
□ شراكات مع منظمات تعليمية دولية (UNESCO, IBO)
□ Global Advisory Board من خبراء التربية

Exit Criteria:
✓ 3+ دول تستخدم المنصة
✓ اعتماد من منظمة تعليمية دولية
```

---

---

# 📊 نظرة عامة على الجدول الزمني

```
الآن         ┌─────────────────┐
             │ T-0: Make It Run│ أسبوعان
             └────────┬────────┘
                      │
3 أشهر      ┌─────────▼────────┐
             │ B-0 + P-0       │ Core Loop
             │ T-1: Stable     │
             └────────┬────────┘
                      │
6 أشهر      ┌─────────▼────────┐
             │ B-1: Traction   │ 5 مدارس حقيقية
             │ P-1: All Engines│
             │ T-2: Scale      │
             └────────┬────────┘
                      │
12 شهراً    ┌─────────▼────────┐
             │ P-2: Multi-Tenant│
             │ E-0: Enterprise │
             │ T-3: Reliable   │
             └────────┬────────┘
                      │
24 شهراً    ┌─────────▼────────┐
             │ B-2: Scale      │ 50+ مدرسة
             │ P-3: AI Layer   │
             │ E-1: Integration│
             └────────┬────────┘
                      │
36 شهراً    ┌─────────▼────────┐
             │ P-4: Ecosystem  │
             │ G-0: Research   │
             │ E-2: Enterprise │
             └────────┬────────┘
                      │
48 شهراً    ┌─────────▼────────┐
             │ G-1: Protocol   │ بداية المعيار
             └─────────────────┘
```

---

# ⚠️ سجل المخاطر

| # | الخطر | الاحتمال | الأثر | التخفيف |
|---|-------|----------|-------|---------|
| R-01 | المعلمون يرفضون التغيير | عالي | عالٍ | ابدأ بالمتحمسين، أظهر القيمة بسرعة |
| R-02 | الإنترنت ضعيف في المدارس | عالي | عالٍ | Offline-first في Phase P-3 |
| R-03 | قاعدة البيانات تحتاج إعادة تصميم عند Multi-Tenancy | متوسط | عالٍ | تصميم Multi-Tenant من البداية في T-0 |
| R-04 | تكلفة Gemini API تصبح مرتفعة | متوسط | متوسط | Cache ذكي + Batch processing |
| R-05 | منافس يدخل السوق | منخفض | عالٍ | التحرك السريع + network effects |
| R-06 | سياسة الخصوصية لبيانات الأطفال | عالي | كارثي | GDPR compliance من اليوم الأول |
| R-07 | فريق التطوير ينهار مع تغيير الأعضاء | متوسط | عالٍ | هذه الوثائق هي الحل — documentation first |
| R-08 | الوزارة تطلب hosting داخلي | متوسط | متوسط | تصميم On-premise deployment من البداية |

---

# 🔁 بروتوكول تحديث هذه الوثيقة

```
هذه الوثيقة تُحدَّث عند:
- اكتمال أي Phase وتحقيق Exit Criteria
- تغيير جوهري في استراتيجية السوق
- قرار معماري كبير (ADR)
- كل ربع سنة (Quarterly Review)

التحديث يتطلب:
1. موافقة Product Owner
2. تحديث CHANGELOG.md
3. إشعار الفريق بالتغييرات
```

---

*هذه الوثيقة تتحدّث — حدِّثها دائماً، لا تتركها تكذب.*
*آخر تحديث: 2026-07-18 — v1.0.0*
