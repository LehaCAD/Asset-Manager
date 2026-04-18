# Round 1: Security Hardening — Completed

**Date:** 2026-03-28
**Plan:** `docs/plans/PRODUCTION_ROUND_1_SECURITY.md`
**Commits:** `6fbf102` → `af2d70a` (main branch)

---

## Tasks completed

### Task 1: CORS, DEBUG, ALLOWED_HOSTS
- `DEBUG` читается из env, дефолт `True` (для dev)
- `CORS_ALLOW_ALL_ORIGINS = DEBUG` — в проде `False`
- `CORS_ALLOWED_ORIGINS` из env, на сервере: `https://raskadrawka.ru,https://www.raskadrawka.ru`
- `ALLOWED_HOSTS` из env

### Task 2: Security Headers & Cookie Flags
- Блок `if not DEBUG:` в settings.py: HSTS, SSL redirect, secure cookies, X-Frame-Options DENY
- `SECURE_PROXY_SSL_HEADER` внутри `if not DEBUG` (не дублируется)

### Task 3: Rate Limiting
- DRF throttles: `anon: 60/min`, `user: 120/min`, `auth: 5/min`, `webhook: 30/min`
- `AuthRateThrottle` на RegisterView, TokenObtainPairView, TokenRefreshView
- `WebhookRateThrottle` на `/api/ai/callback/`
- Nginx: `limit_req_zone` для api (30r/s) и auth (5r/m)

### Task 4: HTTPS в Nginx
- HTTPS server block активен, HTTP→HTTPS redirect
- Security headers: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy
- Rate limiting zones в nginx.conf

### Task 5: Health Check
- `GET /api/health/` → `{"status": "ok", "checks": {"database": "ok", "redis": "ok"}}`
- Проверяет DB (SELECT 1) и Redis (ping через CELERY_BROKER_URL)

### Task 6: Sentry
- `sentry-sdk[django]==2.19.2` в requirements.txt
- Init в settings.py: активируется только когда `SENTRY_DSN` задан и `DEBUG=False`
- `SENTRY_DSN` настроен на сервере, тестовое событие доставлено
- Telegram-алерты настроены через Telegram Alerts Bot

### Task 7: React Error Boundary
- `frontend/app/error.tsx` — перехват ошибок на уровне страницы
- `frontend/app/global-error.tsx` — глобальный перехват

### Task 8: Structured Logging
- `LOGGING` config в settings.py: console handler, WARNING для django, INFO для apps

### Task 9: Docker Resource Limits & Redis Password
- Memory limits: backend/celery/frontend 512M, redis 256M
- Redis: `--requirepass ${REDIS_PASSWORD}`
- `CELERY_BROKER_URL` и `CELERY_RESULT_BACKEND` с URL-encoded паролем
- `CONN_MAX_AGE = 600` в проде

### Task 10: Automated Backups
- `scripts/backup-db.sh` — pg_dump + gzip, хранит 7 дней
- Cron: ежедневно в 3:00 AM

### Task 11: Secrets из docker-compose.yml
- AWS credentials вынесены в `.env`, docker-compose.yml использует `${AWS_ACCESS_KEY_ID}` и т.д.

---

## Not done / Partial

| Пункт | Статус | Комментарий |
|-------|--------|-------------|
| AWS key rotation | NOT DONE | Ключи убраны из кода, но старые не ротированы в панели Timeweb |

---

## Additional fixes during deployment

- **settings.py curly quotes** — U+2018/U+2019 на строке 238 вызывали SyntaxError, backend не стартовал. Исправлено (commit `a85f6f0`).
- **Redis URL encoding** — пароль содержал `/` и `+`, ломал URL-парсинг. URL-закодирован в `.env` на сервере.
- **frontend/public/ gitignored** — корневой `.gitignore` имел `public` без `/`, что игнорировало `frontend/public/`. Исправлено на `/public` (commit `cf494ac`).
- **Analytics date timezone** — `new Date("YYYY-MM-DD")` в JS парсился как UTC midnight, в UTC+3 показывал предыдущий день. Исправлено через `parseDateLocal()` (commit `cf494ac`).
- **Analytics spending_by_day** — строился по `CreditsTransaction`, элементы без транзакций (до введения кредитов) не отображались. Перестроен на `Element` с join транзакций (commit `d8bd735`).
- **Deploy script** — переписан на git-based deployment (`deploy.sh`), SSH key detection для WSL/Git Bash/Linux.

---

## Checklist verification

- [x] `DEBUG=False` в production
- [x] CORS ограничен конкретными доменами
- [x] HTTPS работает, HTTP→HTTPS redirect
- [x] Security headers отдаются
- [x] Rate limiting на `/api/auth/` и `/api/ai/callback/`
- [x] Health check: `GET /api/health/` → `{"status": "ok"}`
- [x] Sentry ловит ошибки (тест доставлен)
- [x] Error boundary в React
- [x] Бэкапы настроены (cron daily 3AM)
- [x] Redis с паролем
- [x] AWS ключи убраны из docker-compose.yml
- [ ] AWS ключи ротированы в Timeweb (вручную)
