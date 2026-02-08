# AI Asset Manager — Техническое Задание

## 1. Суть проекта

SaaS-платформа для управления нейро-видеопродакшеном. Иерархия: User → Project → Box (Shot) → Asset. Пользователь генерирует изображения, выбирает лучшие, оживляет в видео, презентует заказчику.

## 2. Технологический стек

### Backend

- Python 3.12+
- Django 5.x
- Django REST Framework — API
- Django Channels + Redis — WebSocket для real-time статусов
- Celery + Redis — асинхронные задачи генерации
- django-storages + boto3 — работа с S3
- Uvicorn — ASGI-сервер


### Frontend

- Next.js 14 (App Router) — React, SPA-режим
- Zustand — состояние клиента
- React Query — серверное состояние и кэширование
- Native WebSocket — подписка на события


### Infrastructure

- PostgreSQL 16 — в Docker для разработки, managed для прода
- Redis 7 — брокер + кэш
- S3-compatible storage (TimeWeb) — два бакета: dev и prod
- Docker Compose — локальная разработка
- Nginx — reverse proxy на проде (с поддержкой WebSocket)


## 3. Модель данных

### User

- id, email, password (через Django Auth)
- created_at


### Project

- id, user_id (FK), name
- created_at, updated_at
- → SharedLink (one-to-many)


### Box

- id, project_id (FK), order_index, name
- headliner_asset_id (FK, nullable)
- → Asset (one-to-many), Comment (one-to-many)


### Asset

- id, box_id (FK)
- asset_type: IMAGE | VIDEO
- source_type: GENERATED | UPLOADED | IMG2VID
- parent_asset_id (FK, nullable) — для img2vid
- file_url, thumbnail_url
- status: PENDING | PROCESSING | COMPLETED | FAILED
- error_message, retry_count
- prompt_text, generation_config (JSONField)
- ai_model_id (FK), seed
- is_favorite, created_at


### AIProvider

- id, name, base_url
- api_key (encrypted)
- is_active


### AIModel

- id, provider_id (FK)
- name, model_type: IMAGE | VIDEO
- api_identifier, config_schema (JSONField)
- cost_per_generation
- is_active


### SharedLink

- id, project_id (FK)
- token (UUID, unique, indexed)
- expires_at (nullable)
- created_at


### Comment

- id, box_id (FK)
- author_name, text
- is_read, created_at


### SystemConfig

- key (unique): "smart_edit_model", "smart_edit_prompt"
- value (TextField)


## 4. API Endpoints (основные)

### Auth (Django встроенная + DRF TokenAuth или SimpleJWT)

- `POST /api/auth/register/`
- `POST /api/auth/login/`
- `POST /api/auth/logout/`


### Projects

- `GET/POST /api/projects/`
- `GET/PUT/DEL /api/projects/{id}/`
- `POST /api/projects/{id}/share/`
- `GET /api/projects/{id}/export/` → генерация .docx


### Boxes

- `GET/POST /api/projects/{id}/boxes/`
- `PUT/DEL /api/boxes/{id}/`
- `POST /api/boxes/{id}/reorder/` → {new_order: [id, id, ...]}
- `POST /api/boxes/{id}/set-headliner/` → {asset_id: ...}


### Assets

- `GET /api/boxes/{id}/assets/`
- `POST /api/boxes/{id}/generate/` → запуск генерации
- `POST /api/boxes/{id}/upload/` → загрузка файла
- `POST /api/assets/{id}/animate/` → img2vid
- `DEL /api/assets/{id}/`


### AI Models

- `GET /api/models/` → список активных моделей с config_schema


### Smart Edit

- `POST /api/smart-edit/` → {original_prompt, user_instruction} → {modified_prompt}


### Public (без авторизации, по токену)

- `GET /api/public/{token}/`
- `POST /api/public/{token}/comments/`


### WebSocket

- `/ws/projects/{project_id}/` → события: asset_status_changed, new_comment


## 5. Асинхронный пайплайн генерации

1. Клиент → `POST /api/boxes/{id}/generate/` с параметрами
2. Django: валидация, создание Asset (status=PENDING), задача в Celery, ответ {asset_id, status}
3. Celery Worker:
    - Запрос к AI-провайдеру (Kie.ai API)
    - Polling результата на стороне воркера
    - Скачивание файла → загрузка на S3
    - Обновление Asset (status=COMPLETED, file_url)
    - Отправка в Channel Layer → WebSocket группа проекта
4. Клиент получает событие, обновляет UI

Retry-политика: 3 попытки с экспоненциальной задержкой. После — status=FAILED с понятным error_message.

