# OPERATIONS_MANUAL — Buytuk Academy
## دليل التشغيل | ماذا تفعل في كل موقف بعد إطلاق النظام

---

```
الإصدار : 1.0.0
التاريخ  : 2026-07-18
الغرض   : الشخص المناوب يعرف ماذا يفعل — بدون اتصال بأحد
```

---

## الفحوصات اليومية (Daily Checks)

```
كل يوم عمل — أول 10 دقائق:

□ GET /api/health → يُعيد { status: "ok" }
□ Error rate في الـ Monitoring < 0.1%
□ API p95 latency < 200ms
□ DB connections: نشط / إجمالي
□ Disk usage < 70%
□ آخر Backup نجح (تحقق من timestamp)
□ لا Unhandled exceptions في Logs

إذا أي بند يفشل → راجع القسم المقابل أدناه
```

---

## السيناريو 1: توقف الخادم

```
الأعراض: GET /api/health يُعيد 502 أو timeout

الخطوة 1: تحقق من عملية Node.js
  pm2 status
  → إذا stopped → pm2 restart buytuk-api
  → إذا errored → راجع pm2 logs buytuk-api --lines 100

الخطوة 2: إذا لم يبدأ — راجع الأخطاء
  pm2 logs buytuk-api --lines 50
  أكثر الأخطاء شيوعاً:
  a) "Cannot connect to database" → السيناريو 3
  b) "Port already in use" → fuser -k 3000/tcp ثم أعد التشغيل
  c) "Missing environment variable" → راجع .env.production
  d) "MODULE_NOT_FOUND" → pnpm install ثم أعد البناء

الخطوة 3: إذا بدأ لكن لا يستجيب
  curl http://localhost:3000/api/health
  → إذا نجح: مشكلة في Nginx
    sudo nginx -t
    sudo systemctl reload nginx
  → إذا فشل: مشكلة في Node.js → pm2 logs

الخطوة 4: إذا لم يُحَل خلال 15 دقيقة
  → Rollback لآخر إصدار مستقر (DEPLOYMENT_GUIDE.md)
  → أشعر فريق Engineering

وقت الحل المستهدف: < 30 دقيقة
```

---

## السيناريو 2: امتلاء Disk Space

```
الأعراض: Disk usage > 90% في Monitoring Alert

الخطوة 1: حدد المصدر
  df -h        → مساحة كل partition
  du -sh /var/log/buytuk/*    → حجم الـ Logs
  du -sh /tmp/*               → ملفات مؤقتة
  sudo -u postgres psql -c "SELECT pg_size_pretty(pg_database_size('buytuk_prod'));"

الخطوة 2: تنظيف الـ Logs
  # لا تحذف audit_logs من DB!
  # نظّف فقط ملفات log النظام
  pm2 flush              → تفريغ pm2 logs
  find /var/log/buytuk -name "*.log" -mtime +30 -delete
  journalctl --vacuum-time=7d

الخطوة 3: إذا DB تملأ المساحة
  # تحقق من أكبر الجداول
  sudo -u postgres psql -d buytuk_prod -c "
    SELECT tablename,
           pg_size_pretty(pg_total_relation_size(tablename::regclass))
    FROM pg_tables WHERE schemaname='public'
    ORDER BY pg_total_relation_size(tablename::regclass) DESC;
  "
  # VACUUM لتحرير المساحة
  sudo -u postgres psql -d buytuk_prod -c "VACUUM ANALYZE;"

الخطوة 4: إذا لم يكفِ → أضف storage للخادم
  → تواصل مع Cloud Provider

التحذير: لا تحذف أي بيانات من DB — فقط ملفات log النظام
```

---

## السيناريو 3: قاعدة البيانات لا تستجيب

```
الأعراض: API يُعيد 500 مع "database connection failed"

الخطوة 1: تحقق من PostgreSQL
  sudo systemctl status postgresql
  → إذا stopped → sudo systemctl start postgresql
  → إذا active → راجع postgres logs:
    sudo journalctl -u postgresql -n 50

الخطوة 2: اختبر الاتصال
  sudo -u postgres psql -d buytuk_prod -c "SELECT 1;"
  → إذا نجح: مشكلة في connection string أو pool
  → إذا فشل: PostgreSQL مشكلة داخلية

الخطوة 3: تحقق من Connection Pool
  # هل وصلنا لحد الـ connections؟
  sudo -u postgres psql -c "
    SELECT count(*), state FROM pg_stat_activity GROUP BY state;
  "
  # الحل: أعد تشغيل API (يُغلق connections الزائدة)
  pm2 restart buytuk-api

الخطوة 4: تحقق من Disk Space للـ DB
  df -h /var/lib/postgresql
  → إذا ممتلئ → السيناريو 2

الخطوة 5: إذا DB تالفة
  → أوقف الـ API فوراً (pm2 stop buytuk-api)
  → استعد من آخر Backup (راجع السيناريو 5)
  → تواصل مع فريق Engineering

وقت الحل المستهدف: < 30 دقيقة
```

---

## السيناريو 4: انتهاء صلاحية شهادة SSL

