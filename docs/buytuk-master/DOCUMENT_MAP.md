# DOCUMENT_MAP — Buytuk Academy
## خريطة الوثائق | هيكل المعرفة الكامل في دقيقة واحدة

---

```
الإصدار : 1.0.0
التاريخ  : 2026-07-18
الغرض   : أي شخص يفهم أين يجد ما يحتاجه — بدون بحث
```

---

## الخريطة البصرية

```
START_HERE.md  ← ابدأ هنا دائماً
│
├── 🔴 الفئة A — وثائق دستورية (تتغير نادراً — تقرأ مرة وتُحفظ)
│   ├── VISION.md                    "لماذا وُجد BuyTuk؟"
│   ├── PRODUCT_PRINCIPLES.md        "ما الذي لن نتنازل عنه؟"
│   ├── SYSTEM_BOUNDARIES.md         "ماذا نفعل وماذا لا نفعل؟"
│   ├── GLOSSARY.md                  "ماذا تعني هذه الكلمة بالضبط؟"
│   └── MASTER_ROADMAP.md            "إلى أين نسير وكيف؟"
│
├── 🟡 الفئة B — وثائق هندسية (تتغير مع تطور المشروع)
│   ├── ARCHITECTURE_MAP.md          "كيف تتصل الطبقات؟ — 5 دقائق للفهم"
│   ├── MODULE_REGISTRY.md           "كل Module — حالته ومالكه وتبعياته"
│   ├── DOMAIN_MODEL.md              "ما الكيانات وعلاقاتها؟"
│   ├── DATA_FLOW.md                 "كيف تتحرك البيانات؟"
│   ├── DECISION_LOGIC.md            "لماذا هذا الحساب وليس غيره؟"
│   ├── DECISION_TREE.md             "قبل أي تغيير — أي شجرة أتبع؟"
│   ├── API_CATALOG.md               "جميع الـ Endpoints في جدول واحد"
│   ├── DATABASE_CATALOG.md          "كل جدول وغرضه وعلاقاته"
│   ├── TRACEABILITY_MATRIX.md       "أي كود يُغطي أي متطلب؟"
│   ├── MIGRATION_STRATEGY.md        "كيف ننتقل من مدرسة → وطني → عالمي"
│   └── USER_JOURNEYS.md             "كيف يسير كل مستخدم عبر المنصة؟"
│
├── 🟢 الفئة C — وثائق تشغيلية (تتغير باستمرار)
│   ├── TECH_DEBT_REGISTER.md        "ما المشاكل المعروفة وأولوياتها؟"
│   ├── FUTURE_IDEAS.md              "ما الأفكار المؤجَّلة؟"
│   ├── TEST_STRATEGY.md             "كيف نختبر وما المسؤول؟"
│   ├── QUALITY_ATTRIBUTES.md        "ما معايير الجودة المقيسة؟"
│   ├── SECURITY_MODEL.md            "كيف نحمي بيانات الأطفال والمؤسسات"
│   ├── OBSERVABILITY.md             "كيف نعرف أن النظام يعمل؟"
│   ├── DEPLOYMENT_GUIDE.md          "من الكود إلى الإنتاج — خطوة بخطوة"
│   ├── OPERATIONS_MANUAL.md         "ماذا تفعل في كل موقف بعد الإطلاق"
│   ├── INCIDENT_RESPONSE.md         "عند الكارثة — اتبع الخطوات"
│   ├── SUPPORT_PLAYBOOK.md          "خطوة بخطوة لكل مشكلة دعم"
│   ├── DEPENDENCY_POLICY.md         "قواعد إضافة أي مكتبة"
│   └── PILOT_PLAN.md                "خطة أول مدرسة حقيقية — 12 أسبوعاً"
│
└── 💼 docs/business/ — وثائق الأعمال
    ├── Business_Model.md            "من يدفع لمن مقابل ماذا"
    ├── Pricing_Model.md             "الخطط والأسعار"
    ├── Go_To_Market.md              "0 → 10 → 100 مدرسة"
    ├── Pilot_Strategy.md            "كيف نختار ونُدير ونُحوّل الـ Pilot"
    ├── Customer_Onboarding.md       "رحلة العميل من التوقيع للاستخدام"
    ├── Institution_Onboarding.md    "الإعداد التقني الداخلي لـ Tenant جديد"
    ├── Support_SLA.md               "ما نعد به لكل خطة"
    └── Sales_Playbook.md            "من اللقاء الأول للتوقيع"
```

---

## الفئة A — دستورية ⭐⭐⭐⭐⭐

> تُقرأ مرة واحدة عند البدء. لا تتغير إلا بـ ADR رسمي.

| الوثيقة | تجيب على | متى تقرأها |
|---------|---------|------------|
| `VISION.md` | لماذا وُجد المشروع؟ ما رسالته وقيمه؟ | أول يوم + عند فقدان البوصلة |
| `PRODUCT_PRINCIPLES.md` | ما المبادئ غير القابلة للتفاوض؟ | قبل قرار منتج كبير |
| `SYSTEM_BOUNDARIES.md` | ماذا يفعل BuyTuk وما لا يفعل؟ | عند أي طلب ميزة جديدة |
| `GLOSSARY.md` | ماذا تعني هذه الكلمة بالضبط؟ | عند أي غموض في التعريفات |
| `MASTER_ROADMAP.md` | إلى أين نسير؟ ما الخطوة التالية؟ | أول يوم + مراجعة ربعية |

---

