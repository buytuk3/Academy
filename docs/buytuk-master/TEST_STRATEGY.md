# TEST_STRATEGY — Buytuk Academy
## استراتيجية الاختبار | ما نختبر، متى، ومن المسؤول

---

```
الإصدار : 1.0.0
التاريخ  : 2026-07-18
الغرض   : ليس "كتابة tests" بل "بناء ثقة في كل تغيير"
```

> **"الكود الذي لا يُختبَر كود لا تثق فيه."**

---

## هرم الاختبار

```
         /\
        /E2E\        ← قليل — بطيء — ثمين
       /------\
      /Integra-\     ← متوسط — يختبر الوصلات
     /----------\
    /Unit Tests  \   ← كثير — سريع — أساس البناء
   /--------------\
```

---

## 1. Unit Tests (اختبارات الوحدة)

### المسؤولية
```
Developer — يكتبها بجانب الكود مباشرة
```

### ما يُختبَر
```
✅ كل Calculator بدون استثناء:
   - masteryCalculator.ts
   - readingCalculator.ts (وكل محرك)
   - diagnosticsEngine.ts
   - remediationMatcher.ts
   - impactCalculator.ts

✅ كل دالة حساب بحتة (Pure Function)
✅ التحقق من صحة بيانات (Zod schemas)
✅ حالات الحافة (edge cases): صفر، null، max values
```

### ما لا يُختبَر بـ Unit Test
```
✗ React components (اختبرها بـ E2E)
✗ Database queries (اختبرها بـ Integration)
✗ API endpoints (اختبرها بـ Integration)
```

### مثال
```typescript
// masteryCalculator.test.ts
describe("scoreToPerformanceCategory", () => {
  it("should return 'excellent' for score 95", () => {
    expect(scoreToPerformanceCategory(95)).toBe("excellent");
  });
  it("should return 'critical' for score 0", () => {
    expect(scoreToPerformanceCategory(0)).toBe("critical");
  });
  it("should handle boundary: 90 → excellent", () => {
    expect(scoreToPerformanceCategory(90)).toBe("excellent");
  });
  it("should handle boundary: 89 → good", () => {
    expect(scoreToPerformanceCategory(89)).toBe("good");
  });
});
```

### الأداة
```
Vitest — مُثبَّت مسبقاً في المشروع
الأمر: pnpm --filter @workspace/api-server run test
التغطية المستهدفة: ≥ 80% للـ Calculators والـ Services
```

---

## 2. Integration Tests (اختبارات التكامل)

### المسؤولية
```
Developer — يكتبها عند بناء API endpoint جديد
```

### ما يُختبَر
```
✅ كل API endpoint رئيسي:
   - POST /api/auth/login → يُعيد token صحيح
   - POST /api/reading-sessions → يحفظ في DB
   - GET /api/users/:id/mastery → يُعيد بيانات صحيحة
   
✅ RBAC: teacher لا يصل لبيانات مدرسة أخرى
✅ Validation: بيانات خاطئة تُرفَض بـ 400
✅ Auth: طلب بلا token يُرفَض بـ 401
```

### الأداة
```
Vitest + supertest + test database (PostgreSQL منفصلة للاختبار)

Setup:
- DATABASE_URL_TEST في .env.test
- تُنشأ قاعدة بيانات نظيفة قبل كل مجموعة اختبارات
- تُمسح بعد كل اختبار (transactions rollback)
```

### مثال
```typescript
// reading.routes.test.ts
describe("POST /api/reading-sessions", () => {
  it("should create session and return 201", async () => {
    const { token } = await loginAsTeacher();
    const res = await request(app)
      .post("/api/reading-sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        studentId: testStudent.id,
        standardId: "ENG-R-001",
        comprehensionScore: 80,
        fluencyScore: 75,
        accuracyScore: 85,
      });

    expect(res.status).toBe(201);
    expect(res.body.overallScore).toBe(80); // avg(80,75,85)
    expect(res.body.performanceCategory).toBe("good");
  });

  it("should return 403 if teacher from different school", async () => {
    const { token } = await loginAsTeacher({ schoolId: "other-school" });
    const res = await request(app)
      .post("/api/reading-sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ studentId: testStudent.id, ... });

    expect(res.status).toBe(403);
  });
});
```