## 7. Smart Edit

- Модель и системный промпт хранятся в SystemConfig (редактируются через Django Admin)
- Endpoint принимает оригинальный промпт + инструкцию пользователя
- Возвращает модифицированный промпт для превью
- Пользователь подтверждает → запускается генерация


## 8. Публичные ссылки

- UUID-токен, не инкрементальный ID
- Опциональный срок действия (expires_at)
- Read-only доступ + возможность оставить комментарий
- Отзыв ссылки = удаление записи SharedLink


## 9. Retention Policy (Celery Beat)

Ежедневная задача:

- Найти Asset где is_favorite=False AND headliner для бокса=False AND created_at < 10 дней назад
- Удалить файлы с S3
- Удалить записи из БД


## 10. Экспорт проекта

Генерация .docx (python-docx):

- Таблица: номер шота, thumbnail, промпт, модель, seed
- Только хедлайнеры или все ассеты (параметр запроса)


## 11. AI-провайдеры для MVP

### Kie.ai Nano Banana (изображения)

- Endpoint: https://api.kie.ai/nano-banana
- Документация: https://kie.ai/nano-banana


### Kie.ai Seedance 1.5 Pro (видео)

- Endpoint: https://api.kie.ai/seedance-1-5-pro
- Документация: https://kie.ai/seedance-1-5-pro

Добавление новых моделей — через Django Admin (AIProvider + AIModel).

## 12. Окружения

### Local (Docker Compose)

```yaml
services:
  db:
    image: postgres:16
    volumes: [postgres_data:/var/lib/postgresql/data]
  redis:
    image: redis:7-alpine
  backend:
    build: ./backend
    depends_on: [db, redis]
  celery:
    build: ./backend
    command: celery -A config worker -l info
  celery-beat:
    build: ./backend
    command: celery -A config beat -l info
  frontend:
    build: ./frontend
```

S3: подключение к dev-бакету через переменные окружения.

### Production (VPS)

- Тот же compose или systemd-сервисы
- Nginx перед Uvicorn (важно: proxy_set_header Upgrade, Connection для WebSocket)
- S3: prod-бакет
- PostgreSQL: отдельный managed или в compose с volume на хосте


## 13. Принципы разработки Django

### Обязательно соблюдать:

#### Структура проекта:

```
backend/
   ├── config/          # settings, urls, asgi, celery
   ├── apps/
   │   ├── users/       # кастомная User модель
   │   ├── projects/    # Project, Box, Asset
   │   ├── ai_providers/# AIProvider, AIModel
   │   ├── sharing/     # SharedLink, Comment
   │   └── generation/  # Celery tasks, AI client
   ├── common/          # mixins, utils, permissions
   └── manage.py
```


#### Django-идиоматика:

- Кастомная User модель (AbstractUser) с самого начала
- Все модели наследуют TimeStampedModel (created_at, updated_at)
- related_name явно указывать во всех FK
- Бизнес-логика в сервисах (services.py), не во views
- Валидация через DRF Serializers, не в моделях
- select_related / prefetch_related для оптимизации запросов


#### DRF:

- ViewSets для CRUD, @action для кастомных операций
- Permission classes для авторизации (IsAuthenticated, кастомные)
- Pagination по умолчанию
- Фильтрация через django-filter


#### Channels:

- Один consumer на проект
- Группы по project_{id}
- Аутентификация через middleware (токен в query string)


#### Celery:

- Задачи в отдельном модуле tasks.py
- Идемпотентность (можно безопасно перезапустить)
- Логирование через get_task_logger


#### Настройки:

- settings/base.py, settings/local.py, settings/production.py
- Секреты через python-decouple или django-environ
- Никаких секретов в репозитории


#### Миграции:

- Атомарные, по одной фиче
- Data migrations отдельно от schema migrations


## 14. Порядок реализации (рекомендуемый)

1. Скелет: Django проект, Docker Compose, базовые settings
2. Auth: Кастомный User, регистрация/логин через DRF
3. Модели: Project, Box, Asset (без генерации)
4. CRUD API: ViewSets для всех сущностей
5. S3: Загрузка файлов, хранение URL
6. Celery: Инфраструктура, тестовая задача
7. AI Integration: Один провайдер (Nano Banana), генерация изображений
8. WebSocket: Уведомления о статусах
9. img2vid: Seedance интеграция
10. Smart Edit: LLM-переписывание промптов
11. Sharing: Публичные ссылки, комментарии
12. Export: Генерация .docx
13. Frontend: Параллельно с п.4 и далее
