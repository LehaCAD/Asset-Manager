# Раскадровка — архитектура проекта

## Что это за проект

`Раскадровка` — веб-платформа для AI-продакшена, где пользователь собирает материалы по иерархии:

`User → Project → Scene → Element`

- **Project** — проект клиента/задачи. Имеет статус (`ACTIVE`, `PAUSED`, `COMPLETED`) и формат кадра (`16:9`, `9:16`).
- **Scene** — сцена внутри проекта. Имеет статус (`DRAFT`, `IN_PROGRESS`, `REVIEW`, `APPROVED`), порядок (`order_index`), обложку (`headliner` → Element).
- **Element** — изображение или видео внутри сцены. Тип задаётся полем `element_type` (`IMAGE` / `VIDEO`). Может быть загружен вручную или сгенерирован AI.
- **Comment** — комментарий к сцене через публичный доступ.
- **SharedLink** — публичная ссылка на проект (UUID-токен, опциональный срок действия).
- **UserQuota** — лимиты пользователя (`max_projects`, `max_scenes_per_project`, `max_elements_per_scene`).
- **AIProvider** / **AIModel** — провайдеры и модели генерации (Kie.ai и т.д.).

## Технологический стек

- **Backend:** Django 5, DRF, Channels (WebSocket), Celery, Redis, PostgreSQL, S3 (django-storages).
- **Frontend:** Next.js 14 (App Router), Zustand, клиентский API-слой в `frontend/lib`.
- **Инфраструктура:** Docker Compose, Nginx.

## Где что лежит

### Backend

```
backend/
├── config/
│   ├── settings.py         — конфигурация Django, БД, Redis, Celery, S3
│   ├── urls.py             — корневые API-маршруты
│   ├── celery.py           — настройка Celery
│   └── asgi.py             — ASGI + WebSocket routing
├── apps/
│   ├── users/              — User, UserQuota, авторизация (JWT)
│   ├── projects/           — Project, ProjectConsumer (WebSocket)
│   ├── scenes/             — Scene (модель, вьюхи, сериализаторы, S3-утилиты)
│   ├── elements/           — Element (модель, вьюхи, сериализаторы, Celery-задачи)
│   ├── ai_providers/       — AIProvider, AIModel, management-команды
│   └── sharing/            — SharedLink, Comment
```

### Frontend

```
frontend/
├── app/                    — страницы Next.js (App Router)
├── components/             — UI-компоненты
├── lib/
│   ├── api.ts              — типы и методы API-клиента
│   └── store/              — Zustand сторы
```

## Модели и связи

```
User 1──N Project
              │
              ├── 1──N Scene
              │         ├── 1──N Element
              │         ├── 1──N Comment
              │         └── headliner ──> Element (FK, nullable)
              │
              └── 1──N SharedLink

AIProvider 1──N AIModel 1──N Element (nullable)

User 1──1 UserQuota
```

## API эндпоинты

| Префикс             | Приложение       | Описание                        |
|----------------------|------------------|---------------------------------|
| `api/auth/`          | users            | Регистрация, JWT, профиль       |
| `api/projects/`      | projects         | CRUD проектов                   |
| `api/scenes/`        | scenes           | CRUD сцен, upload, generate, reorder, set_headliner |
| `api/elements/`      | elements         | CRUD элементов, reorder         |
| `api/ai-models/`     | ai_providers     | Список AI-моделей               |

## Ключевые механики

- **Генерация:** `POST /api/scenes/{id}/generate/` создаёт Element со статусом `PENDING`, запускает Celery-задачу `start_generation` → polling `check_generation_status` → скачивание результата на S3 → статус `COMPLETED`. Входные изображения (image refs, img2vid source) передаются через `generation_config.input_urls` и др. ключи из `image_inputs_schema`.
- **WebSocket:** Клиент подключается к `ws/projects/{id}/`, получает `element_status_changed` при завершении/ошибке генерации.
- **Загрузка файлов:** `POST /api/scenes/{id}/upload/` загружает файл на S3, создаёт Element с `source_type=UPLOADED`.
- **Публичный доступ:** `SharedLink` даёт readonly-доступ к проекту по токену. Через него клиент оставляет `Comment` к сцене.
- **Квоты:** `UserQuota` ограничивает количество проектов, сцен в проекте и элементов в сцене.
- **Headliner:** У каждой сцены может быть «лучший элемент» (`headliner`) — используется как обложка на сценарном столе.

## Django-приложения

| Django app (директория) | Доменная модель          |
|-------------------------|--------------------------|
| `apps/scenes/`          | **Scene**                |
| `apps/elements/`        | **Element**              |
| `apps/projects/`        | **Project**              |
| `apps/users/`           | **User**, **UserQuota**  |
| `apps/sharing/`         | **SharedLink**, **Comment** |
| `apps/ai_providers/`    | **AIProvider**, **AIModel** |
## AI Model Admin Redesign

`AIModel` remains the central entity for administration and runtime delivery, but authoring is now normalized:

- `CanonicalParameter` stores reusable semantic parameter definitions.
- `ModelParameterBinding` links model placeholders to canonical parameters and carries per-model overrides.
- `ModelPricingConfig` stores normalized pricing configuration.
- Runtime consumers still receive compiled `parameters_schema` and `pricing_schema` from `AIModel` for backward compatibility.

This keeps frontend/runtime compatibility while removing manual synchronization between request template, UI parameters, and pricing.
