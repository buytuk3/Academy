# BuyTuk Academy — حزمة المشروع الكاملة (تصدير 2026-09-14 — **BuyTuk.V.01.6**)

**BuyTuk.V.01.6 = الحزمة الكاملة الجاهزة للتشغيل محليًا في ملف واحد**: تضم المستودع التشغيلي، واجهة الطالب، API، worker، الوثائق المرجعية، وملفات التشغيل السريع (`VERSION`, `.env.example`, `Makefile`, `scripts/run-api-local.sh`, `scripts/smoke-local.sh`).

## هوية الحزمة
- **إصدار المشروع:** **BuyTuk.V.01.6**
- **المرجع الرسمي للإصدار:** `docs/reference/PROJECT_VERSION.md`
- **الوثيقة المرجعية:** `docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`
- **الوضع الوظيفي الحالي:** CORE-34A مثبت داخل المنتج، بينما CORE-34B الكامل يحتاج AWS/S3 credentials صالحة.

## التشغيل
```bash
cp .env.example .env
pnpm install --frozen-lockfile
make build
make api
```

## اختبار الدخان
```bash
make smoke
```

## ما تحتويه الحزمة
- `apps/api`
- `apps/worker`
- `packages/*`
- `engines/*`
- `docs/*`
- `tests/*`
- ملفات التشغيل الجذرية الجديدة

## ملاحظات مهمة
- لا يتم تضمين `node_modules` أو `.git` داخل ملف التسليم النهائي.
- نقطة `/api/audio/presign` لن تنجح دون AWS/S3 credentials صحيحة.
