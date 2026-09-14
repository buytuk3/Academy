# START HERE — Buytuk Academy
## نقطة البداية | اقرأ هذا الملف أولاً دائماً

---

```
VERSION  : 3.0.0
DATE     : 2026-07-19
PURPOSE  : أي شخص يفتح هذا المشروع يجد طريقه في أقل من 5 دقائق
```

> للخريطة الكاملة للوثائق → **DOCUMENT_MAP.md**
> للمصطلحات → **GLOSSARY.md**

---

## أنت من؟

### 🧑‍💻 مطور جديد يبدأ عمله
```
اقرأ بهذا الترتيب:
1. هذا الملف (2 دقيقة)
2. GLOSSARY.md (10 دقائق) — تعلّم اللغة المشتركة أولاً
3. ARCHITECTURE_MAP.md (5 دقائق) — كيف تتصل الطبقات؟
4. DOMAIN_MODEL.md (5 دقائق) — ما الكيانات الأساسية؟
5. TECH_DEBT_REGISTER.md — ما المشاكل المعروفة؟
6. DECISION_TREE.md — قبل أي تعديل اتبع الشجرة المناسبة
```

### 🤖 نموذج AI يعمل على هذا المشروع
```
اقرأ بهذا الترتيب:
1. هذا الملف
2. GLOSSARY.md — التعريفات الدقيقة (مرجعي عند أي غموض)
3. DOMAIN_MODEL.md — الكيانات والعلاقات
4. DECISION_LOGIC.md — منطق الحساب والقرارات
5. SYSTEM_BOUNDARIES.md — ما يجب وما لا يجب بناؤه
6. DECISION_TREE.md — قبل أي تعديل
7. TRACEABILITY_MATRIX.md — تحقق من تغطية المتطلبات
8. TECH_DEBT_REGISTER.md — المشاكل المعروفة التي لا تُهمَل

قواعد ملزمة للـ AI:
✗ لا تُعدّل محرك Stable بدون ADR
✗ لا تُضف مكتبة بدون DEPENDENCY_POLICY.md
✗ لا تُغيّر خوارزمية حساب بدون DECISION_LOGIC.md
✗ لا تبني خارج SYSTEM_BOUNDARIES.md
✗ لا تستخدم مصطلحاً بمعنى مختلف عن GLOSSARY.md
✅ راجع DATABASE_CATALOG.md قبل أي تغيير في Schema
✅ راجع API_CATALOG.md قبل إضافة أو تغيير Endpoint
```

### 📊 مدير مشروع أو مستثمر
```
1. VISION.md — الرسالة والرؤية
2. MASTER_ROADMAP.md → LEVEL 1 Business
3. docs/business/Business_Model.md — النموذج التجاري
4. docs/business/Go_To_Market.md — كيف نصل للسوق
```

### 🎓 خبير تربوي أو أكاديمي
```
1. VISION.md — المهمة والقيم
2. GLOSSARY.md — كيف نُعرِّف Evidence, Mastery, Diagnosis...
3. DOMAIN_MODEL.md — كيف يُمثَّل التعلم في النظام
4. DECISION_LOGIC.md — كيف تُحسَب الدرجات والتشخيصات
```

### 💼 شريك تجاري أو عميل
```
1. docs/business/Business_Model.md
2. docs/business/Pricing_Model.md
3. docs/business/Pilot_Strategy.md
4. docs/business/Support_SLA.md
```

---

## هيكل الوثائق — أربع فئات