## الفئة B — هندسية ⭐⭐⭐⭐

> تُراجَع عند التعديل. تتغير مع كل Sprint رئيسي.

| الوثيقة | تجيب على | متى تقرأها |
|---------|---------|------------|
| `DOMAIN_MODEL.md` | ما الكيانات وعلاقاتها؟ | قبل إضافة جدول أو كيان جديد |
| `DATA_FLOW.md` | كيف تتحرك البيانات من A إلى B؟ | عند debugging أو تصميم ميزة |
| `DECISION_LOGIC.md` | لماذا هذا الحساب بالذات؟ | قبل تعديل أي خوارزمية |
| `DECISION_TREE.md` | ما الخطوات قبل أي تغيير؟ | قبل كل تعديل في الكود |
| `TRACEABILITY_MATRIX.md` | أي كود يُغطي أي متطلب؟ | عند تغيير متطلب أو bug fix |
| `USER_JOURNEYS.md` | كيف يكمل المستخدم مهمته؟ | عند تصميم أي UI أو API |

---

## الفئة C — تشغيلية ⭐⭐⭐

> تُحدَّث باستمرار. مرجع يومي للفريق.

| الوثيقة | تجيب على | متى تقرأها |
|---------|---------|------------|
| `TECH_DEBT_REGISTER.md` | ما المشاكل المعروفة؟ | قبل Sprint planning |
| `FUTURE_IDEAS.md` | أين أضع الفكرة الجديدة؟ | عند ورود فكرة لا تُنفَّذ الآن |
| `TEST_STRATEGY.md` | ما الذي يجب اختباره؟ | قبل كتابة أي test |
| `QUALITY_ATTRIBUTES.md` | ما المعايير الرقمية للجودة؟ | قبل كل deployment |
| `OBSERVABILITY.md` | كيف أعرف أن النظام بخير؟ | عند أي عطل في الإنتاج |
| `SUPPORT_PLAYBOOK.md` | ماذا أفعل مع هذه المشكلة؟ | عند تذكرة دعم فني |
| `DEPENDENCY_POLICY.md` | هل أضيف هذه المكتبة؟ | قبل `pnpm add` أي شيء |

---

## علاقة هذه الوثائق بالوثائق الموجودة في artifacts/school-platform

```
docs/buytuk-master/  ← المستوى الاستراتيجي (أنت هنا)
    ↕ تُحدِّد الاتجاه والقرارات الكبرى

artifacts/school-platform/  ← المستوى التنفيذي
    ├── HANDOVER.md         ← الحالة الراهنة + Sprint الحالي
    ├── CHANGELOG.md        ← تاريخ الإصدارات
    ├── PROJECT_INDEX.md    ← فهرس الملفات
    └── docs/PROJECT_DECISIONS.md ← قرارات QD-001 → الآن

القاعدة:
- في حالة تعارض: docs/buytuk-master تكسب
- HANDOVER.md هو المرجع اليومي للحالة الراهنة
- MASTER_ROADMAP.md هو المرجع للاتجاه الاستراتيجي
```

---

## خريطة "من يقرأ ماذا"

```
المطور الجديد (أول 3 أيام):
  Day 1: START_HERE → VISION → DOMAIN_MODEL → GLOSSARY
  Day 2: DECISION_LOGIC → DATA_FLOW → TECH_DEBT_REGISTER
  Day 3: DECISION_TREE → HANDOVER (في school-platform) → PROJECT_INDEX

مدير المشروع (أسبوعياً):
  MASTER_ROADMAP → TECH_DEBT_REGISTER → TRACEABILITY_MATRIX

نموذج AI (بداية كل مهمة):
  START_HERE → DOMAIN_MODEL → DECISION_LOGIC
  → SYSTEM_BOUNDARIES → DECISION_TREE → TRACEABILITY_MATRIX

فريق الدعم (عند تذكرة):
  SUPPORT_PLAYBOOK → OBSERVABILITY → GLOSSARY

المستثمر / الشريك (اجتماع):
  VISION → MASTER_ROADMAP (Level 1 Business) → DOMAIN_MODEL
```

---

## ترتيب الأولوية عند التعارض بين الوثائق

```
الفئة A تكسب الفئة B
الفئة B تكسب الفئة C
الجميع يكسب Source Code في حالة التعارض المبدئي

التفصيل:
1. VISION.md                          ← الأعلى
2. PRODUCT_PRINCIPLES.md
3. SYSTEM_BOUNDARIES.md
4. GLOSSARY.md
5. MASTER_ROADMAP.md
6. DOMAIN_MODEL.md + DATA_FLOW.md
7. DECISION_LOGIC.md
8. TRACEABILITY_MATRIX.md
9. HANDOVER.md (في school-platform)
10. Sprint Documents
11. Source Code                        ← الأدنى
```

---

## إحصائيات الوثائق

```
إجمالي الوثائق في docs/buytuk-master/ : 20 وثيقة
الفئة A (دستورية)  : 5 وثائق
الفئة B (هندسية)   : 6 وثائق
الفئة C (تشغيلية)  : 7 وثائق
فهرس + خريطة       : 2 وثائق (START_HERE + DOCUMENT_MAP)

الحجم الإجمالي    : ~200 KB من الوثائق
وقت القراءة الكامل: ~4 ساعات (للمطور الجديد)
وقت القراءة الجوهري: ~45 دقيقة (الفئة A فقط)
```

---

*"خريطة الوثائق هي خريطة العقل الجماعي للفريق."*
