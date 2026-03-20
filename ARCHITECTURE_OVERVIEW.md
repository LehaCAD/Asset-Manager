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
- **Frontend:** Next.js 16 (App Router), React 19, Zustand 5, Tailwind 4, shadcn/ui, DnD-Kit, клиентский API-слой в `frontend/lib`.
- **Инфраструктура:** Docker Compose, Nginx, Daphne (ASGI), Let's Encrypt.
- **Прод:** VPS, `raskadrawka.ru`.

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
│   ├── ai_providers/       — AIProvider, AIModel, CanonicalParameter, ModelParameterBinding, ModelPricingConfig
│   ├── credits/            — CreditsTransaction, CreditsService
│   └── sharing/            — SharedLink, Comment
```

### Frontend

```
frontend/
├── app/
│   ├── (auth)/             — login, register
│   ├── (workspace)/        — projects, project detail, scene workspace
│   └── share/              — public share view
├── components/
│   ├── element/            — SceneWorkspace, ElementGrid, ElementCard
│   ├── generation/         — PromptBar, ConfigPanel, ModelSelector, ParametersForm
│   ├── lightbox/           — LightboxModal, DetailPanel, Filmstrip
│   ├── project/            — ProjectGrid, ProjectCard
│   ├── scene/              — ScenarioTableClient, SceneCard
│   └── ui/                 — shadcn components
├── lib/
│   ├── api/                — client.ts, auth, scenes, elements, ai-models, credits, sharing, websocket
│   ├── store/              — auth, generation, scene-workspace, credits, projects, scenes, project-display, ui
│   ├── types/index.ts      — все TypeScript типы (source of truth)
│   └── utils/              — constants, format, cn
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
                    │
                    ├── 1──N CanonicalParameter (через ModelParameterBinding)
                    ├── 1──N ModelParameterBinding
                    └── 1──1 ModelPricingConfig

User 1──1 UserQuota
User 1──N CreditsTransaction
Element 1──N CreditsTransaction (nullable)
```

## API эндпоинты

| Префикс             | Приложение       | Описание                        |
|----------------------|------------------|---------------------------------|
| `api/auth/`          | users            | Регистрация, JWT, профиль       |
| `api/projects/`      | projects         | CRUD проектов                   |
| `api/scenes/`        | scenes           | CRUD сцен, upload, generate, reorder, set_headliner |
| `api/elements/`      | elements         | CRUD элементов, reorder         |
| `api/ai-models/`     | ai_providers     | Список AI-моделей               |
| `api/credits/`       | credits          | Баланс, оценка стоимости        |
| `api/sharing/`       | sharing          | Публичные ссылки, комментарии   |
| `api/ai/callback/`   | elements         | Webhook для Kie.ai              |

## Ключевые механики

- **Генерация:** `POST /api/scenes/{id}/generate/` создаёт Element со статусом `PENDING`, запускает Celery-задачу `start_generation` → polling `check_generation_status` → скачивание результата на S3 → статус `COMPLETED`. Входные изображения (image refs, img2vid source) передаются через `generation_config.input_urls` и др. ключи из `image_inputs_schema`.
- **WebSocket:** Клиент подключается к `ws/projects/{id}/`, получает `element_status_changed` при завершении/ошибке генерации.
- **Загрузка файлов:** `POST /api/scenes/{id}/upload/` сохраняет файл в staging (`/app/tmp_uploads/`), создаёт Element с `status=PROCESSING`, запускает Celery-задачу `process_uploaded_file` → загрузка в S3 → thumbnail (для видео — первый кадр через ffmpeg) → `status=COMPLETED`.
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
| `apps/ai_providers/`    | **AIProvider**, **AIModel**, **CanonicalParameter**, **ModelParameterBinding**, **ModelPricingConfig** |
| `apps/credits/`          | **CreditsTransaction**   |

## Кредиты и биллинг

- `CreditsTransaction` — неизменяемый журнал операций (topup, generation_debit, refund_provider_error и др.).
- При генерации: дебит из `user.balance` → на ошибке: идемпотентный рефунд.
- `GET /api/credits/balance/` — текущий баланс и pricing_percent.
- `POST /api/credits/estimate/` — оценка стоимости перед генерацией.

## AI Model Admin Redesign

`AIModel` remains the central entity for administration and runtime delivery, but authoring is now normalized:

- `CanonicalParameter` stores reusable semantic parameter definitions.
- `ModelParameterBinding` links model placeholders to canonical parameters and carries per-model overrides.
- `ModelPricingConfig` stores normalized pricing configuration.
- Runtime consumers still receive compiled `parameters_schema` and `pricing_schema` from `AIModel` for backward compatibility.

This keeps frontend/runtime compatibility while removing manual synchronization between request template, UI parameters, and pricing.
