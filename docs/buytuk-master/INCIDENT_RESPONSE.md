# INCIDENT_RESPONSE — Buytuk Academy
## خطة الاستجابة للحوادث | ماذا تفعل عند الكارثة

---

```
الإصدار : 1.0.0
التاريخ  : 2026-07-18
الغرض   : في لحظة الأزمة — لا تُفكِّر، اتبع الخطوات
```

> **"الفرق بين حادثة صغيرة وكارثة هو سرعة الاستجابة وجودة الإجراءات."**

---

## تصنيف الحوادث

```
SEV-1 (حرج — يستوجب تدخل فوري في أي وقت)
  - توقف كامل للخدمة (Downtime)
  - اختراق أمني مؤكد أو مشتبه به
  - فقدان بيانات واسع النطاق
  - تسريب بيانات طلاب
  وقت الاستجابة: < 15 دقيقة

SEV-2 (عالي — يستوجب تدخل خلال ساعة)
  - تعطل ميزة رئيسية (لا يمكن تسجيل جلسات)
  - بطء شديد يؤثر على الاستخدام (p95 > 3 ثوانٍ)
  - خسارة بيانات لطالب أو معلم واحد
  وقت الاستجابة: < 1 ساعة

SEV-3 (متوسط — يستوجب تدخل خلال 4 ساعات)
  - تعطل ميزة ثانوية
  - خطأ متكرر لا يمنع الاستخدام
  - أداء بطيء جزئي
  وقت الاستجابة: < 4 ساعات

SEV-4 (منخفض — يُجدوَل في Sprint القادم)
  - تحسينات أداء
  - أخطاء غير حرجة نادرة
```

---

## INC-001: توقف كامل للخدمة (SEV-1)

```
الأعراض: جميع المستخدمين لا يستطيعون الدخول
         GET /api/health يُعيد 502 / timeout

00:00 — الاكتشاف
  من الاكتشاف: Monitoring Alert | مكالمة عميل | فحص يدوي

00:01 → 00:05 — التشخيص الفوري
  pm2 status                    ← هل العملية تعمل؟
  sudo systemctl status nginx   ← هل Nginx يعمل؟
  sudo -u postgres psql -c "SELECT 1;"  ← هل DB تستجيب؟
  df -h                         ← هل Disk ممتلئ؟

00:05 → 00:15 — الحل السريع
  حسب المشكلة → OPERATIONS_MANUAL.md (السيناريو 1-3)

00:15 — إذا لم يُحَل:
  → Rollback فوري للإصدار السابق (DEPLOYMENT_GUIDE.md)
  → أشعر فريق Engineering

00:30 — Post-incident
  □ وثّق: متى بدأ؟ متى اكتُشِف؟ متى حُلَّ؟
  □ أشعر العملاء المتضررين
  □ أجرِ Post-Mortem خلال 48 ساعة
```

---

## INC-002: اختراق أمني (SEV-1)

```
الأعراض:
  - بيانات مستخدمين في مكان عام / Dark Web
  - نشاط غير طبيعي في audit_logs
  - طلبات API غريبة من IPs مشبوهة
  - تغييرات في الكود أو DB غير مُفسَّرة

الخطوة 1 — العزل الفوري (< 5 دقائق)
  pm2 stop buytuk-api            ← أوقف API
  # أو في Nginx: deny all; لجميع الـ IPs

الخطوة 2 — الحفظ (< 10 دقائق)
  # احفظ snapshot كامل قبل أي تعديل
  sudo -u postgres pg_dump buytuk_prod > /forensics/db_$(date +%Y%m%d_%H%M%S).sql
  cp -r /var/log/buytuk /forensics/logs_$(date +%Y%m%d_%H%M%S)/

الخطوة 3 — التحقيق (< 1 ساعة)
  # من وصل؟ متى؟ من أين؟
  grep "ERROR\|WARN\|FAILED" /var/log/buytuk/error.log | tail -500
  sudo -u postgres psql -d buytuk_prod -c "
    SELECT user_id, action, ip_address, created_at
    FROM audit_logs
    WHERE created_at > NOW() - INTERVAL '24 hours'
    ORDER BY created_at DESC LIMIT 200;
  "

الخطوة 4 — الاحتواء
  # ألغِ جميع Sessions النشطة
  sudo -u postgres psql -d buytuk_prod -c "
    UPDATE refresh_tokens SET revoked_at = NOW() WHERE revoked_at IS NULL;
  "
  # غيّر JWT_SECRET فوراً (يُلغي جميع Tokens)
  # ابدأ الخادم بـ Secret جديد

الخطوة 5 — الإصلاح
  حدد الثغرة → أصلحها → اختبرها → أعد تشغيل الخادم

الخطوة 6 — الإبلاغ (إلزامي)
  □ أبلغ جميع العملاء المتضررين خلال 72 ساعة (GDPR)
  □ وثّق الحادثة كاملاً
  □ قدّم تقرير للإدارة
  □ ابحث عن ثغرات مماثلة في باقي الكود
```