```
🔴 الفئة A — دستورية (تتغير نادراً — تقرأ مرة وتُحفظ)
   START_HERE         ← أنت هنا
   DOCUMENT_MAP       ← خريطة المعرفة الكاملة
   VISION             ← الرسالة والقيم
   PRODUCT_PRINCIPLES ← المبادئ غير القابلة للتفاوض
   SYSTEM_BOUNDARIES  ← نطاق المشروع
   GLOSSARY           ← تعريف واحد لكل مصطلح
   MASTER_ROADMAP     ← خارطة الطريق الشاملة

🟡 الفئة B — هندسية (تتغير مع تطور المشروع)
   ARCHITECTURE_MAP   ← كيف تتصل الطبقات — ابدأ هنا للكود
   MODULE_REGISTRY    ← كل Module وحالته ومالكه
   API_CATALOG        ← جميع الـ Endpoints
   DATABASE_CATALOG   ← كل جدول وغرضه
   DOMAIN_MODEL       ← الكيانات وعلاقاتها
   DATA_FLOW          ← كيف تتحرك البيانات
   DECISION_LOGIC     ← منطق الحسابات والقرارات
   DECISION_TREE      ← قبل أي تغيير — أي شجرة أتبع؟
   USER_JOURNEYS      ← رحلة كل مستخدم
   TRACEABILITY_MATRIX← ربط المتطلبات بالكود
   MIGRATION_STRATEGY ← من مدرسة واحدة إلى وطني

🟢 الفئة C — تشغيلية (تتحدث باستمرار)
   TECH_DEBT_REGISTER ← الديون التقنية وأولوياتها
   FUTURE_IDEAS       ← بنك الأفكار المؤجَّلة
   TEST_STRATEGY      ← استراتيجية الاختبار
   QUALITY_ATTRIBUTES ← معايير الجودة المقيسة
   SECURITY_MODEL     ← حماية البيانات والمصادقة
   OBSERVABILITY      ← مراقبة النظام وصحته
   DEPLOYMENT_GUIDE   ← من الكود إلى الإنتاج
   OPERATIONS_MANUAL  ← ماذا تفعل في كل موقف
   INCIDENT_RESPONSE  ← عند الكارثة — اتبع الخطوات
   SUPPORT_PLAYBOOK   ← دليل الدعم الفني
   DEPENDENCY_POLICY  ← قواعد إضافة المكتبات
   PILOT_PLAN         ← خطة أول مدرسة حقيقية

💼 docs/business/ — وثائق الأعمال (منفصلة)
   Business_Model     ← من يدفع لمن مقابل ماذا
   Pricing_Model      ← الخطط والأسعار
   Go_To_Market       ← 0 → 10 → 100 مدرسة
   Pilot_Strategy     ← كيف نختار ونُدير ونُحوّل Pilot
   Customer_Onboarding← رحلة العميل من التوقيع للاستخدام
   Institution_Onboarding ← الإعداد التقني الداخلي
   Support_SLA        ← ما نعد به لكل خطة
   Sales_Playbook     ← من اللقاء الأول للتوقيع
```

---

## الحالة الراهنة للمشروع

```
📅 التاريخ: 2026-07-19
📦 الإصدار: v2.6.1 → Phase T-0 In Progress

✅ مكتمل — التوثيق:
   - 30 وثيقة هندسية في docs/buytuk-master/
   - 9 وثائق أعمال في docs/business/
   - إجمالي: 39 وثيقة، ~384KB من المعرفة المُبنيكَلة

✅ مكتمل — TD-001 (Database):
   - Drizzle Schema كامل: 13 جدول (tenants, users, schools,
     classes, students, reading_sessions, evidence_items, gaps,
     remediation_plans, remediation_activities,
     impact_measurements, audit_logs, refresh_tokens)
   - قاعدة البيانات موصولة عبر DATABASE_URL (Replit-managed)

✅ مكتمل — TD-002 (Auth):
   - JWT Access Token (15 دقيقة) + Refresh Token (30 يوم)
   - bcrypt لتخزين كلمات المرور
   - Routes: /auth/register, /auth/login, /auth/refresh,
             /auth/logout, /auth/me
   - Middleware: authenticate, authorize(roles)

⏳ التالي:
   → push الـ Schema للـ DB (drizzle-kit push)
   → TD-003: بناء Frontend (school-platform)
   → TD-004: توصيل Gemini API الحقيقي
   → Pilot مع أول مدرسة
```

---

## السلطة الهرمية (عند أي تعارض)

```
1. VISION.md                    ← الأعلى سلطة
2. PRODUCT_PRINCIPLES.md
3. SYSTEM_BOUNDARIES.md
4. GLOSSARY.md                  ← التعريفات ملزمة للجميع
5. MASTER_ROADMAP.md
6. DECISION_LOGIC.md
7. DECISION_TREE.md
8. TRACEABILITY_MATRIX.md
9. API_CATALOG.md / DATABASE_CATALOG.md
10. Source Code                 ← الأدنى سلطة
```

---

*"نظام لا يمكن فهمه لا يمكن تطويره."*
