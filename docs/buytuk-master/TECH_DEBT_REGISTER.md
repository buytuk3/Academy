# TECH_DEBT_REGISTER — Buytuk Academy
## سجل الديون التقنية | ما يجب إصلاحه ومتى

---

```
الإصدار : 1.0.0
التاريخ  : 2026-07-18
الغرض   : لا يضيع دين تقني — كل دين مُسجَّل بأولويته وموعد حله
القاعدة : أي دين جديد يُسجَّل هنا قبل أي شيء آخر
```

> **"الدين التقني الذي لا يُسجَّل يتراكم حتى يصبح أزمة."**

---

## تعريف الأولوية

```
CRITICAL : يمنع استخدام المنصة في بيئة حقيقية
HIGH     : يُسبّب مشاكل موثوقية أو أمان خطيرة
MEDIUM   : يُقلل الجودة أو يُصعّب الصيانة
LOW      : تحسين مرغوب لكن غير ضروري الآن
```

---

## الديون الحرجة (CRITICAL)

### TD-001 — localStorage بدلاً من قاعدة البيانات
```
الوصف   : جميع بيانات المحركات تُحفظ في localStorage
الأثر   : بيانات تُفقد عند مسح المتصفح / تغيير الجهاز
          لا مشاركة بيانات بين الأجهزة
          لا يمكن إنشاء تقارير مؤسسية حقيقية
الحل    : Drizzle ORM + PostgreSQL (Replit-managed)
          13 جدول: tenants, users, schools, classes, students,
          reading_sessions, evidence_items, gaps,
          remediation_plans, remediation_activities,
          impact_measurements, audit_logs, refresh_tokens
الحالة  : ✅ RESOLVED — 2026-07-19
          Schema في lib/db/src/schema/ — DB push ناجح
```

### TD-002 — المصادقة غير موصولة بالواجهة
```
الوصف   : لا JWT حقيقي، لا RBAC فعلي
الحل    : JWT (15 دقيقة) + Refresh Token rotation (30 يوم)
          bcrypt لكلمات المرور — SESSION_SECRET للتوقيع
          Routes: POST /api/auth/{register,login,refresh,logout}
                  GET  /api/auth/me
          Middleware: authenticate, authorize(roles)
الحالة  : ✅ RESOLVED — 2026-07-19
          مختبر: register ✓ login ✓ /me ✓ token rotation ✓
```

### TD-003 — لا نشر حقيقي
```
الوصف   : المشروع لم يُنشر على خادم فعلي
الأثر   : لا يمكن اختباره مع مستخدمين حقيقيين
الحل    : Deployment على Replit (راجع DEPLOYMENT_GUIDE.md)
السبرنت : Phase T-0 — الخطوة التالية
الحالة  : ⏳ PENDING — متاح بعد بناء school-platform
```

---

## الديون العالية (HIGH)

### TD-004 — Gemini API يعمل بـ Mock
```
الوصف   : AIProviderService يستخدم MockProviderAdapter في الإنتاج
الأثر   : محركات الذكاء الاصطناعي تُعطي ردوداً وهمية
الملفات : artifacts/api-server/src/lib/ai/AIProviderService.ts
          artifacts/api-server/src/lib/ai/MockProviderAdapter.ts
الحل    : ضبط GEMINI_API_KEY + تفعيل Gemini Adapter الحقيقي
السبرنت : Phase T-1
الحالة  : ⏳ PENDING
```

### TD-005 — لا E2E Tests
```
الوصف   : اختبارات unit فقط — لا integration ولا E2E
الأثر   : أي تغيير قد يكسر User Journeys دون علم
الحل    : Playwright tests لـ 5 User Journeys الأهم:
          1. تسجيل الدخول
          2. تسجيل جلسة قراءة
          3. عرض نتيجة الطالب
          4. اكتشاف فجوة وإنشاء علاج
          5. توليد تقرير
السبرنت : Phase T-1
الحالة  : ⏳ PENDING
```

### TD-006 — لا Monitoring أو Error Tracking
```
الوصف   : لا يوجد نظام لمعرفة وقت حدوث خطأ في الإنتاج
الأثر   : المدارس تعاني من مشاكل بصمت — لن تعرف حتى يشكو أحد
الحل    : Sentry.io + Structured logging + Uptime monitoring
السبرنت : Phase T-1
الحالة  : ⏳ PENDING
```

