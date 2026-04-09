# Раскадровка — CLAUDE.md

> Контекст для агентов. Читай перед любой работой с кодом.

## Что это за проект

**Раскадровка** (`raskadrawka.ru`) — веб-платформа для AI-продакшена. Пользователь создаёт проекты, генерирует изображения и видео через AI-провайдеров (Kie.ai и др.), организует материалы в группы.

Иерархия данных: `User → Project → Scene → Element`
> Scene будет переименована в Group (задача в бэклоге). В коде пока Scene.

## Стек

- **Backend:** Django 5, DRF, Channels (WebSocket), Celery, Redis, PostgreSQL, S3 (Timeweb)
- **Frontend:** Next.js 14 (App Router), React 19, Zustand 5, Tailwind 4, shadcn/ui, DnD-Kit, Recharts
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
│   ├── storage/        → S3 operations, presigned URLs, thumbnails (TIER 0)
│   ├── notifications/  → WebSocket уведомления (TIER 0)
│   ├── users/          → User, UserQuota, JWT auth (TIER 1)
│   ├── ai_providers/   → AIModel, параметры, pricing, generation context (TIER 1)
│   ├── credits/        → CreditsTransaction, CreditsService — "Банк" (TIER 2)
│   ├── projects/       → Project, WebSocket consumer (TIER 2)
│   ├── scenes/         → Scene (будет Group), CRUD (TIER 3)
│   ├── elements/       → Element CRUD + orchestration + generation + Celery tasks (TIER 3)
│   │   ├── orchestration.py → create_generation(), create_upload()
│   │   ├── generation.py    → finalize_success/failure, normalize responses
│   │   └── tasks.py         → Celery: start_generation, check_status, process_upload
│   ├── sharing/        → SharedLink, Comment (TIER 3)
│   └── cabinet/        → Личный кабинет — read-only аналитика, журнал, баланс, хранилище (TIER 3)
├── config/             → settings.py, urls.py, celery.py, asgi.py

frontend/
├── app/
│   ├── (auth)/         → login, register
│   ├── (workspace)/    → projects list, project detail, scene workspace
│   │   └── cabinet/    → Личный кабинет (analytics, history, balance, storage, notifications, settings)
│   └── share/          → public share view
├── components/
│   ├── element/        → SceneWorkspace, ElementGrid, ElementCard
│   ├── generation/     → PromptBar, ConfigPanel, ModelSelector, ParametersForm
│   ├── lightbox/       → LightboxModal, DetailPanel, Filmstrip
│   ├── project/        → ProjectGrid, ProjectCard
│   ├── scene/          → ScenarioTableClient, SceneCard
│   └── ui/             → shadcn components
├── lib/
│   ├── api/            → client.ts, auth, scenes, elements, ai-models, credits, sharing, websocket, cabinet
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
| `/api/cabinet/` | cabinet | Аналитика, журнал генераций, транзакции, хранилище |
| `/api/auth/me/password/` | users | Смена пароля |
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

## Дизайн-система

Все визуальные решения хранятся в **pen-файле** и документации:

- `pen/pencil-new.pen` — основной дизайн-файл (открывать через Pencil / Cursor)
  - **Color System v2** (node `gx1cz`) — единый источник правды: цвета dark/light, состояния компонентов, типографика, spacing, скругления, правила использования, специальные элементы (gradient button, теги, popup-стиль, breadcrumbs, source images, иконки Lucide, GroupCard паттерн)
  - **UI Primitives** (node `p7bxZ`) — Button, Input, Badge, Switch, Toggle, Tabs, Skeleton, Select, Separator, ChargeIcon во всех вариантах
  - **Composed Components** (node `quniB`) — ModelCard, DetailPanel, Group Tree, Breadcrumbs
  - Отдельные фреймы: ElementCard, GroupCard, PromptBar, ProjectCard, EmptyState
  - Готовые mockup'ы: ConfigPanel (`vhJaR`), Aspect Ratio Grid (`B373b`), Header+Breadcrumbs (`4LdlA`), View Popover (`rm7Gb`), Bulk Actions (`x4yHo`), ModelSelector (`utRXR`), ModeSelector (`zY3MQ`), Full Workspace (`SPr2a`)
- `docs/COMPONENT_INVENTORY.md` — инвентаризация всех 60 React-компонентов
- `docs/BACKLOG_IDEAS.md` — бэклог UI/UX идей
- `.claude/skills/pen-to-code/` — скилл переноса дизайна из pen в код
- `.claude/skills/ux-analysis/` — автономный UX-лид: impact analysis, research, mockup'ы в pen, gate перед writing-plans

## Документация

- `ARCHITECTURE_CONSTITUTION.md` — правила архитектуры frontend/backend, чеклисты ревью, протоколы дебага.
- `ARCHITECTURE_OVERVIEW.md` — общая схема проекта.
- `docs/MODULE_MAP.md` — **карта модулей** (куда смотреть при проблемах, куда добавлять фичи).
- `docs/systems/` — **документация подсистем для агентов**. Перед работой с подсистемой — прочитать соответствующий файл. После значимых изменений — обновить его.
- `docs/guides/` — **инструкции для пользователей** (человеческий язык, пошагово).
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