```
الأعراض: المتصفح يُظهر "Your connection is not private"
          curl يُعطي: SSL certificate problem

الخطوة 1: تحقق من صلاحية الشهادة
  certbot certificates
  → يُظهر تاريخ انتهاء الصلاحية

الخطوة 2: تجديد الشهادة
  sudo certbot renew --force-renewal
  sudo nginx -t && sudo systemctl reload nginx

الخطوة 3: إذا فشل التجديد
  # تحقق من أن Domain يشير للخادم
  curl -I https://your-domain.com
  # أو أعد الإصدار
  sudo certbot --nginx -d your-domain.com

للمستقبل: Certbot يُجدِّد تلقائياً — تحقق من:
  sudo systemctl status certbot.timer
  → يجب أن يكون active
```

---

## السيناريو 5: استعادة من Backup

```
⚠️ هذا إجراء حرج — نفّذه بعناية

متى تُستخدَم:
  - DB تالفة بشكل غير قابل للإصلاح
  - حذف عرضي لبيانات مهمة
  - هجوم Ransomware

الخطوة 1: أوقف الـ API فوراً
  pm2 stop buytuk-api
  # المستخدمون لن يتمكنوا من الوصول — هذا مقصود

الخطوة 2: احتفظ بنسخة من الـ DB الحالي (إذا أمكن)
  sudo -u postgres pg_dump buytuk_prod > /tmp/buytuk_before_restore.sql

الخطوة 3: ابحث عن آخر Backup ناجح
  ls -lth /backups/buytuk/ | head -5
  # أو من S3:
  aws s3 ls s3://buytuk-backups/ --recursive | tail -5

الخطوة 4: استعادة الـ Backup
  # احذر: هذا يمسح البيانات الحالية
  sudo -u postgres psql -c "DROP DATABASE buytuk_prod;"
  sudo -u postgres psql -c "CREATE DATABASE buytuk_prod;"
  sudo -u postgres psql buytuk_prod < /backups/buytuk/latest.sql

الخطوة 5: تحقق من البيانات
  sudo -u postgres psql -d buytuk_prod -c "SELECT count(*) FROM users;"
  sudo -u postgres psql -d buytuk_prod -c "SELECT count(*) FROM reading_sessions;"

الخطوة 6: أعد تشغيل الـ API
  pm2 start buytuk-api
  curl https://your-domain.com/api/health

الخطوة 7: أبلغ المستخدمين
  "تم استعادة النظام — البيانات تعود لـ [تاريخ آخر Backup]"
```

---

## السيناريو 6: تعطل Gemini AI

```
الأعراض: POST /api/ai/* يُعيد 503 أو timeout

الخطوة 1: تحقق من Gemini API Status
  https://status.googleapis.com/

الخطوة 2: إذا Gemini معطوب عالمياً
  → النظام يتحول تلقائياً لـ MockAdapter
  → المستخدمون يرون: "التحليل الذكي غير متاح حالياً"
  → باقي المحركات تعمل بشكل طبيعي ✅
  → انتظر حتى يُصلح Google

الخطوة 3: إذا الـ API Key منتهية أو محظورة
  # تحقق من الـ Key
  curl -H "Authorization: Bearer $GEMINI_API_KEY" \
    https://generativelanguage.googleapis.com/v1/models
  → إذا 403: Key مشكلة → جدّد Key من Google AI Studio
  → أضفها في .env.production
  → pm2 restart buytuk-api

الخطوة 4: إذا تجاوزت الـ Quota
  → راجع استخدام AI في Google AI Studio
  → رفّع الـ Quota أو انتظر إعادة الضبط اليومي
```

---

## السيناريو 7: فشل Backup

```
الأعراض: Alert "Backup failed" أو Backup قديم > 24 ساعة

الخطوة 1: شغّل Backup يدوياً
  /opt/buytuk/scripts/backup.sh
  → إذا نجح: مشكلة في جدولة الـ Cron
    crontab -l    # تحقق من وجود Backup job
    crontab -e    # أضفه إذا مفقود:
    # 0 2 * * * /opt/buytuk/scripts/backup.sh

الخطوة 2: إذا فشل Backup اليدوي
  pg_dump buytuk_prod > /tmp/test_backup.sql
  → إذا نجح: مشكلة في upload script (S3/network)
  → إذا فشل: مشكلة في DB — راجع السيناريو 3

الخطوة 3: تحقق من Storage المقصود
  # إذا S3
  aws s3 ls s3://buytuk-backups/ --recursive | tail -3
  # إذا local
  ls -lh /backups/buytuk/ | tail -5

لا تترك أي يوم بدون backup — البيانات لا تُعوَّض
```

---

## الصيانة الدورية

```
يومياً   : □ Daily Checks (أعلاه)
           □ مراجعة Error logs

أسبوعياً : □ تحقق من Backup integrity (استعد backup عشوائياً وتحقق)
           □ مراجعة Slow query log
           □ pm2 logs | grep ERROR

شهرياً   : □ pnpm audit (Dependency security)
           □ VACUUM ANALYZE على قاعدة البيانات
           □ تحديث Patch versions
           □ مراجعة Disk growth trend

ربعياً   : □ Minor version updates (مع اختبار)
           □ Security scan (OBSERVABILITY.md)
           □ Review & cleanup audit_logs القديمة (archive لا delete)
           □ Capacity planning: هل نحتاج upgrade؟
```

---

*"النظام الذي يُدار جيداً لا يحتاج بطولات — بل روتيناً منتظماً."*
