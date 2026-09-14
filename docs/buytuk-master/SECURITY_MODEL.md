# SECURITY_MODEL — Buytuk Academy
## نموذج الأمان | الأمن من التصميم لا من الإضافة

---

```
الإصدار : 1.0.0
التاريخ  : 2026-07-18
الغرض   : كيف نحمي بيانات الأطفال والمؤسسات من كل تهديد متوقع
```

> **"أمن بيانات الأطفال ليس خياراً — هو شرط."**

---

## 1. المصادقة (Authentication)

### JWT Architecture
```
Access Token:
  Algorithm : HS256 (أو RS256 في Enterprise)
  Payload   : { userId, tenantId, role, iat, exp }
  Expiry    : 24 ساعة
  Storage   : HttpOnly Cookie (لا localStorage!)

Refresh Token:
  Expiry    : 7 أيام
  Storage   : HttpOnly Cookie
  Rotation  : عند كل استخدام يُلغى القديم ويُصدَر جديد
  DB Track  : يُحفَظ hash في refresh_tokens table

Password Hashing:
  Algorithm : bcrypt
  Cost      : 12 (يستغرق ~250ms — يمنع brute force)
  لا MD5، لا SHA1، لا plain text أبداً
```

### Session Management
```
Login:
  1. تحقق من البريد وكلمة المرور (bcrypt.compare)
  2. أصدر Access + Refresh tokens
  3. احفظهما في HttpOnly Cookies
  4. سجّل في audit_logs: { action: 'LOGIN', userId, ip }

Token Refresh:
  1. تحقق من Refresh token (DB + expiry)
  2. أصدر Access token جديد
  3. أصدر Refresh token جديد (rotation)
  4. ألغِ Refresh token القديم

Logout:
  1. ألغِ Refresh token في DB (revoked_at = NOW())
  2. امسح Cookies
  3. سجّل في audit_logs: { action: 'LOGOUT' }
```

---

## 2. التفويض (Authorization)

### RBAC Matrix (Role-Based Access Control)

```
الأدوار المتاحة:
  superadmin   → يدير المنصة كاملاً (BuyTuk Team فقط)
  admin        → يدير Tenant واحد
  principal    → يرى مدرسته بالكامل
  teacher      → يرى فصوله وطلابه فقط
  student      → يرى بياناته الشخصية فقط
  parent       → يرى بيانات أبنائه فقط
```

**Permission Matrix:**

| Resource | superadmin | admin | principal | teacher | student | parent |
|----------|-----------|-------|-----------|---------|---------|--------|
| جميع المدارس | ✅ | ✅(tenant) | ✅(own) | ❌ | ❌ | ❌ |
| المستخدمون | ✅ | ✅(tenant) | 👁️(school) | ❌ | ❌ | ❌ |
| جلسات المحركات | ✅ | ✅ | 👁️ | ✅(class) | 👁️(own) | 👁️(child) |
| Mastery Records | ✅ | ✅ | 👁️ | 👁️(class) | 👁️(own) | 👁️(child) |
| Learning Gaps | ✅ | ✅ | 👁️ | ✅(class) | 👁️(own) | 👁️(child) |
| Remediation | ✅ | ✅ | 👁️ | ✅(class) | 👁️(own) | ❌ |
| Impact Reports | ✅ | ✅ | ✅(school) | 👁️(class) | ❌ | ❌ |
| Audit Logs | ✅ | 👁️(tenant) | ❌ | ❌ | ❌ | ❌ |

```
✅ = قراءة + كتابة   👁️ = قراءة فقط   ❌ = لا وصول
```

### Multi-Tenant Isolation
```
القاعدة الذهبية: Tenant A لا يرى بيانات Tenant B — أبداً.

التطبيق:
1. RBAC Middleware يستخرج tenantId من JWT
2. يُضيفه كـ condition إلى كل query تلقائياً
3. PostgreSQL RLS (Row-Level Security) كطبقة حماية ثانية

-- مثال RLS Policy
ALTER TABLE reading_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON reading_sessions
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

---

## 3. الحماية من الهجمات (Attack Prevention)

### OWASP Top 10 — تطبيقنا

```
A01 Broken Access Control:
  → RBAC Middleware على كل route
  → RLS في PostgreSQL (Defense in depth)
  → اختبارات RBAC في Integration Tests

A02 Cryptographic Failures:
  → HTTPS إلزامي (لا HTTP في production)
  → bcrypt للكلمات السر (cost 12)
  → Secrets في Environment Variables (لا hardcoded)

