# Production Round 1: Security Hardening

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Закрыть все критические дыры безопасности. После этого раунда платформа безопасна для открытия регистрации (но ещё без email verification и billing).

**Срок:** ~3-4 дня
**Зависимости:** Нет (можно начинать сразу)
**Блокирует:** Round 2 (HTTPS нужен для secure cookies)

---

## File Map

| File | Action | Задача |
|------|--------|--------|
| `backend/config/settings.py` | Modify | CORS, DEBUG, ALLOWED_HOSTS, security headers, cookies, rate limiting, logging |
| `backend/requirements.txt` | Modify | Добавить sentry-sdk |
| `backend/apps/common/views.py` | Create | Health check endpoint |
| `backend/config/urls.py` | Modify | Подключить health check |
| `nginx/default.conf` | Modify | HTTPS, security headers, rate limiting |
| `docker-compose.production.yml` | Modify | Resource limits, Redis password |
| `scripts/backup-db.sh` | Create | Автоматический бэкап БД |
| `scripts/setup-backups-cron.sh` | Create | Установка cron для бэкапов |
| `frontend/next.config.js` | Modify | Sentry frontend (опционально) |
| `frontend/app/error.tsx` | Create | React error boundary |
| `frontend/app/global-error.tsx` | Create | Global error boundary |

---

## Task 1: CORS, DEBUG, ALLOWED_HOSTS

**Files:** `backend/config/settings.py`

- [ ] Изменить дефолт DEBUG:
```python
DEBUG = os.getenv('DEBUG', 'False').lower() in ('true', '1', 'yes')
```

- [ ] Убрать dev-хосты из ALLOWED_HOSTS в production:
```python
ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')
```
В `.env.production` задать: `ALLOWED_HOSTS=raskadrawka.ru,www.raskadrawka.ru`

- [ ] Закрыть CORS:
```python
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = os.getenv('CORS_ALLOWED_ORIGINS', 'http://localhost:3000').split(',')
```
В `.env.production` задать: `CORS_ALLOWED_ORIGINS=https://raskadrawka.ru,https://www.raskadrawka.ru`

- [ ] Проверить что `CORS_ALLOW_CREDENTIALS = True` остаётся (нужно для JWT cookies)

---

## Task 2: Security Headers & Cookie Flags

**Files:** `backend/config/settings.py`

- [ ] Добавить после секции CORS:
```python
# === Security (production) ===
if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SECURE_HSTS_SECONDS = 31536000  # 1 year
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'

    CSRF_COOKIE_SECURE = True
    CSRF_COOKIE_HTTPONLY = True
    CSRF_COOKIE_SAMESITE = 'Lax'

    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_BROWSER_XSS_FILTER = True
    X_FRAME_OPTIONS = 'DENY'
```

- [ ] Убедиться что `SECURE_PROXY_SSL_HEADER` НЕ дублируется (уже есть в settings, перенести в if-блок выше)

---

## Task 3: Rate Limiting на auth-эндпоинты

**Files:** `backend/config/settings.py`, `backend/apps/users/views.py`

- [ ] Добавить throttle классы в settings.py:
```python
REST_FRAMEWORK = {
    ...existing...
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '60/minute',
        'user': '120/minute',
        'auth': '5/minute',
    },
}
```

- [ ] Создать кастомный throttle для auth:
```python
# В users/views.py или users/throttles.py
from rest_framework.throttling import AnonRateThrottle

class AuthRateThrottle(AnonRateThrottle):
    rate = '5/minute'
    scope = 'auth'
```

- [ ] Добавить throttle на RegisterView и LoginView:
```python
class RegisterView(generics.CreateAPIView):
    throttle_classes = [AuthRateThrottle]
    ...

# Для login (TokenObtainPairView) — в urls.py:
path('login/', TokenObtainPairView.as_view(throttle_classes=[AuthRateThrottle]), name='token_obtain_pair'),
```

- [ ] Добавить throttle на webhook (`/api/ai/callback/`):
```python
class WebhookRateThrottle(AnonRateThrottle):
    rate = '30/minute'
```

