# DATABASE_CATALOG — Buytuk Academy
## فهرس قاعدة البيانات | كل جدول وسبب وجوده

---

```
الإصدار : 1.0.0
التاريخ  : 2026-07-18
الغرض   : يشرح لماذا يوجد الجدول وكيف يرتبط بالآخرين — ليس Schema فقط
المرجع  : lib/db/src/schema/ (الحقيقة الكاملة)
```

---

## جداول النظام (System Tables)

### tenants
```
الغرض       : يمثل كل مؤسسة تعليمية مستقلة (مدرسة، معهد، جامعة)
المالك      : Platform Team
الحقول المهمة: id, name, slug, plan_id, is_active, created_at
يستخدمه     : جميع الجداول الأخرى (tenant_id FK)
Soft Delete : نعم (is_active = false)
Indexes     : slug (UNIQUE), is_active
ملاحظات     : هذا الجدول هو أساس Multi-Tenancy — لا تُعدِّله بدون ADR
```

### users
```
الغرض       : يحفظ جميع المستخدمين (teachers, students, parents, admins, principals)
المالك      : Auth Team
الحقول المهمة: id, tenant_id, email, password_hash, role, is_active
              first_name, last_name, created_at
الأدوار     : 'teacher' | 'student' | 'parent' | 'principal' | 'admin' | 'superadmin'
يرتبط بـ    : tenants (tenant_id), schools (school_id), classes (class_id)
Soft Delete : نعم (is_active = false)
Indexes     : email+tenant_id (UNIQUE), role, tenant_id
ملاحظات     : password_hash باستخدام bcrypt (cost ≥ 12)
              لا تُخزَّن كلمات المرور بأي شكل آخر
```

### schools
```
الغرض       : يمثل مدرسة واحدة ضمن tenant
المالك      : Platform Team
الحقول المهمة: id, tenant_id, name, region, city, capacity, created_at
يرتبط بـ    : tenants (tenant_id)
يستخدمه     : classes, users
Indexes     : tenant_id, region
```

### classes
```
الغرض       : يمثل فصل دراسي واحد (صف + شعبة + معلم + طلاب)
المالك      : School Team
الحقول المهمة: id, tenant_id, school_id, teacher_id, grade_level, section, academic_year
يرتبط بـ    : schools, users (teacher_id), students_classes (M2M)
Indexes     : teacher_id, school_id, academic_year
```

---

## جداول الأدلة — Evidence Tables (جلسات المحركات)

> كل جدول يُسجَّل فيه ما حدث في الجلسة مع الدرجات الخام.

### reading_sessions
```
الغرض       : يحفظ كل جلسة قراءة مُسجَّلة
الحقول المهمة: id, tenant_id, student_id, teacher_id, standard_id
              comprehension_score, fluency_score, accuracy_score
              overall_score, performance_category
              ai_analysis (nullable JSON), notes, session_date
يرتبط بـ    : users (student_id, teacher_id), standards (standard_id)
Indexes     : student_id+standard_id, session_date, teacher_id
Soft Delete : لا — Evidence لا تُحذَف (أرشيف دائم)
```

### dictation_sessions
```
الغرض       : يحفظ كل جلسة إملاء
الحقول المهمة: id, tenant_id, student_id, teacher_id, standard_id
              spelling_score, listening_score
              overall_score, performance_category, session_date
Indexes     : student_id+standard_id, session_date
```

### writing_sessions
```
الغرض       : يحفظ كل جلسة كتابة
الحقول المهمة: id, tenant_id, student_id, teacher_id, standard_id
              coherence_score, vocabulary_score, grammar_score, mechanics_score
              overall_score, performance_category, session_date
Indexes     : student_id+standard_id, session_date
```

### pronunciation_sessions
```
الغرض       : يحفظ كل جلسة نطق
الحقول المهمة: id, tenant_id, student_id, teacher_id, standard_id
              clarity_score, fluency_score, intonation_score
              overall_score, performance_category, session_date
Indexes     : student_id+standard_id, session_date
```

### fluency_thinking_sessions
```
الغرض       : يحفظ كل جلسة طلاقة وتفكير
الحقول المهمة: id, tenant_id, student_id, teacher_id, standard_id
              expression_score, coherence_score, depth_score
              overall_score, performance_category, session_date
Indexes     : student_id+standard_id, session_date
```

