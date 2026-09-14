# OBSERVABILITY — Buytuk Academy
## المراقبة والرصد | كيف تعرف أن النظام يعمل؟

---

```
الإصدار : 1.0.0
التاريخ  : 2026-07-18
الغرض   : إذا توقف النظام — ستعرف قبل أن يعرف المستخدمون
```

> **"النظام الذي لا يمكن مراقبته لا يمكن تحسينه."**

---

## الأربعة الذهبية (Four Golden Signals)

```
1. LATENCY   — كم يستغرق الطلب؟
2. TRAFFIC   — كم طلب يأتي؟
3. ERRORS    — كم خطأ يحدث؟
4. SATURATION — كم نسبة استخدام الموارد؟

هذه الأربعة تخبرك بكل شيء عن صحة النظام.
```

---

## 1. Logging (السجلات)

### القاعدة العامة
```
✅ كل طلب HTTP يُسجَّل: method, path, status, duration
✅ كل خطأ يُسجَّل: error, stack, context
✅ كل عملية مهمة (تسجيل جلسة، إنشاء فجوة) تُسجَّل
✗ لا console.log في الإنتاج — فقط structured logger
✗ لا PII (اسم مستخدم، بريد، بيانات طالب) في الـ Logs
```

### تنسيق الـ Log (JSON Structured)
```json
{
  "level": "info",
  "time": "2026-07-18T10:30:00.000Z",
  "requestId": "req-abc123",
  "tenantId": "school-001",
  "userId": "teacher-xyz",
  "method": "POST",
  "path": "/api/reading-sessions",
  "statusCode": 201,
  "duration": 145,
  "msg": "Reading session created"
}
```

### مستويات الـ Log
```
ERROR: خطأ يحتاج تدخلاً فورياً
       → يُرسَل Alert فوري
       مثال: DB connection failed, Unhandled exception

WARN:  موقف غير طبيعي لكن غير مميت
       → يُراجَع يومياً
       مثال: Slow query (>500ms), Retry occurred, AI fallback

INFO:  عمليات طبيعية مهمة
       → يُراجَع أسبوعياً
       مثال: User login, Session created, Report generated

DEBUG: تفاصيل التطوير
       → مُفعَّل فقط في Development، مُعطَّل في Production
```

---

## 2. Metrics (المقاييس)

### API Metrics
```
http_requests_total       — عدد الطلبات (by method, path, status)
http_request_duration_ms  — زمن الاستجابة (histogram)
http_errors_total         — عدد الأخطاء (by type)
```

### Business Metrics (المؤشرات التجارية)
```
sessions_created_total    — عدد جلسات التقييم المسجَّلة
gaps_detected_total       — عدد الفجوات المكتشفة
remediations_completed    — خطط العلاج المكتملة
active_tenants            — مدارس نشطة
active_users_daily        — مستخدمون نشطون يومياً
```

### Database Metrics
```
db_query_duration_ms      — زمن الاستعلامات
db_connections_active     — اتصالات نشطة
db_connections_idle       — اتصالات خاملة
```

### AI Metrics
```
ai_requests_total         — طلبات Gemini
ai_cache_hits_total       — hits من الـ Cache (يوفر المال)
ai_errors_total           — أخطاء Gemini
ai_response_duration_ms   — زمن استجابة AI
```

---

## 3. Alerts (التنبيهات)

### CRITICAL — تدخل فوري (في أي وقت)
```
- Uptime < 99% في آخر 5 دقائق
- Error rate > 5% في آخر دقيقة
- DB connection failed
- API p99 latency > 2000ms
- Disk usage > 90%
- Memory usage > 90% لمدة 5 دقائق
```

### WARNING — مراجعة خلال ساعة
```
- Error rate > 1% في آخر 10 دقائق
- API p95 latency > 500ms
- DB query > 1000ms (متكرر)
- AI error rate > 10%
- Disk usage > 70%
```

### INFO — مراجعة يومية
```
- عدد المستخدمين الجدد
- عدد الجلسات المسجَّلة
- استخدام AI (للتحكم في التكلفة)
```

---

## 4. Dashboards (لوحات المراقبة)

### لوحة 1: System Health (للمطورين)
```
┌─────────────────────────────────────┐
│ API Uptime: 99.97%  ✓              │
│ Error Rate: 0.02%   ✓              │
│ p95 Latency: 145ms  ✓              │
│ DB Connections: 12/50 ✓            │
│ Active Users: 234                   │
└─────────────────────────────────────┘
```

### لوحة 2: Business Health (للإدارة)
```
┌─────────────────────────────────────┐
│ Sessions Today: 1,247               │
│ Active Schools: 18                  │
│ Gaps Detected: 89                   │
│ Remediations Done: 34               │
│ AI Requests Today: 456              │
└─────────────────────────────────────┘
```

---

## 5. Distributed Tracing

```
الهدف: تتبع طلب من الواجهة حتى قاعدة البيانات وعودة

كل طلب له:
- requestId فريد (يُنشأ في Entry point)
- يُمرَّر لكل layer: API → Service → DB → AI
- يُسجَّل في كل خطوة

الفائدة: إذا طلب استغرق 2 ثانية — تعرف:
  - 50ms في API layer
  - 150ms في Service
  - 1,800ms في DB query ← المشكلة هنا!
```

---

## 6. Health Endpoints

```
GET /api/health
→ سريع جداً (< 10ms)
→ يتحقق فقط من: API يعمل
→ للـ Load balancer

GET /api/health/deep
→ يتحقق من: API + DB + AI connectivity
→ للمراقبة الداخلية فقط (لا يُكشَف للعموم)

Response format:
{
  "status": "ok" | "degraded" | "down",
  "version": "2.6.1",
  "timestamp": "2026-07-18T10:30:00Z",
  "checks": {
    "database": "ok",
    "ai_provider": "ok"
  }
}
```

---

## 7. Runbook للحوادث

### عند توقف الخادم
```
1. تحقق من: systemctl status / docker ps
2. راجع الـ Logs: tail -f /var/log/buytuk/error.log
3. تحقق من قاعدة البيانات: pg_isready
4. تحقق من متغيرات البيئة: printenv | grep -E 'DB|JWT|GEMINI'
5. أعد التشغيل: systemctl restart buytuk-api
6. تحقق من: GET /api/health
7. إذا لم يُحَل → Rollback لآخر إصدار مستقر
```

### عند بطء الـ API
```
1. راجع: db_query_duration_ms — هل يوجد query بطيء؟
2. راجع: http_request_duration_ms by path — أي endpoint بطيء؟
3. تحقق من DB connections: هل وصلت للحد الأقصى؟
4. تحقق من AI requests: هل Gemini يستجيب ببطء؟
5. راجع memory usage: هل هناك memory leak؟
```

### عند ارتفاع معدل الأخطاء
```
1. راجع ERROR logs في آخر 10 دقائق
2. حدد: نوع الخطأ + path + user pattern
3. إذا كان 5xx: مشكلة في الخادم ← راجع Stack trace
4. إذا كان 4xx كثير: مشكلة في client ← راجع الـ API contract
5. إذا كان DB error: تحقق من الاتصال والـ Schema
```

---

*"إذا لم تعرف أن النظام يعمل — فلا تعرف أنه يعمل."*
