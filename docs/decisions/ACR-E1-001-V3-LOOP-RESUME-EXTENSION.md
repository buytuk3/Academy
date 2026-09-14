# ACR-E1-001 — V-3 Loop-Resume Extension: Third Invocation Site (Teacher Decision Path)

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)


- **الحالة:** APPROVED (قرار مدير المشروع، E1 — Teacher Runtime API + E2E الدورة التعليمية الكاملة، مع «استئناف داخل مسار القرار HTTP + تمديد ACR-027/V-3»)
- **التاريخ:** 2026-09-13
- **المرجع المثبت:** ADR-027/V-3 (`docs/decisions/ADR-027-V3-RUNTIME-INTEGRATION.md`, SHA256 `23547a6f…fb330`)
- **المرجع المعماري:** `e1-teacher-runtime` من `bd7049768bb5026bf3334a3d41382b2d56118fb9`

## 1. القرار

تمديد ADR-027/V-3 بموقع استدعاء **ثالث** للحلقة التعليمية: **مسار قرار المعلّم عبر HTTP**
(`POST /v1/interventions/{proposalId}/decision` في `apps/api/src/v1/teacher.ts`).

بعد نجاح `applyTeacherDecision` — في كل استدعاء، بما فيه الإعادة المعرِّفة (existed:true) —
يُستأنف الحلقة رسميًا عبر `runLearningLoop({…, teacherDecision})` بالمدخل الرسمي نفسه.

## 2. الدلالة المعمارية (لماذا هذا الامتداد سليم)

- الدورة التعليمية الكاملة عبر HTTP تتطلب أن يكمل القرار ما أوقفه: الحلقة تتوقف عند
  Teacher Decision Gate (PENDING)؛ بعد القرار FINAL يجب أن تعبر الحلقة البوابة عبر
  **المدخل الرسمي نفسه** — لا مسار موازٍ ولا منطق حلقة جديد.
- الاستئناف داخل مسار القرار هو الموضع الطبيعي الوحيد الذي يملك فيه النظام قرارًا
  FINAL صالحًا لتمريره للحلقة (بما فيidot الإعادات: أدلة جديدة قد تكون وصلت بين
  القرار الأول والإعادة — مثل أدلة التدخل بعد التسليم — وتحتاج تقييمًا).

## 3. البوابات المحفوظة حرفيًا (لا تخفيف)

1. **Trigger:** فقط بعد نجاح `applyTeacherDecision` (بنية القرار = دليل رسمي).
2. **Evidence Readiness:** القراءة عبر `listEvidenceForStudent` (القارئ الرسمي).
3. **Invocation:** `runLearningLoop` الرسمي بمدخل `teacherDecision` — لا استدعاء مباشر لمراحل.
4. **Persistence:** عبر مراحل الحلقة المعرّفة (R-027-05) — بلا كتابة مباشرة.
5. **Teacher Gate:** REJECTED يوقف الحلقة عند البوابة (`rejected-by-teacher`)؛ الإعادة
   المعرِّفة تستخدم decisionId نفسه (`teacher:decision:{proposalId}:{actorId}:{action}`)
   فتعيد القدرة existed:true دون انتقال حالة ثانٍ (state machine سليم).
6. **Delivery:** غير متأثر — التسليم يبقى محكومًا بـ `assertDeliveryAuthorized`.
7. **existed:true:** إعادة القرار لا تكرر قرارًا ولا دليلًا ولا حدثًا.
8. **Ownership/Isolation:** الحلقة تقرأ الأدلة وتكتب حالتها بالعزل (tenantId+studentId).
9. **Failure/Retry:** فشل الاستئناف **لا يُفشل القرار** أبدًا (سجل error + استئناف
   معرّف لاحق) — القرار FINAL حقيقة مستقلة عن نجاح الحلقة.

## 4. المواقع المعتمدة النهائية للحلقة (V-3 كما مُددّ)

| # | الموقع | الشرط |
|---|---|---|
| 1 | Worker بعد `processAnalyzeJob` | ADR-027/V-3 الأصلي |
| 2 | Sync API بعد `submitAttemptExecution` | ADR-027/V-3 الأصلي |
| 3 | HTTP بعد `applyTeacherDecision` (نجاح أو existed:true) | **ACR-E1-001 (هذه الوثيقة)** |

## 5. ما لا يغيره هذا القرار

لا Schema/Migrations، لا عقود جديدة، لا كاتب أدلة ثانٍ، لا منطق حلقة بديل،
لا تغيير على R-027-05 أو Teacher Gate أو Delivery. الملف الوحيد المتأثر:
`apps/api/src/v1/teacher.ts` (المحوّل الرفيع).
