# Asset Manager — Разработка и деплой

Одна инструкция: как разрабатывать локально, чтобы не ломать прод, и как деплоить без боли.

---

## 1. Локальная разработка (чтобы прод не ломался)

### 1.1 Переменные окружения — главное

| Переменная | Локально | Прод | Важно |
|------------|----------|------|-------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | `https://raskadrawka.ru` | **БЕЗ /api** — пути уже содержат `/api/auth/`, `/api/projects/` |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:8000` | `wss://raskadrawka.ru` | **БЕЗ /ws** — код добавляет `/ws/projects/...` сам |
| `BACKEND_BASE_URL` | `http://localhost:8000` | `https://raskadrawka.ru` | Для callback URL (Kie.ai), шеринга, etc. |

**Ловушка:** `NEXT_PUBLIC_*` встраиваются в билд Next.js при сборке. Если `NEXT_PUBLIC_API_URL=https://domain.com/api`, то получается `/api/api/auth/login/` → 404.

### 1.2 Локальный .env

```bash
cp .env.example .env
# .env для локальной разработки:
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
BACKEND_BASE_URL=http://localhost:8000
```

### 1.3 Запуск локально

```bash
# Backend + DB + Redis
docker compose up -d db redis

# Backend (Django)
cd backend && python manage.py runserver

# Celery (в отдельном терминале)
cd backend && celery -A config worker -l info

# Frontend (в отдельном терминале)
cd frontend && npm run dev
```

Или через `docker compose` (dev-версия):
```bash
docker compose up
```

### 1.4 Чеклист перед деплоем — что проверить локально

Перед деплоем обязательно проверь:

- [ ] **Логин** — `/login` с username и паролем
- [ ] **Регистрация** — `/register`
- [ ] **Шеринг** — создание ссылки, открытие `/share/{token}` в инкогнито
- [ ] **WebSocket** — открыть проект, сгенерировать картинку — статус должен обновиться без перезагрузки
- [ ] **Генерация** — если есть AI-модели — создание элемента

### 1.5 Что может ломаться на проде, если работало локально

| Проблема | Причина | Решение |
|----------|---------|---------|
| 404 на `/api/auth/login/` | `NEXT_PUBLIC_API_URL` содержит `/api` | В `.env` на проде: `NEXT_PUBLIC_API_URL=https://raskadrawka.ru` (без /api) |
| Шеринг не открывается | `BACKEND_BASE_URL` или CORS | `BACKEND_BASE_URL=https://raskadrawka.ru`, `ALLOWED_HOSTS` включает домен |
| WebSocket не подключается | `NEXT_PUBLIC_WS_URL` с /ws | `NEXT_PUBLIC_WS_URL=wss://raskadrawka.ru` (без /ws) |
| CSRF в админке | `CSRF_TRUSTED_ORIGINS` | Добавить `https://raskadrawka.ru` в settings.py |
| Callback Kie.ai не срабатывает | `BACKEND_BASE_URL` неверный | Должен быть публичный URL, куда Kie.ai может достучаться |

---

## 2. Деплой (первый раз)

### 2.1 Подготовка VPS

- Docker установлен
- DNS: `raskadrawka.ru` и `www.raskadrawka.ru` → IP этого VPS
- Порты 80, 443 открыты (UFW)

### 2.2 .env на VPS

```bash
cd /root/Asset-Manager
cp .env.example .env
# Заполнить .env (см. ниже)
```

**Пример .env для прода:**

```env
# Database
POSTGRES_DB=apom_db
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<сильный_пароль>

# Django
DEBUG=False
SECRET_KEY=<генери_длинный_ключ>
ALLOWED_HOSTS=raskadrawka.ru,www.raskadrawka.ru,localhost,127.0.0.1,backend
BACKEND_BASE_URL=https://raskadrawka.ru

# Redis
REDIS_HOST=redis
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0

# S3 (TimeWeb)
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_STORAGE_BUCKET_NAME=...
AWS_S3_REGION_NAME=ru-1
AWS_S3_ENDPOINT_URL=https://s3.timeweb.com

# Database connection (defaults work in docker-compose)
DB_HOST=db
DB_PORT=5432

# Kie.ai callback auth (optional)
KIE_CALLBACK_TOKEN=<token_для_callback>

# Frontend (build-time)
NEXT_PUBLIC_API_URL=https://raskadrawka.ru
NEXT_PUBLIC_WS_URL=wss://raskadrawka.ru
```

### 2.3 Первый деплой