### TD-007 — Schema بدون Multi-Tenancy
```
الوصف   : لا يوجد tenant_id في جداول قاعدة البيانات
الأثر   : عند إضافة مدرسة ثانية → بياناتها ستختلط مع الأولى
الحل    : Migration شاملة + إضافة tenant_id + Row-Level Security
          يجب التخطيط لهذا قبل إضافة أي مدرسة ثانية
السبرنت : Phase T-2 — لكن يجب التصميم له في Phase T-0
الحالة  : ⏳ PENDING (urgent planning)
```

### TD-008 — لا Rate Limiting
```
الوصف   : API بدون حماية من الطلبات المفرطة
الأثر   : أي مستخدم يمكنه تعطيل الخادم بطلبات كثيفة
الحل    : express-rate-limit + Redis (أو in-memory للبداية)
السبرنت : Phase T-1
الحالة  : ⏳ PENDING
```

---

## الديون المتوسطة (MEDIUM)

### TD-009 — لا Input Validation شاملة
```
الوصف   : بعض API routes لا تُطبّق Zod validation على الـ Input
الأثر   : بيانات غير صحيحة قد تدخل قاعدة البيانات
الحل    : Zod schema لكل POST/PUT endpoint
السبرنت : Phase T-1
الحالة  : ⏳ PENDING
```

### TD-010 — لا Backup تلقائي
```
الوصف   : لا يوجد نظام نسخ احتياطي للقاعدة البيانات
الأثر   : أي عطل في الخادم = فقدان جميع البيانات
الحل    : pg_dump يومي + تخزين في S3 أو مكافئ
السبرنت : Phase T-1
الحالة  : ⏳ PENDING
```

### TD-011 — Console.log في الكود
```
الوصف   : بعض console.log موجودة في كود الإنتاج
الأثر   : معلومات حساسة قد تظهر في logs، أداء أبطأ
الحل    : استبدال بـ logger.info/warn/error الصحيح
السبرنت : Phase T-1
الحالة  : ⏳ PENDING
```

### TD-012 — لا Database Indexes
```
الوصف   : لا يوجد indexes على حقول مهمة (student_id, standard_id, created_at)
الأثر   : استعلامات تصبح بطيئة جداً مع نمو البيانات
الحل    : إضافة indexes على الحقول المُستخدمة في WHERE و JOIN
السبرنت : Phase T-1
الحالة  : ⏳ PENDING
```

### TD-013 — لا API Documentation
```
الوصف   : OpenAPI spec موجود لكن Swagger UI غير مُفعَّل
الأثر   : المطورون الجدد لا يستطيعون استكشاف الـ API بسهولة
الحل    : تفعيل swagger-ui-express على /api/docs
السبرنت : Phase T-1
الحالة  : ⏳ PENDING
```

---

## الديون المنخفضة (LOW)

### TD-014 — Hardcoded Values في الكود
```
الوصف   : بعض العتبات والثوابت hardcoded في الـ Services
الأثر   : تغيير أي عتبة يحتاج تعديل كود
الحل    : نقل إلى standardsConstants.ts + config files
السبرنت : Phase T-2
الحالة  : ⏳ PENDING
```

### TD-015 — لا Error Boundaries في React
```
الوصف   : خطأ في مكوّن واحد قد يُسقط الصفحة كاملة
الأثر   : تجربة مستخدم سيئة عند الأخطاء غير المتوقعة
الحل    : React Error Boundaries على المكوّنات الرئيسية
السبرنت : Phase T-2
الحالة  : ⏳ PENDING
```

---

## إجراءات السجل

```
عند اكتشاف دين جديد:
1. أضف إدخالاً في هذا السجل
2. حدد الأولوية بصدق
3. اذكر الملفات المتأثرة
4. اقترح السبرنت المستهدف

عند حل دين:
1. غيّر الحالة: ⏳ PENDING → ✅ RESOLVED (YYYY-MM-DD)
2. أضف ملاحظة "كيف حُلَّ"
3. لا تحذف الإدخال (السجل التاريخي مهم)

ملاحظة: لا تُعالج MEDIUM قبل CRITICAL
          لا تُعالج LOW قبل HIGH
```

---

*"الدين التقني ليس عاراً — عدم معرفته هو العار."*