---

## INC-003: فقدان بيانات (SEV-1/2)

```
الأعراض: مستخدم يُبلِّغ بفقدان بيانات مهمة (جلسات، نتائج، طلاب)

الخطوة 1 — التحقق
  # هل البيانات في DB فعلاً مفقودة؟
  sudo -u postgres psql -d buytuk_prod -c "
    SELECT * FROM reading_sessions WHERE student_id = '<id>'
    ORDER BY created_at DESC LIMIT 20;
  "
  # ربما مشكلة في الـ Frontend وليس فقدان حقيقي

الخطوة 2 — إذا مفقودة فعلاً
  # تحقق من audit_logs — هل حُذِفت عمداً؟
  SELECT * FROM audit_logs
  WHERE entity_type = 'reading_sessions'
  AND action = 'DELETE'
  ORDER BY created_at DESC;

الخطوة 3 — الاستعادة
  # قارن مع الـ Backup
  # افتح backup في بيئة مؤقتة وقارن
  pg_restore --db=buytuk_temp /backups/latest.sql
  # استعد السجلات المحددة فقط (لا restore كامل)
  sudo -u postgres psql -d buytuk_prod -c "
    INSERT INTO reading_sessions SELECT * FROM buytuk_temp.reading_sessions
    WHERE id IN ('<id1>', '<id2>');
  "

الخطوة 4 — الإبلاغ
  □ أخبر المستخدم بما تم استعادته وما لم يُسترَد
  □ اشرح سبب الفقدان
  □ وثّق الحادثة

ملاحظة: Evidence لا تُحذَف في المنصة — الفقدان غير المتوقع يستوجب تحقيقاً
```

---

## INC-004: انهيار قاعدة البيانات (SEV-1)

```
الأعراض: PostgreSQL لا يبدأ / يتعطل باستمرار / corruption

الخطوة 1 — تشخيص
  sudo systemctl status postgresql
  sudo journalctl -u postgresql -n 100
  # أكثر الأسباب: disk full, corruption, OOM

الخطوة 2 — إذا Disk Full
  → OPERATIONS_MANUAL.md → السيناريو 2

الخطوة 3 — إذا Corruption
  sudo -u postgres pg_dumpall > /tmp/emergency_backup.sql 2>/dev/null
  sudo -u postgres pg_resetwal /var/lib/postgresql/15/main/  ← خطر!
  # أو مباشرة: استعادة من Backup
  → OPERATIONS_MANUAL.md → السيناريو 5

الخطوة 4 — إذا OOM (Out of Memory)
  sudo swapon --show  ← هل swap موجود؟
  # أضف swap مؤقتاً
  sudo dd if=/dev/zero of=/swapfile bs=1G count=2
  sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  # الحل الدائم: ترقية RAM أو تحسين queries
```

---

## Post-Mortem Template

```
بعد كل SEV-1 أو SEV-2 — يجب Post-Mortem خلال 48 ساعة

# Post-Mortem: [وصف مختصر]
التاريخ   : YYYY-MM-DD
المدة     : HH:MM → HH:MM (X ساعة X دقيقة)
الشدة     : SEV-1 / SEV-2
المحقق   : [الاسم]

## ماذا حدث؟
[وصف واضح وموضوعي بلا تبرير]

## ما الأثر؟
- عدد المستخدمين المتضررين:
- مدة التوقف:
- هل فُقدت بيانات؟

## الجدول الزمني
HH:MM — [ما حدث]
HH:MM — [الاكتشاف]
HH:MM — [التشخيص]
HH:MM — [الحل]
HH:MM — [التعافي الكامل]

## السبب الجذري
[لماذا حدث هذا؟ — بلا لوم على أشخاص]

## ما الذي ساعد؟
[ما الإجراءات التي نجحت؟]

## ما الذي أعاقنا؟
[ما الذي كان يمكن تسريعه؟]

## الإجراءات الوقائية
| الإجراء | المسؤول | الموعد |
|---------|---------|--------|
| [ماذا نفعل لمنع التكرار؟] | | |

## الدروس المستفادة
[3 نقاط فقط — الأهم]
```

---

## قائمة اتصال الطوارئ

```
[تُملأ عند وجود فريق حقيقي]

Tech Lead    : [الاسم] — [رقم] — [بريد]
DevOps       : [الاسم] — [رقم] — [بريد]
Product Owner: [الاسم] — [رقم] — [بريد]
DB Admin     : [الاسم] — [رقم] — [بريد]
Security     : [الاسم] — [رقم] — [بريد]

قناة Slack/Telegram للطوارئ: [الرابط]
```

---

*"الحوادث تحدث — الاستجابة الجيدة هي ما يميّز الفرق الاحترافية."*
