# Раскадровка — CLAUDE.md

> Контекст для агентов. Читай перед любой работой с кодом.

## Что это за проект

**Раскадровка** (`raskadrawka.ru`) — веб-платформа для AI-продакшена. Пользователь создаёт проекты, генерирует изображения и видео через AI-провайдеров (Kie.ai и др.), организует материалы в группы.

Иерархия данных: `User → Project → Scene → Element`
> Scene будет переименована в Group (задача в бэклоге). В коде пока Scene.

## Стек

- **Backend:** Django 5, DRF, Channels (WebSocket), Celery, Redis, PostgreSQL, S3 (Timeweb)
- **Frontend:** Next.js 14 (App Router), React 19, Zustand 5, Tailwind 4, shadcn/ui, DnD-Kit
- **Инфра:** Docker Compose, Nginx, Daphne (ASGI), Let's Encrypt
- **Прод:** VPS, домен `raskadrawka.ru`, данные живые

## Среда разработки

Разработка ведётся на **localhost**, всё запущено в **Docker**. Хост-машина — Windows 10.

**ЗАПРЕЩЕНО устанавливать что-либо на хост-машину** (pip install, npm install -g, apt-get, choco, и т.д.). Все зависимости ставятся **только внутри контейнеров** через:
- `backend/requirements.txt` — Python-зависимости (pip install в Dockerfile)
- `frontend/package.json` — Node-зависимости (npm install в Dockerfile)

Если нужна новая библиотека:
1. Добавить в `requirements.txt` или `package.json`
2. Пересобрать контейнер: `docker compose up --build backend` / `docker compose up --build frontend`
3. **Никогда** не запускать `pip install`, `npm install -g`, `apt install` на хосте

Команды для работы с кодом выполнять через `docker compose exec`:
```bash
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py shell
docker compose exec frontend npm run build
```

## Критические правила

### Данные
- Production БД содержит живые данные. Все миграции должны быть **обратно совместимыми**.
- Бэкап текущей БД: `backups/apom_db_before_local_dev_20260320_082106.sql`
- Перед деструктивными миграциями — всегда бэкап.

### Архитектура frontend
- **Thin Pages** — страницы только собирают контейнеры, без бизнес-логики.
- **Слои:** `Page → Container → Store → API → Backend`. Компоненты не лезут в API напрямую.
- **Domain-first Zustand** — сторы по доменам: `auth`, `projects`, `scenes`, `scene-workspace`, `generation`, `credits`, `project-display`, `ui`.
- **Schema-driven UI** — параметры моделей рендерятся из `parameters_schema`, image inputs из `image_inputs_schema`. Хардкод запрещён.
- Все user-facing тексты на **русском**. Код на английском.
- Тосты только через `sonner`, коротко, на русском.
- Ошибки не маскировать — исправлять в правильном слое.

### Архитектура backend
- **Daphne не грузит файлы в S3 синхронно.** Upload через staging → Celery task.
- **Celery:** concurrency=2, max-memory=300MB, prefetch=1, soft_time_limit=300s.
- Файлы не грузить целиком в RAM — streaming + temp file.
- Shared staging volume: `/app/tmp_uploads/` (Docker volume `upload_staging` в production).

### Деплой
- `NEXT_PUBLIC_API_URL` — **без `/api`** (пути уже содержат `/api/...`).
- `NEXT_PUBLIC_WS_URL` — **без `/ws`** (код добавляет `/ws/...` сам).
- После пересборки контейнеров: `docker compose -f docker-compose.production.yml restart nginx` (иначе 502).

## Структура проекта

```
backend/
├── apps/
│   ├── users/          → User, UserQuota, JWT auth
│   ├── projects/       → Project, WebSocket consumer
│   ├── scenes/         → Scene (будет Group), upload, generate endpoints
│   ├── elements/       → Element, Celery tasks (generation polling, upload processing)
│   ├── ai_providers/   → AIProvider, AIModel, CanonicalParameter, ModelParameterBinding, ModelPricingConfig
│   ├── credits/        → CreditsTransaction, CreditsService
│   └── sharing/        → SharedLink, Comment
├── config/             → settings.py, urls.py, celery.py, asgi.py

frontend/
├── app/
│   ├── (auth)/         → login, register
│   ├── (workspace)/    → projects list, project detail, scene workspace
│   └── share/          → public share view
├── components/
│   ├── element/        → SceneWorkspace, ElementGrid, ElementCard
│   ├── generation/     → PromptBar, ConfigPanel, ModelSelector, ParametersForm
│   ├── lightbox/       → LightboxModal, DetailPanel, Filmstrip
│   ├── project/        → ProjectGrid, ProjectCard
│   ├── scene/          → ScenarioTableClient, SceneCard
│   └── ui/             → shadcn components
├── lib/
│   ├── api/            → client.ts, auth, scenes, elements, ai-models, credits, sharing, websocket
│   ├── store/          → auth, generation, scene-workspace, credits, projects, scenes, project-display, ui
│   ├── types/index.ts  → все TypeScript типы (source of truth)
│   └── utils/          → constants, format, cn
```