---

## 3. E2E Tests (اختبارات شاملة)

### المسؤولية
```
QA Lead أو Senior Developer
يكتبها لكل User Journey رئيسية
```

### الـ 5 رحلات الإلزامية
```
E2E-01: رحلة المعلم الكاملة
  1. تسجيل الدخول
  2. اختيار طالب
  3. تسجيل جلسة قراءة
  4. عرض النتيجة
  5. مراجعة الفجوات

E2E-02: اكتشاف الفجوة وإنشاء علاج
  1. طالب بدرجتين < 60
  2. التحقق من نشأة فجوة تلقائياً
  3. قبول بروتوكول العلاج

E2E-03: رحلة الطالب
  1. تسجيل الدخول كطالب
  2. عرض لوحة الأداء
  3. عرض تفاصيل معيار

E2E-04: رحلة ولي الأمر
  1. تسجيل الدخول
  2. عرض ملخص الأداء بلغة بشرية
  3. عرض الفجوات الحرجة

E2E-05: رحلة مدير المدرسة
  1. عرض لوحة المدرسة الإجمالية
  2. التعمق في صف محدد
  3. تصدير تقرير
```

### الأداة
```
Playwright — الأسرع والأكثر موثوقية لـ E2E

Setup:
- بيئة staging مستقلة
- Seed data ثابت قبل كل Test Suite
- Screenshots عند الفشل

الأمر: pnpm --filter @workspace/school-platform run test:e2e
```

---

## 4. Performance Tests

### المسؤولية
```
DevOps / Senior Developer — قبل كل إصدار رئيسي
```

### ما يُختبَر
```
□ Load test: 100 مستخدم متزامن لمدة 5 دقائق
□ Stress test: نمو تدريجي حتى يبدأ التدهور
□ API endpoints الأكثر استخداماً
□ Queries قاعدة البيانات تحت الضغط

الأداة: k6 أو Artillery
الهدف: p95 < 200ms تحت 100 مستخدم متزامن
```

---

## 5. Security Tests

### المسؤولية
```
Security Reviewer — قبل كل Major Release
```

### ما يُختبَر
```
□ npm audit: لا critical vulnerabilities
□ SQL Injection: محاولات inject في جميع الـ inputs
□ XSS: محاولات inject في الـ text fields
□ IDOR: تجربة الوصول لبيانات tenant آخر
□ Auth bypass: طلبات بدون token أو بـ token منتهٍ
□ Rate limiting: تجاوز الحد المسموح

الأداة: OWASP ZAP (مجاني) + يدوي
الجدول: قبل كل major release + سنوياً
```

---

## CI/CD Pipeline

```
عند كل Pull Request:
  ✅ pnpm run typecheck
  ✅ pnpm audit (no critical vulnerabilities)
  ✅ Unit tests تمر (pnpm test)
  ✅ Integration tests تمر
  → إذا فشل أي خطوة: PR لا يُدمَج

عند كل deployment للـ Staging:
  ✅ كل ما سبق
  ✅ E2E tests الـ 5 الإلزامية تمر
  ✅ Performance: p95 < 200ms
  → إذا فشل: deployment لا يصل للإنتاج

عند deployment للإنتاج:
  ✅ كل ما سبق
  ✅ موافقة يدوية من Tech Lead
  ✅ Rollback plan موثَّق
```

---

## مؤشرات جودة الاختبار

```
Code Coverage:
  Calculators + Pure Functions: ≥ 80%
  API Routes (Integration): ≥ 60%
  UI Components: لا هدف رقمي — Quality over quantity

Test Reliability:
  Flaky tests: 0 مسموح في CI
  (test يفشل أحياناً بدون سبب = يُحذف أو يُصلح فوراً)

Test Speed:
  Unit tests: < 30 ثانية
  Integration tests: < 2 دقائق
  E2E tests: < 10 دقائق
```

---

*"الاختبار ليس مرحلة — هو جزء من التصميم."*
