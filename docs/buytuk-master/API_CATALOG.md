# API_CATALOG — Buytuk Academy
## فهرس الـ API | مرجع سريع لكل Endpoint

---

```
الإصدار : 1.0.0
التاريخ  : 2026-07-18
الغرض   : بدلاً من فتح OpenAPI كاملاً — جدول سريع لكل endpoint
المرجع  : lib/api-spec/openapi.yaml (الحقيقة الكاملة)
```

---

## المصادقة (Authentication)

| Method | Path | الغرض | الصلاحيات | Request Body | Response | Module |
|--------|------|--------|-----------|-------------|---------|--------|
| POST | /api/auth/login | تسجيل دخول | Public | `{email, password}` | `{token, refreshToken, user}` | MOD-012 |
| POST | /api/auth/refresh | تجديد Token | Public (refreshToken) | `{refreshToken}` | `{token}` | MOD-012 |
| POST | /api/auth/logout | تسجيل خروج | Any Auth | — | `{success}` | MOD-012 |
| GET | /api/auth/me | بيانات المستخدم الحالي | Any Auth | — | `{user}` | MOD-012 |

---

## المستخدمون والمدارس (Users & Schools)

| Method | Path | الغرض | الصلاحيات | Notes | Module |
|--------|------|--------|-----------|-------|--------|
| GET | /api/users | قائمة مستخدمي التينانت | Admin | مع Pagination | MOD-012 |
| POST | /api/users | إنشاء مستخدم جديد | Admin | دور محدد | MOD-012 |
| GET | /api/users/:id | بيانات مستخدم | Admin \| Self | RBAC | MOD-012 |
| PATCH | /api/users/:id | تعديل مستخدم | Admin | — | MOD-012 |
| DELETE | /api/users/:id | حذف مستخدم | Admin | Soft delete | MOD-012 |
| GET | /api/schools | قائمة المدارس | Admin | Tenant-scoped | MOD-013 |
| POST | /api/schools | إنشاء مدرسة | SuperAdmin | — | MOD-013 |
| GET | /api/schools/:id | بيانات مدرسة | Admin \| Principal | — | MOD-013 |

---

## محرك القراءة (Reading Engine)

| Method | Path | الغرض | الصلاحيات | Request Body | Module |
|--------|------|--------|-----------|-------------|--------|
| POST | /api/reading-sessions | تسجيل جلسة | Teacher \| Admin | `{studentId, standardId, comprehensionScore, fluencyScore, accuracyScore, notes?}` | MOD-001 |
| GET | /api/reading-sessions/student/:id | جلسات طالب | Teacher \| Student(self) \| Parent | Pagination | MOD-001 |
| GET | /api/reading-sessions/:id | جلسة واحدة | Teacher \| Student(self) | — | MOD-001 |

**Response نموذجي (POST):**
```json
{
  "id": "sess-001",
  "overallScore": 78,
  "performanceCategory": "good",
  "criteria": { "comprehension": 80, "fluency": 75, "accuracy": 79 },
  "gapDetected": false,
  "createdAt": "2026-07-18T10:00:00Z"
}
```

---

## محرك الإملاء (Dictation Engine)

| Method | Path | الغرض | الصلاحيات | Request Body | Module |
|--------|------|--------|-----------|-------------|--------|
| POST | /api/dictation-sessions | تسجيل جلسة | Teacher \| Admin | `{studentId, standardId, spellingScore, listeningScore, notes?}` | MOD-002 |
| GET | /api/dictation-sessions/student/:id | جلسات طالب | Teacher \| Student(self) | Pagination | MOD-002 |

---

## محرك الكتابة (Writing Engine)

| Method | Path | الغرض | الصلاحيات | Request Body | Module |
|--------|------|--------|-----------|-------------|--------|
| POST | /api/writing-sessions | تسجيل جلسة | Teacher \| Admin | `{studentId, standardId, coherenceScore, vocabularyScore, grammarScore, mechanicsScore, notes?}` | MOD-003 |
| GET | /api/writing-sessions/student/:id | جلسات طالب | Teacher \| Student(self) | Pagination | MOD-003 |

---

## محرك النطق (Pronunciation Engine)

| Method | Path | الغرض | الصلاحيات | Request Body | Module |
|--------|------|--------|-----------|-------------|--------|
| POST | /api/pronunciation-sessions | تسجيل جلسة | Teacher \| Admin | `{studentId, standardId, clarityScore, fluencyScore, intonationScore, notes?}` | MOD-004 |
| GET | /api/pronunciation-sessions/student/:id | جلسات طالب | Teacher \| Student(self) | Pagination | MOD-004 |

---

## محرك الطلاقة والتفكير (Fluency & Thinking Engine)

| Method | Path | الغرض | الصلاحيات | Request Body | Module |
|--------|------|--------|-----------|-------------|--------|
| POST | /api/fluency-thinking-sessions | تسجيل جلسة | Teacher \| Admin | `{studentId, standardId, expressionScore, coherenceScore, depthScore, notes?}` | MOD-005 |
| GET | /api/fluency-thinking-sessions/student/:id | جلسات طالب | Teacher \| Student(self) | Pagination | MOD-005 |

