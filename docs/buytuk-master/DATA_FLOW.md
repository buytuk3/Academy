# DATA_FLOW — Buytuk Academy
## تدفق البيانات | كيف تتحرك البيانات عبر المنصة

---

```
الإصدار : 1.0.0
التاريخ  : 2026-07-18
الغرض   : فهم مسار البيانات الكامل من التقييم حتى التقرير
```

---

## التدفق الكامل (Bird's Eye View)

```
المعلم يسجّل جلسة
        ↓
   محرك الذكاء
   (Reading / Dictation / Writing / Pronunciation / Fluency / LearningBehavior)
        ↓
   Evidence Record ← يُحفظ في DB
        ↓
   Mastery Calculation ← يُحسَب تلقائياً
        ↓
   MasteryRecord ← يُحفظ في DB
        ↓
   Diagnostics Engine ← يفحص هل هناك فجوة؟
        ↓
   [إذا نعم] LearningGap ← يُنشأ في DB
        ↓
   Remediation Matching ← يقترح بروتوكول
        ↓
   [معلم يوافق] RemediationAssignment ← يُحفظ في DB
        ↓
   [بعد العلاج] جلسة تقييم جديدة
        ↓
   Impact Measurement ← قبل/بعد
        ↓
   ImpactMeasurement ← يُحفظ في DB
        ↓
   Quality Reports ← للمدير والوزارة
```

---

## تدفق جلسة القراءة (مثال تفصيلي)

```
1. INPUT — المعلم يُدخل:
   ├── student_id
   ├── standard_id (مثال: ENG-R-001)
   ├── comprehension_score: 70
   ├── fluency_score: 65
   └── accuracy_score: 80

2. CALCULATION — المحرك يحسب:
   overallScore = avg(70, 65, 80) = 71.67 → 72

3. STORAGE — يُحفظ في DB:
   ReadingSession {
     id, student_id, standard_id, teacher_id,
     comprehension_score: 70,
     fluency_score: 65,
     accuracy_score: 80,
     overall_score: 72,
     created_at: now()
   }

4. EVIDENCE — يُنشأ تلقائياً:
   Evidence {
     student_id, standard_id,
     raw_score: 72,
     evidence_type: "reading_session",
     engine_payload: { session_id },
     collected_at: now()
   }

5. MASTERY — يُحسَب:
   MasteryRecord {
     student_id, standard_id,
     overall_score: 72,
     performance_category: "average",  ← 60-74
     computed_at: now()
   }

6. DIAGNOSTICS — يفحص:
   هل هذه الجلسة الثانية بدرجة < 60؟
   → لا (72 ≥ 60) → لا تُفتح فجوة

7. NOTIFICATION — يُرسَل:
   المعلم ← نتيجة الجلسة + تقييم الأداء
   الطالب ← ملخص الأداء (عند الطلب)
```

---

## تدفق اكتشاف الفجوة وعلاجها

```
الجلسة الأولى:
   overallScore = 42 → "ضعيف جداً" (< 45)
   ← لأن الدرجة < 30؟ لا → لا فجوة حرجة فورية
   ← لأن الدرجة < 60؟ نعم → يُضاف للمراقبة

الجلسة الثانية (نفس المعيار):
   overallScore = 38 → "ضعيف جداً" (< 45)
   ← جلستان متتاليتان بدرجة < 60؟ نعم

        ↓ يُفتح تلقائياً ↓

   LearningGap {
     student_id, standard_id,
     gap_severity: "critical",   ← avg(42,38)=40 < 45
     status: "active",
     diagnosed_at: now()
   }

        ↓ يُقترح تلقائياً ↓

   RemediationProtocol {
     matched_by: standard_id + "critical"
     activities: ["تدريبات نطق مكثفة", "قراءة موجّهة", "جلسة فردية أسبوعياً"]
     estimated_duration: "4 أسابيع"
   }

        ↓ يعرض على المعلم ↓

   [المعلم يوافق] →
   RemediationAssignment {
     gap_id, student_id, teacher_id,
     protocol_id,
     target_date: now() + 4 weeks,
     status: "in_progress"
   }

        ↓ بعد 4 أسابيع ↓

   الجلسة الثالثة:
   overallScore = 68 → "متوسط"

   ImpactMeasurement {
     before_score: 40,
     after_score: 68,
     delta: 28,
     significance: "significant"   ← delta ≥ 20
   }

        ↓ المعلم يُغلق الفجوة ↓

   LearningGap.status = "resolved"
```

---

## تدفق البيانات في واجهات المستخدم

```
بوابة المعلم:
READ:  MasteryRecord ← آخر إتقان لكل طالب
READ:  LearningGap ← الفجوات النشطة
READ:  RemediationAssignment ← خطط العلاج الجارية
WRITE: *Session (جلسات التقييم)
WRITE: RemediationAssignment.status (تحديث التقدم)

بوابة الطالب:
READ:  MasteryRecord ← إتقانه الشخصي
READ:  RemediationAssignment ← خطته العلاجية
READ:  ImpactMeasurement ← تقدمه
WRITE: لا يكتب (قراءة فقط في معظم الحالات)

بوابة ولي الأمر:
READ:  MasteryRecord ← ملخص مبسّط لأداء ابنه
READ:  LearningGap ← ملخص الفجوات الحرجة فقط
READ:  RemediationAssignment ← هل ابنه يتلقى علاجاً؟
WRITE: لا يكتب

بوابة المدير:
READ:  ImpactMeasurement ← إجمالي على مستوى المدرسة
READ:  MasteryRecord ← توزيع مستويات الأداء
READ:  LearningGap ← نسبة الفجوات لكل صف/معيار
WRITE: لا يكتب على بيانات الطلاب
```

---

## تدفق AI

```
المعلم ← يُرسل نص/صوت/بيانات جلسة
        ↓
API Server ← يستقبل الطلب
        ↓
AIProviderService ← يُعدّ الـ Prompt
        ↓
Cache Check ← هل طُلب هذا تحليل من قبل؟
   ├── نعم → يُعيد من الـ Cache (سريع + مجاني)
   └── لا  ↓
Gemini API ← يستدعي النموذج
        ↓
Response ← يُحلَّل ويُنقَّح
        ↓
Cache ← يُحفظ (TTL: 24 ساعة للتحليلات المتكررة)
        ↓
المعلم ← يتلقى التحليل
```

---

## ضمانات سلامة البيانات

```
IMMUTABILITY: Evidence لا تُعدَّل بعد الحفظ
              → إضافة تصحيح تُنشئ Evidence جديدة بـ correction_ref

AUDIT TRAIL: كل write في DB يُسجَّل في audit_logs
             → من + ماذا + متى + قيمة قبل + قيمة بعد

TENANT ISOLATION: كل query تشمل tenant_id
                  → RLS في PostgreSQL يضمن العزل

BACKUP: نسخة احتياطية يومية كاملة
        → incremental كل ساعة في بيئة الإنتاج
```

---

*"اتبع البيانات — ستجد المشكلة."*
