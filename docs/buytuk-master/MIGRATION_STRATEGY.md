# MIGRATION_STRATEGY — Buytuk Academy
## استراتيجية الانتقال | من مدرسة واحدة إلى معيار عالمي

---

```
الإصدار : 1.0.0
التاريخ  : 2026-07-18
الغرض   : خارطة طريق تقنية ومؤسسية للانتقال بين مراحل النمو
```

---

## نموذج النمو — 5 مراحل

```
Stage 1: Single School    → مدرسة واحدة، Tenant واحد
Stage 2: Multi-School     → عدة مدارس في نفس المنطقة
Stage 3: Multi-Tenant     → كل مدرسة Tenant مستقل
Stage 4: Regional         → منطقة أو دولة كاملة
Stage 5: National/Global  → معيار قياسي مفتوح
```

---

## الانتقال من Stage 1 → Stage 2
### (مدرسة واحدة → عدة مدارس)

```
التحدي الأساسي: بيانات كل المدارس في نفس الـ Tenant
الحل المؤقت   : تمييز المدارس بـ school_id (بدون multi-tenancy حقيقي)

DB Changes:
  لا تغيير في Schema
  فقط: تأكد أن school_id مُعبَّأ في كل query

Code Changes:
  RBAC Middleware: يتحقق من school_id إضافة لـ tenant_id
  API Routes: إضافة school_id filter في جميع الـ endpoints

الاختبار:
  □ مدير مدرسة A لا يرى بيانات مدرسة B
  □ معلم مدرسة A لا يرى طلاب مدرسة B

تحذير: لا تفتح مدرستين ثانيتين قبل اجتياز هذا الاختبار
```

---

## الانتقال من Stage 2 → Stage 3
### (Multi-Tenant الحقيقي)

> **هذا الانتقال الأصعب — يحتاج تخطيطاً دقيقاً**

```
التحدي الأساسي:
  حالياً: جميع المدارس في DB واحدة بدون عزل حقيقي
  الهدف : كل مدرسة (Tenant) معزولة تماماً = لا يمكن لأحد الوصول لبيانات الآخر

الخيارات التقنية:

Option A — Row-Level Security (RLS) في PostgreSQL
  المزايا  : DB واحدة، أبسط في الإدارة، أرخص
  العيوب   : مخاطر خطأ بشري، أداء أقل مع آلاف الـ Tenants
  القرار   : هذا خيارنا لـ Stage 3 (أفضل للبدء)

Option B — Schema per Tenant
  المزايا  : عزل أقوى، سهل Backup per tenant
  العيوب   : تعقيد إدارة، migrations أصعب
  القرار   : يُعاد النظر في Stage 5

Option C — Database per Tenant
  المزايا  : عزل كامل، compliance سهل
  العيوب   : تكلفة عالية جداً، تعقيد كبير
  القرار   : للـ Enterprise contracts الكبرى فقط
```

### Migration Plan (Stage 3 — RLS)

```
Phase A: التحضير (2 أسابيع)
  □ تأكد من وجود tenant_id في كل جدول (راجع DATABASE_CATALOG.md)
  □ أي جدول بلا tenant_id → أضفه الآن مع default value
  □ اكتب RLS policies لكل جدول

Phase B: التطبيق على Staging
  □ فعّل RLS على Staging DB
  □ شغّل Integration Tests — تأكد من اجتيازها
  □ اختبر يدوياً: Tenant A لا يرى Tenant B
  □ قيّم الأداء: هل هناك تدهور ملحوظ؟

Phase C: التطبيق على Production
  الوقت المناسب: يوم عطلة + نافذة صيانة معلنة
  □ خذ Backup كامل
  □ طبّق RLS Policies
  □ اختبر على Production فوراً
  □ راقب الـ Logs لأول ساعة
  □ Rollback plan: إذا فشل، احذف RLS Policies فوراً

SQL لتفعيل RLS:
```sql
-- مثال لجدول reading_sessions
ALTER TABLE reading_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON reading_sessions
  AS PERMISSIVE FOR ALL
  TO buytuk_user
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- API Server يُضبط هذا المتغير عند كل اتصال:
-- SET app.tenant_id = '<tenant-uuid>';
```

---

## الانتقال من Stage 3 → Stage 4
### (Regional — منطقة جغرافية)

```
التحديات:
  1. Data Residency: بيانات البلد تبقى في البلد
  2. Performance: المستخدمون بعيدون عن الخادم
  3. Currency & Language: تعدد العملات والغات
  4. Compliance: قوانين محلية مختلفة

الحلول:

1. Regional Deployment
   → استضافة في منطقة جغرافية مقربة (AWS/Azure regional zones)
   → DNS Routing يُوجّه كل مستخدم لأقرب خادم

2. Data Residency
   → كل خادم إقليمي له DB منفصلة
   → لا نقل بيانات عبر الحدود (من القانون الدولي)

3. Multi-Currency
   → إضافة currency_code في جدول tenants
   → Pricing يتحول تلقائياً

4. i18n
   → قرار ADR: هل نبني i18n الآن؟ (راجع FUTURE_IDEAS.md FI-T004 بمجرد إضافته)

الجدول: Phase G-0 (السنة 3)
```

---

## الانتقال من Stage 4 → Stage 5
### (National/Global Standard)

```
التحدي الأكبر: BuyTuk تصبح منصة مفتوحة (Platform of Platforms)

المتطلبات التقنية:
  □ Open API للمطورين الخارجيين
  □ Webhook system: أحداث تُرسَل لمنظومات خارجية
  □ SSO Federation: مدارس لديها Identity Providers مختلفة
  □ Data Exchange Standard: GES Protocol (راجع GLOSSARY.md)

المتطلبات المؤسسية:
  □ Developer Portal + Documentation
  □ API Versioning Policy
  □ SLA للـ Partners
  □ Certification Program للمدارس

الجدول: Phase G-1+ (السنة 4-5)
```

---

## قواعد الـ Database Migrations العامة

```
القاعدة الذهبية: كل migration يجب أن يكون backward-compatible
                 يعني: الكود القديم والكود الجديد يعملان في نفس الوقت

إضافة عمود:
  ✅ nullable = true أو has default → آمن
  ✗ NOT NULL بدون default → يكسر الكود القديم

إضافة جدول:
  ✅ دائماً آمن

تعديل اسم عمود:
  خطوة 1: أضف العمود الجديد (nullable)
  خطوة 2: انسخ البيانات القديمة → الجديد
  خطوة 3: حدّث الكود للقراءة من الجديد
  خطوة 4: في Sprint التالي: احذف العمود القديم

حذف جدول:
  خطوة 1: احذف الكود الذي يستخدمه
  خطوة 2: Deploy كود بدون الجدول
  خطوة 3: بعد أسبوع من التأكد: احذف الجدول

لا تفعل الخطوة 3 قبل الخطوة 2 أبداً.
```

---

*"الانتقالات الكبيرة تُبنى بخطوات صغيرة ومختبرة."*
