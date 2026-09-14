# QUALITY_ATTRIBUTES — Buytuk Academy
## المتطلبات غير الوظيفية | معايير الجودة التي لا تظهر في الشاشات

---

```
الإصدار : 1.0.0
التاريخ  : 2026-07-18
الغرض   : تحديد معايير الجودة قابلة القياس لكل بُعد
القاعدة : أي ميزة جديدة لا تنتهك هذه المعايير
```

---

## 1. الأداء (Performance)

```
API Response Time:
  p50: < 100ms
  p95: < 200ms
  p99: < 500ms
  ما فوق 1000ms: Unacceptable — يجب التحقيق فوراً

Page Load Time (على شبكة 10Mbps):
  First Contentful Paint (FCP): < 1.5 ثانية
  Time to Interactive (TTI): < 3 ثوانٍ
  على شبكة 3G: < 8 ثوانٍ (المدارس كثيراً ما تكون شبكتها بطيئة)

Database Queries:
  أي query: < 50ms
  استعلامات التقارير المعقدة: < 500ms
  ما فوق 1000ms: يتطلب Index أو إعادة هيكلة

AI Response Time (Gemini):
  هدف: < 3 ثوانٍ للتحليل الأولي
  ما فوق 10 ثوانٍ: يجب streaming أو skeleton UI
```

---

## 2. التوافر (Availability)

```
Uptime SLA:
  Development: لا SLA (best effort)
  Production Phase 1: 99% (≈ 87 ساعة توقف/سنة مقبولة)
  Production Phase 2: 99.5% (≈ 44 ساعة/سنة)
  Enterprise Contracts: 99.9% (≈ 9 ساعات/سنة)

Scheduled Maintenance:
  يُجدوَل في ساعات منخفضة الاستخدام (منتصف الليل محلي)
  إشعار مسبق: 48 ساعة على الأقل
  مدة الصيانة: < 2 ساعة

Recovery Metrics:
  RTO (Recovery Time Objective): < 4 ساعات في Phase 1
                                   < 1 ساعة في Phase 2
  RPO (Recovery Point Objective): < 1 ساعة (فقدان بيانات ساعة واحدة كحد أقصى)
```

---

## 3. قابلية التوسع (Scalability)

```
المستخدمون المتزامنون:
  Phase 1: 100 مستخدم متزامن بلا تدهور
  Phase 2: 1,000 مستخدم متزامن
  Phase 3: 10,000 مستخدم متزامن

حجم البيانات:
  الجداول مُختبَرة بـ 1M record بلا تدهور في الأداء
  Indexes تُراجَع عند الوصول لـ 100K record في أي جدول

Tenant Isolation:
  تعطّل tenant واحد لا يؤثر على الآخرين
  Peak load لمدرسة لا تؤثر على مدارس أخرى
```

---

## 4. الأمان (Security)

```
Authentication:
  JWT expiry: 24 ساعة (access) + 7 أيام (refresh)
  Bcrypt cost factor: ≥ 12
  لا كلمات مرور في الـ Logs أبداً

Authorization:
  RBAC صارم — لا يصل مستخدم لبيانات خارج صلاحيته
  Multi-tenant: tenant A لا يرى بيانات tenant B أبداً
  Row-Level Security في PostgreSQL كضمانة إضافية

Input Validation:
  كل input يُتحقق منه في API (Zod)
  SQL Injection: مستحيل مع Drizzle ORM (parameterized queries)
  XSS: Escaping في React + Content-Security-Policy headers

Data Protection:
  HTTPS إلزامي (لا HTTP في الإنتاج)
  PII في logs: ممنوع تماماً
  بيانات الأطفال: تُعامَل كـ Sensitive بكل حالات

Security Audits:
  OWASP Top 10 scan قبل كل إصدار رئيسي
  Dependency audit (npm audit) في CI/CD
  Penetration test سنوي في Phase Enterprise
```

---

## 5. قابلية الصيانة (Maintainability)

```
Code Coverage:
  Unit tests: ≥ 70% للـ Services والـ Calculators
  E2E tests: 5 User Journeys الرئيسية
  لا نستهدف 100% — الهدف coverage ذات قيمة

Code Quality:
  TypeScript strict mode: مُفعَّل دائماً
  ESLint: لا warnings في الإنتاج
  لا any type بدون تبرير مكتوب

Documentation:
  كل محرك جديد → توثيق في DECISION_LOGIC.md
  كل ADR مُرقَّم ومُؤرشَّف
  HANDOVER.md مُحدَّث في كل Sprint

Dependency Management:
  لا مكتبة بدون مراجعة DEPENDENCY_POLICY.md
  Update cycle: شهري للـ patches، ربعي للـ minor
  لا dependencies بـ known vulnerabilities في الإنتاج
```

---

## 6. قابلية الاستخدام (Usability)

```
Learnability:
  معلم جديد يُكمل أول تقييم بدون تدريب: < 10 دقائق
  Onboarding مدرسة جديدة: < 30 دقيقة

Efficiency:
  تسجيل جلسة تقييم كاملة: < 5 دقائق
  إيجاد أداء طالب محدد: < 30 ثانية
  توليد تقرير المدرسة: < 1 دقيقة

Error Recovery:
  رسائل خطأ بالعربية وقابلة للفهم
  كل خطأ يُقترح فيه ماذا يفعل المستخدم
  لا "Internal Server Error" بدون رسالة مفهومة

Accessibility (Phase 2):
  WCAG 2.1 Level AA
  دعم قارئات الشاشة
  تباين ألوان: ≥ 4.5:1
  دعم التنقل بالـ Keyboard
```

---

## 7. التوافق (Compatibility)

```
المتصفحات المدعومة:
  Chrome (آخر إصدارين)
  Firefox (آخر إصدارين)
  Safari (آخر إصدارين)
  Edge (آخر إصدارين)
  Chrome على Android (آخر إصداريين)
  Safari على iOS (آخر إصداريين)

الشاشات المدعومة:
  Desktop: 1280px+
  Tablet: 768px-1279px
  Mobile: 320px-767px (قراءة أساسية، بعض الإدخالات)

الشبكات:
  الحد الأدنى: 3G (1 Mbps)
  الهدف: يعمل بشكل مقبول على 512 Kbps
```

---

## 8. الامتثال (Compliance)

```
حماية البيانات:
  GDPR (للمستخدمين الأوروبيين)
  قوانين حماية بيانات الأطفال المحلية
  حق الحذف (Right to Erasure) مُطبَّق

البيانات المحلية:
  خيار hosting في البلد المستهدف
  عدم نقل بيانات الأطفال خارج النطاق القانوني

Audit:
  كل عملية write مُسجَّلة في audit_logs
  Audit logs غير قابلة للتعديل أو الحذف
  احتفاظ بـ audit logs: 7 سنوات على الأقل
```

---

## قائمة تحقق قبل النشر (Pre-Deployment Checklist)

```
[ ] جميع E2E tests تمر
[ ] npm audit: لا critical vulnerabilities
[ ] API response time < 200ms (p95) تحت load test
[ ] Database backup يعمل ويمكن استعادته
[ ] Error tracking مُفعَّل ومختبَر
[ ] HTTPS مُفعَّل
[ ] Environment variables مُضبوطة ومُتحقَّق منها
[ ] Rollback plan موثَّق ومختبَر
```

---

*"الجودة غير المقيسة وهم — كل معيار هنا له رقم وطريقة قياس."*
