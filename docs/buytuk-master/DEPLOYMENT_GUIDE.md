# DEPLOYMENT_GUIDE — Buytuk Academy
## دليل النشر | من الكود إلى الإنتاج

---

```
الإصدار : 1.0.0
التاريخ  : 2026-07-18
الغرض   : أي مطور يستطيع نشر المشروع بدون مساعدة بعد قراءة هذا الملف
```

---

## البيئات الأربع

```
local      → جهاز المطور — تطوير وتجربة يدوية
development→ الـ Replit Workspace — خادم مشترك للفريق
staging    → بيئة شبه إنتاج — اختبار E2E قبل الإنتاج
production → الإنتاج الحقيقي — المستخدمون الفعليون
```

---

## متغيرات البيئة المطلوبة

### الأساسية (إلزامية في جميع البيئات)
```bash
# قاعدة البيانات
DATABASE_URL=postgresql://user:pass@host:5432/buytuk_db

# المصادقة
JWT_SECRET=<string عشوائي 64 حرف على الأقل>
JWT_EXPIRES_IN=24h
JWT_REFRESH_SECRET=<string عشوائي مختلف 64 حرف>
JWT_REFRESH_EXPIRES_IN=7d
SESSION_SECRET=<string عشوائي 32 حرف>

# الخادم
NODE_ENV=production
PORT=3000
```

### الاختيارية (مطلوبة عند تفعيل AI)
```bash
GEMINI_API_KEY=<مفتاح من Google AI Studio>
AI_PROVIDER=gemini          # gemini | mock
AI_CACHE_TTL=300            # ثواني
```

### بيئة التطوير فقط
```bash
DATABASE_URL_TEST=postgresql://user:pass@localhost:5432/buytuk_test
LOG_LEVEL=debug
```

> **تحذير:** لا تضع هذه المتغيرات في `.env` وترفعها لـ Git.
> استخدم دائماً: Replit Secrets أو مدير secrets.

---

## النشر على Replit (Development / Staging)

### الخطوة 1: إعداد Secrets
```
1. افتح Replit → Secrets
2. أضف كل متغير بيئة مذكور أعلاه
3. تحقق: pnpm --filter @workspace/api-server run env:check
```

### الخطوة 2: إعداد قاعدة البيانات
```bash
# إنشاء جداول DB
pnpm --filter @workspace/db run push

# تحقق من الجداول
pnpm --filter @workspace/db run studio

# (اختياري) بيانات أولية للاختبار
pnpm --filter @workspace/db run seed
```

### الخطوة 3: تشغيل الـ Workflows
```
API Server:
  Command: pnpm --filter @workspace/api-server run dev
  Port: $PORT (Replit يُعيّنه تلقائياً)
  Health: GET /api/health

Frontend:
  Command: pnpm --filter @workspace/school-platform run dev
  Port: $PORT
```

### الخطوة 4: التحقق
```bash
# Health check
curl https://$REPLIT_DEV_DOMAIN/api/health

# Expected:
# { "status": "ok", "version": "2.6.1", "db": "connected" }
```

---

## النشر على VPS (Staging / Production)

### المتطلبات
```
Server:   Ubuntu 22.04+ / Debian 12+
RAM:      2GB minimum (4GB recommended for production)
CPU:      2 vCPU minimum
Storage:  20GB SSD minimum
Node.js:  v20 LTS
PostgreSQL: v15+
```

### الخطوة 1: إعداد الخادم
```bash
# تحديث النظام
sudo apt update && sudo apt upgrade -y

# Node.js v20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# pnpm
npm install -g pnpm@9

# PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# PM2 (Process Manager)
npm install -g pm2
```

### الخطوة 2: إعداد قاعدة البيانات
```bash
# إنشاء DB وMستخدم
sudo -u postgres psql
CREATE DATABASE buytuk_prod;
CREATE USER buytuk_user WITH ENCRYPTED PASSWORD 'strong_password_here';
GRANT ALL PRIVILEGES ON DATABASE buytuk_prod TO buytuk_user;
\q

# تفعيل RLS
sudo -u postgres psql -d buytuk_prod -c "
  ALTER DATABASE buytuk_prod SET app.tenant_id = '';
"
```

### الخطوة 3: نشر الكود
```bash
# Clone المشروع
git clone <repo_url> /opt/buytuk
cd /opt/buytuk

# تثبيت التبعيات
pnpm install --frozen-lockfile

# بناء الـ Frontend
pnpm --filter @workspace/school-platform run build

# بناء الـ Backend
pnpm --filter @workspace/api-server run build

# ضبط متغيرات البيئة
cp .env.example .env.production
nano .env.production  # أضف القيم الحقيقية

# تطبيق Schema
NODE_ENV=production pnpm --filter @workspace/db run push
```

### الخطوة 4: إعداد PM2
```bash
# ملف ecosystem.config.js
cat > /opt/buytuk/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'buytuk-api',
    script: 'artifacts/api-server/dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env_production: {
      NODE_ENV: 'production',
    },
    error_file: '/var/log/buytuk/error.log',
    out_file: '/var/log/buytuk/out.log',
  }]
};
EOF

# تشغيل
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

### الخطوة 5: Nginx (Reverse Proxy)
```nginx
# /etc/nginx/sites-available/buytuk
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Frontend (static files)
    location / {
        root /opt/buytuk/artifacts/school-platform/dist;
        try_files $uri $uri/ /index.html;
        expires 1h;
    }

    # API
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

```bash
# تفعيل وتجديد الشهادة
sudo certbot --nginx -d your-domain.com
sudo nginx -t && sudo systemctl reload nginx
```

### الخطوة 6: التحقق النهائي
```bash
# Health Check
curl https://your-domain.com/api/health

# Pre-deployment checklist
□ DATABASE_URL يشير للـ Production DB
□ JWT_SECRET قوي ومختلف عن بيئة التطوير
□ NODE_ENV=production
□ HTTPS يعمل
□ Health endpoint يُعيد { status: "ok" }
□ تسجيل دخول يعمل
□ إنشاء جلسة يعمل ويُحفَظ في DB
□ Backup يعمل (اختبر الاستعادة)
□ Monitoring مُفعَّل (OBSERVABILITY.md)
```

---

## النشر التدريجي (Zero-Downtime Deployment)

```bash
# عند تحديث الإصدار
cd /opt/buytuk
git pull origin main
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/school-platform run build

# إذا كانت هناك DB migrations
NODE_ENV=production pnpm --filter @workspace/db run push

# إعادة التشغيل بدون انقطاع (PM2 Cluster)
pm2 reload buytuk-api

# تحقق
curl https://your-domain.com/api/health
```

---

## Rollback عند فشل النشر

```bash
# 1. ارجع للـ Commit السابق
git log --oneline -5         # ابحث عن آخر commit مستقر
git checkout <commit-hash>

# 2. أعد البناء
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/school-platform run build

# 3. أعد التشغيل
pm2 reload buytuk-api

# 4. إذا كانت DB migration معكوسة (نادر)
# راجع MIGRATION_STRATEGY.md
```

---

*"النشر الناجح الذي يمكن عكسه أفضل من نشر مثالي لا يمكن التراجع عنه."*