A03 Injection:
  → Drizzle ORM (parameterized queries — SQL injection مستحيل)
  → Zod validation على كل input
  → لا dynamic SQL مباشر

A04 Insecure Design:
  → Threat Modeling مُوثَّق
  → Defense in depth (RBAC + RLS)
  → Audit logging لكل عملية حساسة

A05 Security Misconfiguration:
  → Security headers عبر helmet.js
  → CORS محدود (whitelist)
  → لا Default credentials

A06 Vulnerable Components:
  → npm audit في CI/CD
  → تحديث شهري للـ patches
  → DEPENDENCY_POLICY.md

A07 Auth Failures:
  → Rate limiting على /api/auth/*
  → Account lockout بعد 5 محاولات فاشلة
  → HttpOnly Cookies (لا JavaScript access)

A09 Logging Failures:
  → OBSERVABILITY.md — structured logging
  → Audit logs لكل عملية حساسة
  → لا PII في logs عادية
```

### Rate Limiting
```
عام        : 100 req/min لكل IP
/api/auth/* : 5 req/min لكل IP (strict — منع Brute Force)
/api/ai/*   : 10 req/min لكل user (تحكم في التكلفة)

Implementation: express-rate-limit + Redis (أو in-memory للبداية)
عند التجاوز: 429 Too Many Requests + Retry-After header
```

### Input Validation
```
كل POST/PUT/PATCH → Zod schema validation
Zod يتحقق من:
  - أنواع البيانات
  - النطاقات (min/max للدرجات: 0-100)
  - الطول (max length للنصوص)
  - التنسيق (email format)
  - الحقول الإلزامية

على خطأ: 400 Bad Request + رسالة واضحة
```

### Security Headers (helmet.js)
```
Content-Security-Policy  : يمنع XSS
X-Frame-Options          : DENY (يمنع Clickjacking)
X-Content-Type-Options   : nosniff
Referrer-Policy          : strict-origin
Strict-Transport-Security: max-age=31536000 (HSTS)
```

---

## 4. حماية البيانات (Data Protection)

### بيانات الأطفال
```
المشكلة : الطلاب أقل من 18 سنة — حماية إضافية مطلوبة

القواعد:
✅ لا مشاركة بيانات طالب مع طرف ثالث بدون موافقة صريحة
✅ الوصول محدود بـ RBAC صارم (معلمه + مديره + أبوه فقط)
✅ Audit log لكل وصول لبيانات طالب
✅ حق الحذف (Right to Erasure) مُطبَّق

في الكود:
← لا student PII (اسم، صورة) في الـ Logs
← لا تصدير بيانات طالب بدون audit entry
← API responses تُعيد minimum data (no oversharing)
```

### التشفير
```
في النقل (In Transit):
  → TLS 1.2+ إلزامي (HTTPS)
  → Certificate renewal تلقائي (Let's Encrypt)

في التخزين (At Rest):
  → كلمات المرور: bcrypt (غير قابلة للفك)
  → بيانات حساسة: PostgreSQL disk encryption (المزود يُفعّله)
  → Backups: تُشفَّر قبل الرفع لـ S3
```

---

## 5. الـ Audit Trail

```
ما يُسجَّل:
  - تسجيل الدخول والخروج
  - إنشاء/تعديل/حذف المستخدمين
  - إنشاء جلسات التقييم
  - إنشاء/إغلاق الفجوات
  - إسناد خطط العلاج
  - تصدير أي تقرير
  - أي وصول admin لبيانات طالب

ما لا يُسجَّل:
  - قراءات GET العادية (تُثقِّل الـ DB)
  - API Health checks
  - Static assets

تنسيق السجل:
  { userId, tenantId, action, entity_type, entity_id,
    old_value, new_value, ip_address, timestamp }

الاحتفاظ: 7 سنوات — لا حذف أبداً
```

---

## 6. Incident Response للأمان

```
عند اشتباه اختراق:
1. عزل فوري: إيقاف الـ API أو قطع اتصال DB إذا لزم
2. إلغاء جميع Sessions (revoke all refresh tokens)
3. راجع audit_logs في آخر 24 ساعة
4. حدد: ما الذي وُصِل إليه؟ ومن؟
5. أخبر المتضررين خلال 72 ساعة (GDPR)
6. أصلح الثغرة + اختبرها
7. وثّق في INCIDENT_RESPONSE.md

→ التفاصيل الكاملة: INCIDENT_RESPONSE.md
```

---

*"الأمان ليس حالة — هو عملية مستمرة."*
