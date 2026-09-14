# PROJECT_VERSION — هوية النسخة الرسمية

> **Official Reference / Source of Execution:** [`BUY-TUK-ACADEMY-V1.0.0.md`](./BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`EXECUTION-REFERENCE.md`](./EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`DOCUMENT-V1-COMPLIANCE-AUDIT.md`](./DOCUMENT-V1-COMPLIANCE-AUDIT.md)

# PROJECT_VERSION = BuyTuk.V.01.6

| البند | القيمة |
|---|---|
| **إصدار المشروع** | **BuyTuk.V.01.6** |
| **تاريخ التجميع** | 2026-09-14 |
| **الفرع المستهدف للإصدار** | `main` |
| **الوثيقة المرجعية** | `docs/reference/BUY-TUK-ACADEMY-V1.0.0.md` (v1.0.0 — 2026-08-30) — بصمة SHA-256: `4d43e011b1904337172a871545e4c80f544137727242bb002a0351d7f19e226a` |
| **قاعدة التنفيذ** | `docs/reference/EXECUTION-REFERENCE.md` |
| **مطابقة الوثيقة** | `docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md` — الحكم ما زال **FUNCTIONALLY PARTIAL** لأن مسار CORE-34B الكامل يتطلب AWS/S3 credentials صالحة لإثبات Browser → Storage → Worker → Gateway → STT |
| **طبيعة النسخة** | **V0.1.6 = تجميع كامل متكامل جاهز للتشغيل محليًا في ملف واحد، مع ترقية الهوية التشغيلية إلى BuyTuk.V.01.6 وإضافة ملفات التشغيل الذاتي** |

## ما أُنجز في BuyTuk.V.01.6
- توحيد الشجرة القابلة للتشغيل في حزمة واحدة self-contained قابلة للفك والتشغيل محليًا.
- إضافة ملفات تشغيل مباشرة: `VERSION`, `.env.example`, `Makefile`, `scripts/run-api-local.sh`, `scripts/smoke-local.sh`.
- الإبقاء على الحالة الوظيفية المؤكدة: P0 + P1 + P2 Real LLM + CORE-34A voice intake.
- الإبقاء على حقيقة أن CORE-34B الكامل ما زال محجوبًا في البيئات التي لا تملك AWS/S3 credentials.

## الحالة الحالية بعد V0.1.6
- ✅ **P0** — Student Learning Loop
- ✅ **P1** — Student Web UI
- ✅ **P2 Real LLM Path** — CORE-33
- ✅ **CORE-34A** — Voice intake + presigned upload wiring + async submit
- 🟡 **CORE-34B** — يحتاج اعتماد S3/AWS صالح لإثبات end-to-end الكامل

## Known Gaps (بعد V0.1.6)
1. إثبات Browser → Storage → Worker → Gateway → STT كاملًا في بيئة تملك AWS/S3 credentials صحيحة
2. Dictation Runtime E2E
3. Teacher/Parent/Admin UI
4. English / Science
5. Gamification / Attendance / Notifications
6. Deployment / CI-CD / Monitoring / Hardening
7. Contract / Load tests