---

## Task 4: HTTPS в Nginx

**Files:** `nginx/default.conf`

- [ ] Раскомментировать HTTPS server block (строки ~69-132 в текущем конфиге)

- [ ] Включить HTTP → HTTPS редирект:
```nginx
server {
    listen 80;
    server_name raskadrawka.ru www.raskadrawka.ru;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$server_name$request_uri;
    }
}
```

- [ ] Добавить security headers в HTTPS server block:
```nginx
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

- [ ] Добавить rate limiting в nginx:
```nginx
# В http блоке (вне server):
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;
limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m;

# В location /api/:
limit_req zone=api burst=50 nodelay;

# В отдельный location для auth:
location /api/auth/ {
    limit_req zone=auth burst=10 nodelay;
    proxy_pass http://backend;
    ...
}
```

- [ ] Получить сертификат (выполнить на сервере):
```bash
docker compose exec certbot certonly --webroot -w /var/www/certbot \
  -d raskadrawka.ru -d www.raskadrawka.ru --email admin@raskadrawka.ru --agree-tos
```

- [ ] Рестартнуть nginx: `docker compose -f docker-compose.production.yml restart nginx`

---

## Task 5: Health Check Endpoint

**Files:** `backend/apps/common/views.py` (create), `backend/config/urls.py`

- [ ] Создать `backend/apps/common/views.py`:
```python
from django.http import JsonResponse
from django.db import connection
from django_redis import get_redis_connection

def health_check(request):
    status = {'status': 'ok', 'checks': {}}
    all_ok = True

    # DB
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
        status['checks']['database'] = 'ok'
    except Exception as e:
        status['checks']['database'] = str(e)
        all_ok = False

    # Redis
    try:
        redis = get_redis_connection("default")
        redis.ping()
        status['checks']['redis'] = 'ok'
    except Exception:
        try:
            from redis import Redis
            r = Redis.from_url('redis://redis:6379/0')
            r.ping()
            status['checks']['redis'] = 'ok'
        except Exception as e:
            status['checks']['redis'] = str(e)
            all_ok = False

    if not all_ok:
        status['status'] = 'error'
        return JsonResponse(status, status=503)
    return JsonResponse(status)
```

- [ ] Подключить в `config/urls.py`:
```python
from apps.common.views import health_check
urlpatterns = [
    path('api/health/', health_check, name='health_check'),
    ...
]
```

---

## Task 6: Sentry

**Files:** `backend/requirements.txt`, `backend/config/settings.py`

- [ ] Добавить в `requirements.txt`:
```
sentry-sdk[django]==2.19.2
```

- [ ] Добавить в `settings.py` (в конец файла):
```python
# === Sentry ===
SENTRY_DSN = os.getenv('SENTRY_DSN', '')
if SENTRY_DSN and not DEBUG:
    import sentry_sdk
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        traces_sample_rate=0.1,
        profiles_sample_rate=0.1,
        send_default_pii=False,
    )
```

- [ ] Добавить `SENTRY_DSN=...` в `.env.production`
- [ ] Пересобрать backend: `docker compose up --build backend`

---

## Task 7: React Error Boundary

**Files:** `frontend/app/error.tsx`, `frontend/app/global-error.tsx`

- [ ] Создать `frontend/app/error.tsx`:
```tsx
'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <h2 className="text-xl font-semibold">Что-то пошло не так</h2>
        <p className="text-muted-foreground text-sm">
          Произошла ошибка. Попробуйте обновить страницу.
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
        >
          Попробовать снова
        </button>
      </div>
    </div>
  )
}
```

- [ ] Создать `frontend/app/global-error.tsx`:
```tsx
'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="ru">
      <body className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center space-y-4">
          <h2 className="text-xl font-semibold">Критическая ошибка</h2>
          <button
            onClick={reset}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
          >
            Перезагрузить
          </button>
        </div>
      </body>
    </html>
  )
}
```

---

## Task 8: Structured Logging

**Files:** `backend/config/settings.py`

- [ ] Добавить LOGGING конфигурацию:
```python
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '[{asctime}] {levelname} {name} {message}',
            'style': '{',
        },
        'json': {
            'format': '{asctime} {levelname} {name} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'WARNING',
            'propagate': False,
        },
        'apps': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}
