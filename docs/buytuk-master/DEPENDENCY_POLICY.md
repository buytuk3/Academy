# DEPENDENCY_POLICY — Buytuk Academy
## سياسة المكتبات والتبعيات | قواعد إضافة أي حزمة

---

```
الإصدار : 1.0.0
التاريخ  : 2026-07-18
الغرض   : ضمان أن كل مكتبة مُضافة كانت قراراً واعياً لا انتهازاً
```

> **"كل مكتبة تضيفها هي التزام لمدة سنوات."**

---

## معايير قبول أي مكتبة

قبل إضافة أي Package — أجب على هذه الأسئلة:

### 1. الضرورة
```
[ ] هل تحل مشكلة حقيقية تواجهها الآن؟
[ ] هل يمكن تنفيذ الحاجة بكود < 50 سطر بدون مكتبة؟
    → إذا نعم: اكتب الكود، لا تُضف مكتبة
[ ] هل البديل الأفضل لهذه المشكلة؟
```

### 2. الصيانة والجودة
```
[ ] آخر تحديث للمكتبة: < 6 أشهر؟
[ ] عدد النجوم على GitHub: > 1,000؟
[ ] عدد التنزيلات الأسبوعية: > 10,000؟
[ ] هل تمتلك tests موثَّقة؟
[ ] هل هناك maintainer نشط (يُجيب على Issues)؟
```

### 3. الرخصة
```
✅ مقبولة: MIT, Apache 2.0, BSD 2/3-Clause, ISC
⚠️  تحتاج مراجعة: LGPL (للـ Backend قد يكون مشكلة)
✗  مرفوضة: GPL, AGPL, SSPL, Proprietary
    → إذا مرفوضة: توقف فوراً، لا تُضف

تحقق من: https://choosealicense.com/
```

### 4. الأمان
```
[ ] npm audit → لا known vulnerabilities؟
[ ] هل المكتبة في قوائم CVE؟ (راجع snyk.io)
[ ] هل تطلب permissions غير منطقية للحزمة؟
    (مثال: مكتبة utility تطلب network access)
```

### 5. الاستبدالية
```
[ ] إذا تُركت المكتبة بعد سنتين — ما البديل؟
[ ] هل Abstraction layer ممكن لتسهيل الاستبدال؟
[ ] هل هناك lock-in خطير؟
```

---

## تصنيف المكتبات الحالية

### المكتبات الأساسية (Core — لا تُستبدَل بسهولة)
```
Frontend:
- React 18 + Vite
- TypeScript
- Tailwind CSS
- shadcn/ui (مبني على Radix UI)
- React Query (TanStack Query)
- React Router

Backend:
- Express 5
- Drizzle ORM
- Zod
- PostgreSQL (pg)

لا تُستبدَل هذه بدون ADR رسمي + خطة migration كاملة.
```

### مكتبات الأدوات (Utility — قابلة للاستبدال بأقل تأثير)
```
- date-fns (يمكن الاستبدال بـ dayjs)
- lucide-react (يمكن الاستبدال بـ heroicons)
- axios (يمكن الاستبدال بـ fetch مع wrapper)
```

### مكتبات التطوير (Dev — لا تدخل الإنتاج)
```
- Vitest (اختبارات)
- Playwright (E2E tests)
- ESLint + Prettier (جودة الكود)
- orval (codegen)
```

---

## قواعد devDependencies vs dependencies

```
Frontend (React/Vite — يُبنى إلى static files):
→ كل المكتبات في devDependencies (تُجمَّع في bundle)
→ لا dependencies في Frontend

Backend (Express — يُشغَّل في Node.js):
→ runtime imports → dependencies
   مثال: express, drizzle-orm, pg, zod, @google/generative-ai
→ build tools + types → devDependencies
   مثال: typescript, @types/*, esbuild, nodemon

Shared Libraries (lib/*):
→ shared runtimes (react, react-dom) → peerDependencies
→ الأدوات المشتركة → devDependencies
```

---

## قائمة المكتبات المحظورة

```
❌ moment.js      → استخدم date-fns بدلاً منه (حجم أصغر)
❌ lodash كاملة  → استخدم lodash-es مع tree-shaking أو vanilla JS
❌ jQuery         → نحن في عام 2026
❌ class-validator → نستخدم Zod حصراً
❌ passport.js    → نستخدم JWT مباشرة
❌ Sequelize/TypeORM → نستخدم Drizzle ORM حصراً
❌ i18next        → حتى يُقرَّر نهج الـ i18n رسمياً بـ ADR
```

---

## عملية إضافة مكتبة جديدة

```
1. افتح هذا الملف وتحقق من المعايير
2. ابحث في DECISION_TREE.md → شجرة 4
3. إذا مررت كل المعايير:
   a. أضف الحزمة: pnpm add <package> --filter @workspace/<slug>
   b. سجّل في هذا الملف (جدول "المكتبات المضافة" أدناه)
   c. في PR/Commit message: اذكر لماذا أضفتها

4. إذا لم تمر:
   → لا تُضف
   → سجّل في FUTURE_IDEAS.md إذا كانت فكرة مستقبلية
```

---

## سجل المكتبات المضافة

```
| التاريخ    | المكتبة          | الغرض              | من أضافها | ملاحظات        |
|-----------|-----------------|-------------------|-----------|---------------|
| 2026-07-18 | المكتبات الأساسية | التأسيس            | الفريق    | موثَّقة أعلاه  |
|            |                 |                   |           |               |

← أضف هنا كل مكتبة جديدة
```

---

## سياسة التحديث

```
Patch updates (1.0.x → 1.0.y):
  → حدّث فوراً، منخفض الخطر

Minor updates (1.x.0 → 1.y.0):
  → حدّث شهرياً، اقرأ CHANGELOG
  → شغّل pnpm audit بعد التحديث

Major updates (x.0.0 → y.0.0):
  → حدّث ربعياً كحد أقصى
  → اقرأ Migration Guide
  → اختبر E2E بعد التحديث
  → وثّق في ADR إذا كانت هناك تغييرات جوهرية

Abandoned libraries:
  → إذا لم يُحدَّث > 2 سنة → ابحث عن بديل
  → إذا وُجدت vulnerabilities بلا إصلاح → استبدل فوراً
```

---

*"المكتبة التي لا تحتاجها الآن لا تُضفها — ستحتاج لصيانتها دائماً."*
