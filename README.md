# BuyTuk Academy — Complete Runnable Bundle (BuyTuk.V.01.6)

منظومة BuyTuk Academy مجمعة في حزمة واحدة قابلة للتشغيل محليًا، مع واجهة الطالب العربية وواجهات API و worker والوثائق المرجعية وملفات التشغيل الأساسية.

## الإصدار
- **الإصدار الحالي:** `BuyTuk.V.01.6`
- **تاريخ التجميع:** `2026-09-14`
- **الحالة الوظيفية:** Student Learning Loop + Student Web UI + P2 Real LLM + CORE-34A voice intake موجودة، بينما إثبات CORE-34B الكامل ما زال يحتاج بيئة AWS/S3 صالحة.

## المتطلبات
- Node.js 22+
- pnpm 10+
- PostgreSQL
- Redis

## ملفات التشغيل المضمنة
- `VERSION`
- `.env.example`
- `Makefile`
- `scripts/run-api-local.sh`
- `scripts/smoke-local.sh`

## تشغيل سريع
```bash
cp .env.example .env
pnpm install --frozen-lockfile
make api
```

ثم افتح:
- `http://127.0.0.1:4100/`
- `http://127.0.0.1:4100/ui`

## فحص جاهزية سريع
```bash
make smoke
```

## ملاحظات التشغيل
- نقطة `/api/audio/presign` تتطلب إعداد AWS/S3 credentials صحيحة.
- بدون اعتماد AWS/S3 سيعمل مسار الواجهة وsubmit، لكن presigned upload الكامل سيظل محجوبًا.

## هيكل المشروع
- `apps/api` — خدمة API وواجهة الطالب
- `apps/worker` — worker لمعالجة الطوابير
- `packages/*` — العقود، الإعدادات، قاعدة البيانات، الأمان، الطوابير
- `engines/*` — محركات القراءة والإملاء والتقييم
- `docs/*` — الوثائق المرجعية وتقارير الإصدارات
