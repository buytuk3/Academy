# Buytuk Academy — v2.7.1

منصة تعليمية ذكية لتشخيص تعلم الطلاب وعلاج فجواتهم في مهارات اللغة العربية.

## الرؤية

BuyTuk تُحوِّل التقييم من رقم مجرد إلى خط كامل:
**Evidence → Mastery → Diagnosis → Remediation → Impact**

## هيكل المشروع

```
artifacts/
  api-server/         Express 5 + TypeScript — REST API + Auth
  mockup-sandbox/     Vite — بيئة تطوير مكونات الواجهة

lib/
  db/                 Drizzle ORM + PostgreSQL — 13 جدول
  api-zod/            Zod schemas مُولَّدة من OpenAPI spec
  api-client-react/   React Query client مُولَّد
  api-spec/           OpenAPI spec + Orval config

docs/
  buytuk-master/      30 وثيقة هندسية وحوكمة
  business/           9 وثائق أعمال وتجارية
```

## الحالة الراهنة — v2.7.1

| المكوّن | الحالة |
|---------|--------|
| DB Schema (13 جدول) | ✅ مكتمل |
| Auth API (JWT + Refresh) | ✅ مكتمل |
| التوثيق (39 وثيقة) | ✅ مكتمل |
| School Platform (Frontend) | ⏳ قيد البناء |
| Gemini AI (حقيقي) | ⏳ قيد البناء |
| Deploy | ⏳ ينتظر Frontend |

## نقطة البداية

اقرأ `docs/buytuk-master/START_HERE.md` أولاً — يوجّهك لما تحتاجه حسب دورك.

## تشغيل المشروع

```bash
# API Server
pnpm --filter @workspace/api-server run dev

# Push DB Schema
pnpm --filter @workspace/db run push

# Type check
pnpm typecheck
```

## متغيرات البيئة المطلوبة

| المتغير | المصدر | الغرض |
|---------|--------|-------|
| `DATABASE_URL` | Replit-managed (تلقائي) | PostgreSQL connection |
| `PORT` | Replit-managed (تلقائي) | منفذ الخادم |
| `SESSION_SECRET` | Replit Secret | توقيع JWT |

## User Preferences

- الوثائق تُكتب بالعربية مع المصطلحات التقنية بالإنجليزية
- لا تُعدِّل محرك Stable بدون مراجعة DECISION_TREE.md
- لا تُضِف مكتبة بدون مراجعة DEPENDENCY_POLICY.md
- راجع GLOSSARY.md عند أي غموض في المصطلحات
