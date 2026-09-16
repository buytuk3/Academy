# ADR-030 — PHASE-5: نطاق إثبات البنية المشتركة (gateway smoke = transport-level stub) وعقود التخزين

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md) (**دون تعديل**)
> **Execution Protocol:** [`docs/reference/MANDATORY_EXECUTION_PROTOCOL.md`](../reference/MANDATORY_EXECUTION_PROTOCOL.md)
> **Binding contract:** [`docs/decisions/ARCHITECTURE_CONTRACT.md`](ARCHITECTURE_CONTRACT.md) (AC-1.0) · [`docs/decisions/ADR-028-REFERENCE-ARCHIVE-AND-VERSION-GOVERNANCE.md`](ADR-028-REFERENCE-ARCHIVE-AND-VERSION-GOVERNANCE.md)

**التاريخ:** 2026-09-16 · **المرحلة:** PHASE-5 — SHARED-INFRA-AND-INFERENCE · **الحالة:** معتمد تنفيذيًا
**بوابة MASTER_ROADMAP (حرفيًا):** «gateway smoke / observability / storage contracts green» · **Traceability:** AI-001 (PARTIAL)

## السياق
بوابة الاستدلال الحقيقية (engines/reading-engine/inference-gateway: gateway.py + 4 workers + Dockerfile CUDA 12.4 + Whisper/WhisperX) تتطلب عتاد GPU/CUDA لا تتوفره بيئة التنفيذ والاختبار. العقد المعماري (AC-1.0 المبدأ 9: Model Independence عبر Inference Gateway فقط) يفصل العميل gRPC القانوني (`inference-client.ts` — callInferenceGateway/healthCheck مع ACR-E6-001 deadline + tenant metadata) عن نموذج الاستدلال نفسه.

## القرارات

### 1. Gateway smoke = إثبات على مستوى النقل (transport-level) بعقد حقيقي
الإثبات داخل بيئة التنفيذ يكون بتشغيل **خادم gRPC حقيقي داخل عملية الاختبار** يخدم **نفس ملف العقد القانوني** (`inference-gateway/proto/inference.proto` — 6 RPCs) ثم تمرير العميل القانوني عليه: `Health`/`Feedback` (نجاح)، **التقاط metadata** (`authorization: Bearer`، `x-correlation-id`، `x-tenant-id` عند تمرير options.tenantId — خيط العزل من PHASE-2)، و**فرض المهلة** (deadline → DEADLINE_EXCEEDED — ACR-E6-001). هذا يثبت عقد النقل الكامل بدون CUDA. **تأجيل موثق:** إثبات runtime الكامل (Whisper/alignment/G2P على GPU) يبقى في بوابة النشر/PHASE-12 (DEP-001) عبر `inference-gateway/Dockerfile` — لا داعي لإعادة بناء مكونات تعمل موثقة في سجلات P2.

### 2. عقود observability — اختبارات وحدات على الحزمة القانونية
`packages/observability` (مالك وحيد: logger/metrics/correlation/trace/errors/redact/security) تُثبت بعقودها: إزالة الأسرار قبل أي سطر سجل، سلسلة السياق عبر AsyncLocalStorage، تصنيف الأخطاء الثمانية، سجل Prometheus القانوني، تسجيل أحداث الأمان.

### 3. عقود التخزين — أوضاع S3 startup القانونية
عميل S3 (`s3-client.ts`) يُثبت بعقده: **بدون بيانات اعتماد → ready=false + assertS3Ready يرمي** (fail-closed)، و**fallback نقطة نهاية محلية → ready=true** (نفس آلية PHASE-1 المعتمدة للتشغيل AWS/local)، و**presign** يولّد روابط موقعة v4 تحتوي المفتاح/الحاوية/نقطة النهاية — كل ذلك بلا شبكة (التوقيع محلي).

### 4. لا تبعيات جديدة
`@grpc/grpc-js` + `@grpc/proto-loader` تبعيتان قائمتان في `engines/reading-engine` (مثبت في package.json) وتُستخدمان لبناء الخادم الوهمي من نفس العقد — لا حزم جديدة، لا إعادة كتابة، لا تغييرات على مكونات P2.

## الحدود
مجمّد: V1، `_history/`، الوسم `BuyTuk.V0.1.3`، `v1.yaml`، migrations، منطق auth/RBAC/tenant/RLS، عقد بوابة الاستدلال نفسه (proto/clients/workers — الاستهلاك لا الإنشاء). أي تحسين خارج بوابة PHASE-5 → DEFER/LOG.