---

## محرك سلوك التعلم (Learning Behavior Engine)

| Method | Path | الغرض | الصلاحيات | Request Body | Module |
|--------|------|--------|-----------|-------------|--------|
| POST | /api/learning-behavior-sessions | تسجيل جلسة | Teacher \| Admin | `{studentId, standardId, participationScore, focusScore, consistencyScore, notes?}` | MOD-006 |
| GET | /api/learning-behavior-sessions/student/:id | جلسات طالب | Teacher \| Student(self) | Pagination | MOD-006 |

---

## الإتقان (Mastery)

| Method | Path | الغرض | الصلاحيات | Notes | Module |
|--------|------|--------|-----------|-------|--------|
| GET | /api/mastery/student/:id | إتقان الطالب الحالي | Teacher \| Student(self) \| Parent | جميع المعايير | MOD-007 |
| GET | /api/mastery/student/:id/history | تاريخ الإتقان | Teacher \| Student(self) | Timeline | MOD-007 |
| GET | /api/mastery/class/:id | إتقان الصف | Teacher \| Principal | Aggregated | MOD-007 |

---

## التشخيص (Diagnostics)

| Method | Path | الغرض | الصلاحيات | Notes | Module |
|--------|------|--------|-----------|-------|--------|
| GET | /api/diagnostics/student/:id | فجوات طالب | Teacher \| Parent | Active gaps | MOD-008 |
| GET | /api/diagnostics/student/:id/history | تاريخ الفجوات | Teacher | كل الفجوات | MOD-008 |
| GET | /api/diagnostics/school/:id/gaps | فجوات المدرسة | Principal \| Admin | Aggregated | MOD-008 |
| PATCH | /api/diagnostics/gaps/:id | تحديث حالة فجوة | Teacher | status change | MOD-008 |

---

## العلاج (Remediation)

| Method | Path | الغرض | الصلاحيات | Request Body | Module |
|--------|------|--------|-----------|-------------|--------|
| POST | /api/remediation/assign | إسناد خطة علاج | Teacher | `{gapId, protocolId, notes?}` | MOD-009 |
| GET | /api/remediation/student/:id | خطط علاج الطالب | Teacher \| Student(self) | Active + history | MOD-009 |
| PATCH | /api/remediation/:id/progress | تحديث التقدم | Teacher | `{progressPercent, notes?}` | MOD-009 |
| PATCH | /api/remediation/:id/complete | إتمام خطة العلاج | Teacher | — | MOD-009 |

---

## قياس الأثر (Impact)

| Method | Path | الغرض | الصلاحيات | Notes | Module |
|--------|------|--------|-----------|-------|--------|
| GET | /api/impact/student/:id | أثر التدخلات للطالب | Teacher \| Parent | — | MOD-010 |
| GET | /api/impact/school/:id | تقرير أثر المدرسة | Principal \| Admin | Aggregated | MOD-010 |
| GET | /api/impact/teacher/:id | تقرير أثر المعلم | Teacher(self) \| Principal | — | MOD-010 |

---

## الذكاء الاصطناعي (AI — اختياري)

| Method | Path | الغرض | الصلاحيات | Request Body | Module |
|--------|------|--------|-----------|-------------|--------|
| POST | /api/ai/analyze | تحليل جلسة بالذكاء | Teacher | `{sessionId, engineType}` | MOD-011 |
| POST | /api/ai/recommend | اقتراح علاج بالذكاء | Teacher | `{gapId}` | MOD-011 |

---

## الاختبارات (Exams)

| Method | Path | الغرض | الصلاحيات | Notes | Module |
|--------|------|--------|-----------|-------|--------|
| GET | /api/exams | قائمة الاختبارات | Teacher \| Admin | — | Core |
| POST | /api/exams | إنشاء اختبار | Teacher \| Admin | — | Core |
| GET | /api/exams/:id/results | نتائج اختبار | Teacher \| Principal | — | Core |

---

## رموز الأخطاء الموحدة

```
200 OK           — نجاح (GET, PATCH)
201 Created      — إنشاء ناجح (POST)
400 Bad Request  — بيانات غير صحيحة (Zod validation failed)
401 Unauthorized — لا Token أو Token منتهٍ
403 Forbidden    — Token صحيح لكن لا صلاحية
404 Not Found    — المورد غير موجود
409 Conflict     — تعارض (مثل بريد مستخدم موجود)
429 Too Many     — تجاوز Rate Limit
500 Server Error — خطأ داخلي (يُسجَّل في Logs)

Format الموحد للخطأ:
{
  "error": "VALIDATION_ERROR",
  "message": "comprehensionScore must be between 0 and 100",
  "field": "comprehensionScore"
}
```

---

*"فهرس الـ API يُختصر 80% من أسئلة المطورين الجدد."*
