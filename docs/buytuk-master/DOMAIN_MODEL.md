# DOMAIN_MODEL — Buytuk Academy
## نموذج المجال | خريطة الكيانات والعلاقات

---

```
الإصدار : 1.0.0
التاريخ  : 2026-07-18
الغرض   : أي شخص يدخل المشروع يفهم المجال التعليمي قبل أن يقرأ سطر كود
```

---

## قراءة أولى — الجوهر في جملة واحدة

> **"طالب في صف، يخضع لتقييم بمعيار، فتُجمَّع الأدلة، فيُحسَب الإتقان، فيُشخَّص الضعف، فيُعالَج، فيُقاس الأثر."**

---

## هرم الكيانات (من الأكبر للأصغر)

```
🌍 Country (دولة)
│
└── 🏛️ Region (منطقة / محافظة)
    │
    └── 🏫 School (مدرسة / معهد / جامعة)
        ├── 👤 Admin (مدير النظام)
        ├── 👔 Principal (مدير المدرسة)
        ├── 👨‍🏫 Teacher (معلم)
        │   └── 📚 Class (صف / فصل)
        │       └── 🧑‍🎓 Student (طالب)
        │           └── 👪 Parent (ولي الأمر)
        └── ⚙️ Tenant Settings (إعدادات المستأجر)
```

---

## الكيانات التعليمية (Domain Entities)

```
📐 Standard (معيار)
    ├── id: UUID
    ├── code: "ENG-R-001" (كود المعيار)
    ├── name: "القراءة الجهرية"
    ├── subject: "English" | "Arabic" | ...
    ├── grade_level: "Grade 3"
    ├── description: وصف المعيار
    └── indicators: مؤشرات الأداء الفرعية

📋 Evidence (دليل)
    ├── id: UUID
    ├── student_id → Student
    ├── standard_id → Standard
    ├── teacher_id → Teacher
    ├── collected_at: timestamp
    ├── raw_score: رقم من بيانات المحرك
    ├── evidence_type: "reading_session" | "dictation" | ...
    └── engine_payload: JSONB (تفاصيل المحرك)

🏆 MasteryRecord (سجل الإتقان)
    ├── id: UUID
    ├── student_id → Student
    ├── standard_id → Standard
    ├── computed_at: timestamp
    ├── overall_score: 0-100
    ├── performance_category: "excellent" | "good" | "average" | "weak"
    └── evidence_bundle_ids: Evidence[] المستخدمة في الحساب

🔍 LearningGap (فجوة تعلمية)
    ├── id: UUID
    ├── student_id → Student
    ├── standard_id → Standard
    ├── gap_severity: "critical" | "moderate" | "minor"
    ├── diagnosed_at: timestamp
    ├── root_cause: تحليل السبب
    └── status: "active" | "in_remediation" | "resolved"

💊 RemediationAssignment (خطة العلاج)
    ├── id: UUID
    ├── gap_id → LearningGap
    ├── student_id → Student
    ├── teacher_id → Teacher
    ├── protocol_id → RemediationProtocol
    ├── assigned_at: timestamp
    ├── target_date: موعد المراجعة
    ├── progress: 0-100
    └── status: "assigned" | "in_progress" | "completed"

📈 ImpactMeasurement (قياس الأثر)
    ├── id: UUID
    ├── student_id → Student
    ├── standard_id → Standard
    ├── before_score: الدرجة قبل العلاج
    ├── after_score: الدرجة بعد العلاج
    ├── delta: الفرق
    ├── significance: "significant" | "moderate" | "minimal"
    └── measured_at: timestamp
```

---

## محركات الذكاء الستة (Intelligence Engines)

```
كل محرك يُنتج → Evidence → يُغذّي → MasteryRecord

┌─────────────────────────────────────────────────────────┐
│  Engine          │ المعايير            │ المخرج          │
├─────────────────────────────────────────────────────────┤
│  ReadingEngine   │ comprehension,      │ ReadingSession  │
│                  │ fluency, accuracy   │                 │
├─────────────────────────────────────────────────────────┤
│  DictationEngine │ spelling, listening │ DictationSession│
│                  │ accuracy            │                 │
├─────────────────────────────────────────────────────────┤
│  WritingEngine   │ content, structure  │ WritingSession  │
│                  │ language, mechanics │                 │
├─────────────────────────────────────────────────────────┤
│  Pronunciation   │ clarity, fluency,   │ Pronunciation   │
│  Engine          │ intonation          │ Session         │
├─────────────────────────────────────────────────────────┤
│  FluencyThinking │ expression,         │ FluencyThinking │
│  Engine          │ coherence, depth    │ Session         │
├─────────────────────────────────────────────────────────┤
│  LearningBehavior│ participation,      │ LearningBehavior│
│  Engine          │ focus, consistency  │ Session         │
└─────────────────────────────────────────────────────────┘
```

---

## العلاقات الأساسية (Key Relationships)

```
Student ──── belongs to ──────► Class
Student ──── has many ────────► Evidence
Student ──── has many ────────► MasteryRecord
Student ──── has many ────────► LearningGap
Student ──── has many ────────► RemediationAssignment
Student ──── has one ─────────► Parent (optional)

Teacher ──── belongs to ──────► School
Teacher ──── teaches ─────────► Class (many-to-many)
Teacher ──── creates ─────────► Evidence
Teacher ──── assigns ─────────► RemediationAssignment

Standard ─── defines ─────────► Evidence (ما يُقاس)
Standard ─── produces ────────► MasteryRecord (ما يُسجَّل)
Standard ─── triggers ────────► LearningGap (عند الضعف)

School ────── has many ────────► Class, Teacher, Student
School ────── belongs to ─────► Region
School ────── is a ───────────► Tenant (في نظام Multi-Tenancy)
```

---

## مسار اتجاه التبعية (Dependency Direction)

```
لا يُعكس هذا الاتجاه أبداً:

Country → Region → School → Class → Student
                                        ↓
Standard → Evidence → Mastery → Diagnosis → Remediation → Impact

القاعدة:
- الكيان الأعلى في الهرم لا يعرف تفاصيل الكيان الأسفل
- الكيان الأسفل يشير إلى الأعلى (foreign key)
- المحركات لا تشير لبعضها — كلها تشير لـ Standard و Evidence فقط
```

---

## فهم سريع للمطور الجديد

```
إذا أردت إضافة محرك جديد:
1. يُنتج نوع Session جديد (جدول في DB)
2. يُغذّي Evidence (يشير لـ standard_id + student_id)
3. يُحرِّك MasteryRecord عند الحفظ
4. لا يتحدث مع محركات أخرى مباشرة

إذا أردت إضافة Portal جديد:
1. يقرأ من MasteryRecord, LearningGap, ImpactMeasurement
2. لا يكتب مباشرة في جداول المحركات
3. يستخدم الـ Services المخصصة لكل طبقة
```

---

*"فهم المجال يسبق فهم الكود."*