```bash
cd /root/Asset-Manager
./deploy-local.sh
```

### 2.4 SSL (Let's Encrypt)

После того как DNS указывает на IP VPS:

```bash
./scripts/get-ssl.sh
```

Сертификат появится в `certbot/conf/live/raskadrawka.ru/`. Nginx уже настроен на эти пути.

### 2.5 DNS не обновился

Если `ERR_CERT_COMMON_NAME_INVALID` или браузер не доверяет:
- Проверь на dnschecker.org: `raskadrawka.ru` → IP этого VPS
- На Windows: `ipconfig /flushdns`, Chrome: `chrome://net-internals/#dns` → Clear host cache
- Временно: добавить в `hosts` строку `85.239.36.28 raskadrawka.ru www.raskadrawka.ru`

---

## 3. Повторный деплой (после изменений)

```bash
cd /root/Asset-Manager
./deploy-local.sh
```

**После пересборки frontend/backend:** nginx может кэшировать старые IP контейнеров → 502.

```bash
docker compose -f docker-compose.production.yml restart nginx
```

---

## 4. Частые ошибки и что делать

| Ошибка | Причина | Действие |
|--------|---------|----------|
| 502 Bad Gateway | Nginx не видит frontend/backend после пересоздания контейнеров | `docker compose -f docker-compose.production.yml restart nginx` |
| 404 на логин | Неверный `NEXT_PUBLIC_API_URL` (с /api) | Исправить .env, пересобрать frontend: `docker compose -f docker-compose.production.yml up -d --build frontend` |
| `ModuleNotFoundError` (backend/celery) после правки `requirements.txt` | Образ не пересобран — контейнер запущен со старым слоем `pip install` | `docker compose build backend celery && docker compose up -d backend celery` |
| `Cannot find module '@sentry/nextjs'` или любой npm-пакет после правки `package.json` | Образ пересобран, но анонимный volume `/app/node_modules` сохранил старый набор пакетов между пересозданиями | `docker compose build frontend && docker compose rm -fsv frontend && docker compose up -d frontend` — флаг `-v` удаляет анонимные volumes |
| Падение при старте с `Unable to configure formatter 'json'` | В `settings.py` использован `pythonjsonlogger`, а пакет не установлен | Проверить, что `python-json-logger` есть в `requirements.txt`, и пересобрать backend/celery |
| Кракозябры при миграции БД | Дамп в UTF-16 | См. `scripts/MIGRATE-DB.md` — дамп в UTF-8 |
| CSRF в админке | `CSRF_TRUSTED_ORIGINS` | Добавить `https://raskadrawka.ru` в settings.py |
| Сертификат не доверен | DNS на старый IP | Проверить DNS, очистить кэш |

---

## 5. Команды

```bash
# Перезапуск
docker compose -f docker-compose.production.yml restart

# Полный редеплой
./deploy-local.sh

# Логи
docker compose -f docker-compose.production.yml logs -f backend
docker compose -f docker-compose.production.yml logs -f celery
docker compose -f docker-compose.production.yml logs -f nginx

# Сброс пароля пользователя
docker exec apom_backend python manage.py shell -c "
from django.contrib.auth import get_user_model
User = get_user_model()
u = User.objects.get(username='MainAlex')
u.set_password('qwerty123!')
u.save()
print('OK')
"
```

---

## 6. Схема URL

```
Frontend (Next.js):
  API_BASE_URL = NEXT_PUBLIC_API_URL
  Пути: /api/auth/login/, /api/projects/, ...
  Итог: NEXT_PUBLIC_API_URL + /api/auth/login/
  → Нужно: https://raskadrawka.ru (без /api)

  WS_BASE_URL = NEXT_PUBLIC_WS_URL
  Путь: /ws/projects/{id}/?token=...
  Итог: NEXT_PUBLIC_WS_URL + /ws/projects/...
  → Нужно: wss://raskadrawka.ru (без /ws)

Nginx:
  / → frontend:3000
  /api/ → backend:8000
  /ws/ → backend:8000
  /admin/ → backend:8000
```

---

## 7. Файлы конфигурации

| Файл | Назначение |
|------|------------|
| `docker-compose.production.yml` | Продакшен-стек |
| `docker-compose.yml` | Локальная разработка |
| `docker-compose.prod.yml` | Альтернативный prod (⚠️ содержит неверный NEXT_PUBLIC_API_URL с /api — не использовать) |
| `.env` | Секреты (не коммитить) |
| `.env.example` | Шаблон |