### learning_behavior_sessions
```
الغرض       : يحفظ كل جلسة سلوك تعلم
الحقول المهمة: id, tenant_id, student_id, teacher_id, standard_id
              participation_score, focus_score, consistency_score
              overall_score, performance_category, session_date
Indexes     : student_id+standard_id, session_date
```

---

## جداول محسوبة — Computed Tables

### mastery_records
```
الغرض       : يحفظ مستوى إتقان الطالب لكل معيار — مُحسَّب من الجلسات
المالك      : Mastery Engine (MOD-007)
الحقول المهمة: id, tenant_id, student_id, standard_id, engine_type
              overall_score, performance_category, evidence_count
              computed_at
يرتبط بـ    : users (student_id), standards (standard_id)
Indexes     : student_id+standard_id+engine_type (UNIQUE), computed_at
ملاحظات     : هذا الجدول يُعاد حسابه — ليس أرشيفاً دائماً
              الأرشيف الدائم في جداول الـ Evidence
```

### learning_gaps
```
الغرض       : يحفظ الفجوات التعلمية المكتشفة تلقائياً
المالك      : Diagnostics Engine (MOD-008)
الحقول المهمة: id, tenant_id, student_id, standard_id, engine_type
              severity ('critical' | 'moderate' | 'minor')
              status ('active' | 'in_remediation' | 'resolved')
              detected_at, resolved_at
يرتبط بـ    : users (student_id), mastery_records
Indexes     : student_id+status, severity, detected_at
```

---

## جداول الإجراءات — Action Tables

### remediation_assignments
```
الغرض       : يحفظ خطط العلاج المُسنَدة للطلاب
المالك      : Remediation Engine (MOD-009)
الحقول المهمة: id, tenant_id, student_id, teacher_id, gap_id, protocol_id
              status ('assigned' | 'in_progress' | 'completed' | 'cancelled')
              progress_percent, assigned_at, completed_at, notes
يرتبط بـ    : learning_gaps (gap_id), users (student_id, teacher_id)
Indexes     : student_id+status, teacher_id, gap_id
```

### impact_measurements
```
الغرض       : يحفظ قياس الأثر بعد إتمام خطة العلاج
المالك      : Impact Engine (MOD-010)
الحقول المهمة: id, tenant_id, student_id, gap_id, assignment_id
              score_before, score_after, improvement
              impact_category ('significant' | 'moderate' | 'minimal' | 'negative')
              measured_at
يرتبط بـ    : remediation_assignments, learning_gaps
Indexes     : student_id, teacher_id, measured_at
```

---

## جداول الأمان — Security Tables

### audit_logs
```
الغرض       : يسجل كل عملية حساسة — غير قابل للتعديل أو الحذف
المالك      : Platform Team
الحقول المهمة: id, tenant_id, user_id, action, entity_type, entity_id
              old_value (JSON), new_value (JSON), ip_address, created_at
Indexes     : tenant_id+created_at, user_id, entity_type+entity_id
WRITE ONLY  : لا UPDATE، لا DELETE — INSERT فقط
الاحتفاظ   : 7 سنوات على الأقل
```

### refresh_tokens
```
الغرض       : يحفظ Refresh Tokens النشطة (للتحقق وإمكانية الإلغاء)
المالك      : Auth Team
الحقول المهمة: id, user_id, token_hash, expires_at, revoked_at, created_at
Indexes     : token_hash (UNIQUE), user_id, expires_at
```

---

## قواعد قاعدة البيانات

```
✅ كل جدول له tenant_id — بلا استثناء
✅ كل جدول له created_at (timestamp)
✅ Evidence tables: لا Soft Delete (أرشيف دائم)
✅ Users/Schools: Soft Delete (is_active = false)
✅ Indexes على: tenant_id + كل FK + الحقول المُستخدَمة في WHERE
✗ لا ENUM في PostgreSQL — استخدم TEXT مع CHECK constraint
✗ لا business logic في DB triggers — في الـ Service layer فقط

عند إضافة جدول جديد:
→ راجع DECISION_TREE.md → شجرة 3
→ أضفه في هذا الملف
→ أضف Index مناسباً
→ وثّق في TRACEABILITY_MATRIX.md
```

---

*"الجدول الذي لا يُفهَم غرضه — مصدر أخطاء مستقبلية."*