```

---

## Task 9: Docker Resource Limits & Redis Password

**Files:** `docker-compose.production.yml`

- [ ] Добавить resource limits на сервисы:
```yaml
backend:
  ...
  deploy:
    resources:
      limits:
        memory: 512M

celery:
  ...
  deploy:
    resources:
      limits:
        memory: 512M

redis:
  ...
  command: redis-server --requirepass ${REDIS_PASSWORD}
  deploy:
    resources:
      limits:
        memory: 256M

frontend:
  ...
  deploy:
    resources:
      limits:
        memory: 512M
```

- [ ] Обновить Redis URL во всех местах (settings.py):
```python
REDIS_URL = os.getenv('REDIS_URL', 'redis://redis:6379/0')
# Для production: redis://:password@redis:6379/0

CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {'hosts': [REDIS_URL]},
    },
}
```

- [ ] Добавить `CONN_MAX_AGE` для connection pooling:
```python
DATABASES = {
    'default': {
        ...
        'CONN_MAX_AGE': int(os.getenv('CONN_MAX_AGE', 600)),
    }
}
```

- [ ] Добавить `REDIS_PASSWORD=...` и `REDIS_URL=redis://:password@redis:6379/0` в `.env.production`

---

## Task 10: Автоматические бэкапы

**Files:** `scripts/backup-db.sh` (create), `scripts/setup-backups-cron.sh` (create)

- [ ] Создать `scripts/backup-db.sh`:
```bash
#!/bin/bash
set -euo pipefail

BACKUP_DIR="/opt/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/db_backup_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

# Dump & compress
docker compose -f /opt/raskadrawka/docker-compose.production.yml exec -T db \
  pg_dump -U apom_user apom_production | gzip > "$BACKUP_FILE"

# Keep last 7 daily backups
find "$BACKUP_DIR" -name "db_backup_*.sql.gz" -mtime +7 -delete

echo "[$(date)] Backup created: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
```

- [ ] Создать `scripts/setup-backups-cron.sh`:
```bash
#!/bin/bash
# Run daily at 3:00 AM Moscow time
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/raskadrawka/scripts/backup-db.sh >> /var/log/db-backups.log 2>&1") | crontab -
echo "Backup cron installed. Check with: crontab -l"
```

- [ ] Сделать скрипты исполняемыми: `chmod +x scripts/backup-db.sh scripts/setup-backups-cron.sh`

---

## Task 11: Перенос секретов из docker-compose.yml

- [ ] Убрать AWS credentials из `docker-compose.yml` (dev):
  - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` → перенести в `.env`
  - В docker-compose.yml заменить на `${AWS_ACCESS_KEY_ID}` / `${AWS_SECRET_ACCESS_KEY}`

- [ ] Ротировать AWS ключи в Timeweb панели (старые скомпрометированы через git history)

---

## Чеклист завершения Round 1

- [ ] `DEBUG=False` в production
- [ ] CORS ограничен конкретными доменами
- [ ] HTTPS работает, HTTP → HTTPS редирект
- [ ] Security headers отдаются (проверить: `curl -I https://raskadrawka.ru`)
- [ ] Rate limiting работает на `/api/auth/` (проверить: 6 быстрых запросов → 429)
- [ ] Health check доступен: `GET /api/health/` → `{"status": "ok"}`
- [ ] Sentry ловит ошибки (проверить: вызвать 500 → появится в Sentry)
- [ ] Error boundary в React (проверить: выбросить ошибку в компоненте → красивая страница)
- [ ] Бэкапы настроены (проверить: `bash scripts/backup-db.sh`)
- [ ] Redis с паролем
- [ ] AWS ключи убраны из docker-compose.yml