## API endpoints

| Prefix | App | Описание |
|--------|-----|----------|
| `/api/auth/` | users | JWT login, register, me, refresh |
| `/api/projects/` | projects | CRUD проектов |
| `/api/scenes/` | scenes | CRUD сцен, generate, upload, reorder, set_headliner |
| `/api/elements/` | elements | CRUD элементов, reorder |
| `/api/ai-models/` | ai_providers | Список AI-моделей (read-only) |
| `/api/credits/` | credits | balance, estimate |
| `/api/sharing/` | sharing | Публичные ссылки, комментарии |
| `/api/ai/callback/` | elements | Webhook для Kie.ai |
| `ws/projects/{id}/` | projects | WebSocket — element_status_changed |

## AI Model — система конфигурации

AIModel хранит `request_schema` (JSON-шаблон с `{{placeholder}}`). При генерации плейсхолдеры подставляются из `generation_config`.

Нормализованная схема:
- **CanonicalParameter** — переиспользуемые определения параметров (resolution, aspect_ratio, duration...).
- **ModelParameterBinding** — связка placeholder → canonical parameter с per-model overrides (label, options, ui_control, visibility).
- **ModelPricingConfig** — fixed или lookup pricing.
- **Compiler** генерирует runtime `parameters_schema` и `pricing_schema` из bindings.

## Генерация — полный flow

```
Frontend: PromptBar → useGenerationStore.generate(sceneId)
  → Optimistic element в grid
  → POST /api/scenes/{id}/generate/
  → Celery: start_generation → substitute {{vars}} → POST to provider
  → Celery: check_generation_status (poll каждые 10 сек, до 60 раз)
  → Download result → Upload to S3
  → WebSocket: element_status_changed → frontend обновляет карточку
```

Credits: дебит при старте, рефунд при ошибке (идемпотентно).

## Workspace зоны

```
SceneWorkspace
├── Zone 1: ConfigPanel (модель + параметры, collapsible)
├── Zone 2: PromptBar (промпт + image inputs + кнопка генерации)
├── Zone 3: ElementGrid (DnD сортировка, фильтры, bulk actions)
└── Zone 4: LightboxModal (полноэкранный просмотр + DetailPanel)
```

## Документация

- `ARCHITECTURE_CONSTITUTION.md` — правила архитектуры frontend/backend, чеклисты ревью, протоколы дебага.
- `ARCHITECTURE_OVERVIEW.md` — общая схема проекта.
- `agent-tasks.md` — бэклог задач.
- `dev and deploy.md` — инструкция по локальной разработке и деплою.
- `docs/plans/BLOCK_*.md` — пошаговые планы для каждого блока работы.
- `.cursor/tasks/` — декомпозиции завершённых фаз.
- `.cursor/rules/` — architecture decision records.

## Локальная разработка

```bash
# Вариант 1: Docker всё
docker compose up

# Вариант 2: DB+Redis в Docker, остальное нативно
docker compose up -d db redis
cd backend && python manage.py runserver
cd backend && celery -A config worker -l info  # отдельный терминал
cd frontend && npm run dev                      # отдельный терминал
```

## Чего НЕ делать

- **Не устанавливать ничего на хост-машину.** Все зависимости — через requirements.txt / package.json + пересборка контейнера.
- Не грузить файлы в S3 синхронно из Django view.
- Не хардкодить параметры моделей — всё через schema.
- Не маскировать ошибки в UI через fallback.
- Не добавлять `/api` или `/ws` в env-переменные URL.
- Не делать `force push` на production без явного согласования.
- Не удалять данные из production БД без бэкапа.
- Не рендерить `<video>` элементы в grid — только thumbnail/placeholder.
