# EXECUTION-REFERENCE — مصدر التنفيذ الرسمي (How to execute any future phase)

> **Official Reference / Source of Execution:** [`BUY-TUK-ACADEMY-V1.0.0.md`](./BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`EXECUTION-REFERENCE.md`](./EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`DOCUMENT-V1-COMPLIANCE-AUDIT.md`](./DOCUMENT-V1-COMPLIANCE-AUDIT.md)


**الوثيقة المرجعية الأساسية للمشروع:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](./BUY-TUK-ACADEMY-V1.0.0.md)
**الإصدار المرجعي:** v1.0.0 (2026-08-30) — **Baseline غير قابل للتعديل** (مُثبت بالبصمة: SHA-256 `4d43e011b1904337172a871545e4c80f544137727242bb002a0351d7f19e226a` — أي اختلاف مستقبلي يُكشف بـ `sha256sum -c`).

---

## ⚖️ المكانة القانونية للوثيقة

| المرجع | دوره | قابلية التعديل |
|---|---|---|
| `BUY-TUK-ACADEMY-V1.0.0.md` | **المتطلبات والهدف (Requirements / Target)** — Source of Execution | 🔒 **لا يُعدل أبدًا** — Baseline مثبت بالبصمة |
| الكود الحي + `docs/decisions/` (ADRs/ACRs) | **طريقة التنفيذ الفعلية** (Current Architecture) | يتطور بقرارات معتمدة |
| `docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md` | **مطابقة الهدف ↔ التنفيذ** (بندًا بندًا، بالنِسَب) | يُحدَّث بعد كل إغلاق مرحلة |

> **القاعدة الملزمة:** الاختلاف بين الوثيقة والكود لا يُعالَج بتعديل الوثيقة (لا تُلمس أبدًا)، ولا بإعادة بناء معمارية أقدم — بل بتنفيذ الناقص على المعمارية الحالية وتوثيق العلاقة:
> **Original Requirement → Current Implementation → Substitute / Partial / Missing** في تقرير المطابقة.

## 🗺️ خريطة الربط التنفيذي

- **المتطلبات:** `docs/reference/BUY-TUK-ACADEMY-V1.0.0.md` (§3 المعمارية · §4 الهيكل · §5 الميزات · §6 التقنيات · §8 النشر · §9 الأمان · §10 الاختبارات)
- **مطابقة البنود (أين نحن بالضبط):** `docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`
- **القرارات المعمارية:** `docs/decisions/` — ADR-027 (Runtime Integration) · ACR-24/001-002 (المكتبة/الحالات) · ACR-E1-001 (Loop Resume) · ACR-E4-001 (Mastery Write — PENDING) · ACR-E4-002 (حد CORE-05) · ACR-E5-001 (واجهة الطالب العميل الرقيق) · **ACR-E6-001 (P2 Real LLM Path)**
- **خارطة الطريق والتقدم:** الوثيقة المرجعية الموحدة `docs/reports/buytuk-academy-master-document.md` (41 بندًا)
- **سجل الإصدارات:** `CHANGELOG.md` · **هوية النسخة الحالية:** `docs/reference/PROJECT_VERSION.md`
- **تقارير الإغلاق/البوابات (أدلة حية):** `docs/reports/E1..E4-closure-report.md` + `P1-closure-report.md` + `P2-MID-GATE.md` + `P2-GATE-1-REAL-INFERENCE-INSPECTION.md`

## 🧭 بروتوكول تنفيذ أي Feature/مرحلة قادمة (إلزامي)

> **قبل كتابة أي سطر:** راجع الوثيقة المرجعية أولًا → ثم افحص الكود الحالي والـ ADRs والاختبارات → **نفّذ ما ينقص فقط.**

1. **أي متطلب من الوثيقة نعالجه؟** (الرقم/القسم في v1.0.0)
2. **ما الموجود حاليًا؟** (Inspect: ملفات/مسارات/جداول/اختبارات — بفحص كودي فعلي لا بأسماء)
3. **ما الذي سنعيد استخدامه؟** (Reuse — ممنوع نظام ثانٍ لقدرة قائمة)
4. **ما الذي سنكمله؟** (Integrate → Complete — بحدود الملكية والعقود القائمة)
5. **كيف سنثبته؟** (Prove: E2E على PG/Redis/HTTP/متصفح حقيقي + بوابات TSC/Drift/Secret-Scan)
6. **ما الذي بقي بعده؟** (يُحدَّث في تقرير المطابقة وKnown Gaps)

سلسلة التنفيذ لكل بلوك: **Inspect → Implement → Test → Security Gate → E2E → Commit → Tag → Closeout** — ثم اعتماد المالك قبل الدمج في `main`، ونسخة أرشيف عند المحطات الرسمية.

## 📜 النسخ الرسمية (Baselines)

| النسخة | المحتوى | الهوية |
|---|---|---|
| **BuyTuk.V.01.2** | Baseline بعد دمج P1 Student Web UI + تثبيت هذه الوثيقة المرجعية | `docs/reference/PROJECT_VERSION.md` + وسم `buytuk-v01.2` |
| **BuyTuk.V.01.3** | الإصدار التراكمي الكامل: V0.1.2 + الأعمال المعتمدة في P2 Real LLM + حفظ artifacts فحص P2-VOICE داخل نفس المشروع | `docs/reference/PROJECT_VERSION.md` + وسم الإصدار التراكمي الحالي |

## 🚦 حالة المراحل (محدّثة عند BuyTuk.V.01.3)

- ✅ **P0** — Student Learning Loop (CORE-28→31: دورة كاملة عبر HTTP حقيقي)
- ✅ **P1** — Student Web UI (CORE-32: الدورة الكاملة من متصفح حقيقي 5/5)
- ✅ **P2 Real LLM Path** — `LLMProvider → GatewayLLMAdapter → Feedback RPC` (CORE-33)
- ⏸️ **P2-VOICE** — HOLD / Inspection-only: لا تنفيذ جديد قبل اعتماد تقرير الفحص؛ الهدف التالي فقط هو أول شريحة Browser → Upload/Storage → Reading Submit → Analysis Job → Gateway → Real STT → Real STT Result
- بعدها: Dictation Runtime Proof (بمعيار Reading ومن المتصفح) → Teacher Portal → Parent Portal → English/Science → Gamification/Attendance/Notifications → Deployment/CI/Monitoring/Hardening
