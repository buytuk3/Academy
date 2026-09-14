# ADR-027/V-3 — Runtime Integration: ربط حلقة التعلم بالـ Runtime

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)


**سجل الاعتماد:** اعتُمد هذا القرار **كما هو** بقرار مدير المشروع («اعتمد ADR-027/V-3 كما هو وصرّح بمرحلة Runtime Integration لتنفيذ نقطتي الاستدعاء بالبوابات المعتمدة») بتاريخ 2026-09-13. النص الكامل أدناه هو النص المعتمد **حرفيًا** — دون إعادة صياغة ودون إضافة قرارات جديدة.

---

**المعرف:** ADR-027/V-3 · **الحالة:** Proposed — بانتظار الاعتماد · **المرجع:** قرارات Batch 1–3، إصلاح R-027-05 (`9b942ae`)، توثيق V-2 (عقد مقاييس numeracy)

## القرار (Decision)
استدعاء `runLearningLoop` يتم **في نفس العملية التي تُكمل كتابة الإثبات الكنوني للنشاط** (نقطة اكتمال الـ Evidence)، بملاكَين حسب التدفق: **Worker** بعد اكتمال pipeline التحليل (تدفق القراءة غير المتزامن عبر طابور `analyze` القائم)، و**API** بعد اكتمال كتابة إثبات التسليم في مسارات submit المتزامنة (numeracy/assessment). الاستدعاء **بلا `teacherDecision`** في التشغيل الأول (توقف قسري عند بوابة المعلم)، ويُستأنف **بعد قرار المعلم** عبر إعادة استدعاء بنفس الأدلة + هوية القرار نفسها.

## البنود التسعة الإلزامية

**1. Trigger:** اكتمال التزام كتابة إثباتات النشاط (بعد `recordEvidence` الناجح في نهاية تدفق المحرك — `numeracy:attempt:{id}` / `reading:analyze:{id}` / نظير assessment). لا استدعاء عند فشل كتابة الإثبات.

**2. Evidence Readiness:** قبل الاستدعاء تُجمع الصفوف عبر القارئ الكنوني `listEvidenceForStudent(tenantId, studentId)` بالنطاقين فقط؛ حدود الكشف `minEvidenceForSignal=2` تظل حَكَمًا، وتوقف الحلقة عند `insufficient-evidence` هو السلوك الآمن المتوقع (ليس خطأ).

**3. Invocation:** `runLearningLoop({tenantId, studentId, rows, emitEvent})` — مزامنة، حتمية (نفس الصفوف + القواعد = نفس النتائج)، بلا LLM، وقرار **مَن يملك الاستدعاء**: عملية الكتابة المذكورة أعلاه؛ وليس للـ API صلاحية استدعاء بمعلمات خارج هذا العقد.

**4. Persistence:** كل مرحلة تلتزم فورًا عبر دوالها القائمة (جداول الحلقة الأربعة بمراجع فقط + إثباتا القرار/النتيجة عبر `recordEvidence` حصريًا)؛ فشل الحلقة لا يُبطل الإثبات الكنوني مطلقًا؛ لا معاملات عابرة للمراحل.

**5. Teacher Gate:** مُفعَّل داخل الحلقة ذاتها — بلا قرار: `stoppedAt="teacher-decision"/"awaiting-teacher-review"` والاقتراح يبقى `PENDING`؛ `REJECTED` يوقف المسار؛ القرار وحده عبر `applyTeacherDecision` (عقد idempotent بمفتاح `teacher:decision:{proposal}:{actor}:{decision}` وآلة حالات `PENDING→نهائي` فقط).

**6. Delivery:** لا تسليم إلا بهوية قرار نهائي + `DeliveryAuthorization` مقيَّدة (`delivery:{proposalId}:{decisionId}`) يتحقق منها `assertDeliveryAuthorized`، والتنفيذ حصريًا عبر Execution Capability (`startAttemptExecution`/`submitAttemptExecution`/`completeAsyncExecution`) — لا مسار جانبي.

**7. دلالة `existed:true`:** بعد إصلاح R-027-05 = **صف مستعاد كاملًا من القاعدة بهويته** (وليس كائن الذاكرة)؛ يستطيع المستدعي تمرير الكائن المرجع للمرحلة التالية مباشرة؛ غياب الصف بعد التصادم = فشل صريح `IDEMPOTENT_ROW_VANISHED`. هذا يُلغي شرط إعادة القراءة الإلزامية على المستدعي (الـ Calling Contract Gap المسجل سابقًا).

**8. حدود الملكية والعزل:** الحلقة قارئ للأدلة وكاتب لجداولها + إثباتي قرار/نتيجة عبر الكاتب الكنوني حصريًا؛ لا محرك يلمس بيانات الحلقة؛ `assertSameTenant` في كل مرحلة؛ `(tenant_id, operation_key)` حكم التفرد في كل الجداول؛ لا مخازن/طوابير/Event Bus جديدة — الأحداث عبر الـ outbox القائم (`publishEvent`).

**9. Failure/Retry Semantics:** أي فشل جزئي ⇒ **إعادة الاستدعاء الرسمي بنفس الأدلة** (+ هوية القرار نفسها على الاستئناف) تلتئم بلا ازدواج — مثبت تجريبيًا (ID-R1a–R4b، RACE-1/2، سباق فائز/خاسر بهويتين كاملتين)؛ فشل نشر الحدث لا يفشل المرحلة (outbox يعيد)؛ توقفات صريحة عبر `stoppedAt/stopReason`؛ وأخطاء الاستئناف صاخبة مصنفة (الفئات الثماني الكنونية).

## البدائل المرفوضة وتبريرها
(أ) **استدعاء مركزي عبر حدث جديد/طابور جديد** — يفتح Event Bus/Service جديدًا بعكس القيود؛ (ب) **استدعاء دوري مجدول (poller)** — تأخير زمن حقيقي وتشغيلات بلا داعٍ؛ (ج) **استدعاء من واجهة الـ teacher-decision مباشرة** — يخلط ملكية القرار (API) مع التنفيذ ويكرر منطق الاستئناف خارج الحلقة.

## نطاق التنفيذ المستقبلي (بعد اعتماد ADR — لا يُنفذ الآن)
نقطتا استدعاء (نهاية pipeline الـ worker لقراءة، نهاية submit المتزامن لـ numeracy/assessment) + تمرير هوية قرار المعلم على الاستئناف — بلا أي تعديل على عقود أو مخطط أو ملكية. **لن يُنفَّذ أي سطر منها قبل تصريح Runtime Integration.**

## الامتثال
لا Schema/Migrations، لا جداول/مخازن/Event Bus، لا تعديل Runtime/decisions/عقود، الحدود الأصلية قائمة، كل بند مذكور مستند إلى كود مُتحقق منه (المسارات والأسطر الموثقة في تقارير Batch 1–3).
