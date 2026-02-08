# 🎯 AI Asset Manager - Текущий прогресс

## Статус разработки: AI Generation System завершен ✅

### ✅ Завершено

#### 1. Приложение Users ✅
- Кастомная модель User (AbstractUser)
- Поля: created_at, updated_at
- Регистрация в админке
- AUTH_USER_MODEL настроен

#### 2. Приложение Projects ✅
- Модель Project
- Связь: User → Project (one-to-many)
- Сервисы для бизнес-логики (3 функции)
- 6 unit-тестов
- Админка с фильтрами и поиском
- **REST API**: Сериализатор + ViewSet + 10 API тестов

#### 3. Приложение Boxes ✅
- Модель Box
- Связь: Project → Box (one-to-many)
- Поле order_index для сортировки
- Сервисы (5 функций, включая reorder_boxes)
- 9 unit-тестов
- Админка с list_editable для order_index
- **REST API**: Сериализатор + ViewSet + 13 API тестов
- **S3 Upload**: @action upload для загрузки файлов на S3
- **AI Generation**: @action generate для запуска генерации

#### 4. Приложение Assets ✅
- Модель Asset
- Связь: Box → Asset (one-to-many)
- Типы: IMAGE | VIDEO (choices)
- Поля: file_url, thumbnail_url, is_favorite, prompt_text
- Интеграция с AI: ai_model (FK), generation_config (JSON), seed
- **AI Generation Status**: status (PENDING/PROCESSING/COMPLETED/FAILED)
- **Source tracking**: source_type (GENERATED/UPLOADED/IMG2VID)
- **Parent asset**: parent_asset (FK для img2vid)
- **External task**: external_task_id (для polling у провайдера)
- Сервисы (8 функций, включая substitute_variables)
- 13 unit-тестов
- Админка с list_editable для is_favorite и фильтром box__project
- **REST API**: Сериализатор + ViewSet + 14 API тестов + фильтрация
- **Celery Tasks**: start_generation, check_generation_status

#### 5. Приложение AI Providers ✅
- Модель AIProvider (название, base_url, api_key, is_active)
- Модель AIModel (provider FK, model_type, api_endpoint, request_schema, parameters_schema, is_active)
- **Универсальная система**: любые AI провайдеры через JSON-схемы
- **Плейсхолдеры**: {{variable}} для динамических значений
- **Management команды**: setup_kie_ai, list_ai_models, test_generation, test_video_generation
- Unit-тесты
- Админка с кастомными методами
- **Полная документация**: README.md (300+ строк) + QUICKSTART.md

#### 6. Приложение Sharing ✅
- Модель SharedLink (project FK, token UUID, expires_at)
- Модель Comment (box FK, author_name, text, is_read)
- Сервисы (создание ссылок, комментарии)
- Unit-тесты
- Админка с admin actions (mark_as_read/unread)

#### 7. S3 Storage ✅
- **django-storages + boto3** интеграция
- **TimeWeb S3** настроен (ai-production-asset-managemer)
- **Автоматическая загрузка**: уникальные имена через UUID
- **Публичный доступ**: AWS_DEFAULT_ACL = 'public-read'
- **Кеширование**: Cache-Control: max-age=86400
- **Утилиты**: upload_file_to_s3, detect_asset_type, generate_unique_filename
- **API endpoint**: POST /api/boxes/{id}/upload/

#### 8. Celery ✅
- **Redis broker**: redis://redis:6379/0
- **Worker**: apom_celery контейнер
- **Tasks**: start_generation (отправка запросов), check_generation_status (polling)
- **Retry механизм**: max_retries=60 для polling
- **Конфигурация**: CELERY_TASK_TIME_LIMIT = 30 минут
- **Management команды**: test_celery, test_generation, test_video_generation

#### 9. AI Generation System ✅
- **Универсальная архитектура**: поддержка любых AI провайдеров
- **substitute_variables()**: рекурсивная подстановка {{placeholder}} в JSON
- **Асинхронная генерация**: через Celery tasks
- **Polling механизм**: автоматическая проверка статуса у провайдера
- **Автоматическая загрузка**: результаты скачиваются и загружаются на S3
- **Статус трекинг**: PENDING → PROCESSING → COMPLETED/FAILED
- **Error handling**: сохранение error_message при ошибках
- **Протестировано**: работает с Kie.ai (Seedance 1.5 Pro, Nano Banana)

## Текущая архитектура БД

```
┌─────────────────┐
│      User       │
│  (users.User)   │
├─────────────────┤
│ • id            │
│ • username      │
│ • email         │
│ • password      │
│ • created_at    │
│ • updated_at    │
└────────┬────────┘
         │
         │ 1:N (projects)
         ▼
┌─────────────────┐
│    Project      │
│(projects.Proj.) │
├─────────────────┤
│ • id            │
│ • user_id  (FK) │
│ • name          │
│ • created_at    │
│ • updated_at    │
└────────┬────────┘
         │
         │ 1:N (boxes)
         ▼
┌─────────────────┐         ┌──────────────────┐
│      Box        │         │   AIProvider     │
│  (boxes.Box)    │         ├──────────────────┤
├─────────────────┤         │ • id             │
│ • id            │         │ • name           │
│ • project_id(FK)│         │ • base_url       │
│ • name          │         │ • api_key        │
│ • order_index   │         │ • is_active      │
│ • created_at    │         └────────┬─────────┘
│ • updated_at    │                  │
└────────┬────────┘                  │ 1:N (models)
         │                           ▼
         │ 1:N (assets)      ┌──────────────────┐
         ▼                   │    AIModel       │
┌─────────────────┐          ├──────────────────┤
│     Asset       │          │ • id             │
│ (assets.Asset)  │◄─────────┤ • provider_id(FK)│
├─────────────────┤ ai_model │ • name           │
│ • id            │          │ • model_type     │
│ • box_id   (FK) │          │ • api_endpoint   │
│ • asset_type    │          │ • request_schema │
│ • file_url      │          │ • params_schema  │
│ • thumbnail_url │          │ • is_active      │
│ • is_favorite   │          └──────────────────┘
│ • prompt_text   │
│ • ai_model (FK) │
│ • gen_config    │
│ • seed          │
│ • created_at    │
│ • updated_at    │
└─────────────────┘
```

## Статистика

```
📦 Приложения:      6 (users, projects, boxes, assets, ai_providers, sharing)
🗄️  Модели:         8 (User, Project, Box, Asset, AIProvider, AIModel, SharedLink, Comment)
🌐 REST API:        3 (Projects, Boxes, Assets) + 2 custom actions (upload, generate)
🧪 Тесты:          100 (все проходят ✓)
📝 Миграции:        6 приложений (все применены ✓)
📊 Админка:         8 моделей зарегистрированы
🔧 Сервисы:        ~35 функций бизнес-логики
🎨 Asset типы:      2 (IMAGE, VIDEO)
⚡ Оптимизация:    select_related настроен
🔍 Админ фильтры:  вложенные FK (box__project)
🔐 Permissions:     IsOwner, IsProjectOwner, IsBoxProjectOwner
🔎 API Фильтры:    по project, box, asset_type, is_favorite
📝 Документация:   README + API_DOCS для каждого app с API
☁️  S3 Storage:     django-storages + boto3, TimeWeb S3
🔄 Celery:          Redis broker, 2 workers, async tasks
🤖 AI Generation:   Универсальная система через JSON-схемы, polling
📡 Status:          PENDING → PROCESSING → COMPLETED/FAILED
📚 AI Docs:         README.md (300+ строк) + QUICKSTART.md
```

## Django Apps структура

```
backend/
├── config/
│   ├── settings.py      [✓ все 6 apps зарегистрированы]
│   ├── urls.py          [✓ 3 API endpoints]
│   ├── asgi.py
│   └── wsgi.py
├── apps/
│   ├── users/           [✓ готово]
│   │   ├── models.py    → User
│   │   ├── admin.py
│   │   └── migrations/
│   ├── projects/        [✓ готово + REST API]
│   │   ├── models.py    → Project
│   │   ├── serializers.py → ProjectSerializer + boxes_count
│   │   ├── views.py     → ProjectViewSet + IsOwner
│   │   ├── urls.py      → DefaultRouter
│   │   ├── admin.py
│   │   ├── services.py  → 3 функции
│   │   ├── tests.py     → 6 тестов
│   │   ├── test_api.py  → 10 API тестов
│   │   ├── API_DOCS.md
│   │   └── migrations/
│   ├── boxes/           [✓ готово + REST API]
│   │   ├── models.py    → Box
│   │   ├── serializers.py → BoxSerializer + assets_count + project_name
│   │   ├── views.py     → BoxViewSet + IsProjectOwner + фильтр
│   │   ├── urls.py      → DefaultRouter
│   │   ├── admin.py     → list_editable!
│   │   ├── services.py  → 5 функций + reorder
│   │   ├── tests.py     → 9 тестов
│   │   ├── test_api.py  → 13 API тестов
│   │   ├── API_DOCS.md
│   │   └── migrations/
│   ├── assets/          [✓ готово + REST API]
│   │   ├── models.py    → Asset (IMAGE|VIDEO) + AI fields
│   │   ├── serializers.py → AssetSerializer + box_name + ai_model_name
│   │   ├── views.py     → AssetViewSet + IsBoxProjectOwner + 3 фильтра
│   │   ├── urls.py      → DefaultRouter
│   │   ├── admin.py     → list_editable + box__project filter!
│   │   ├── services.py  → 7 функций + toggle_favorite
│   │   ├── tests.py     → 13 тестов
│   │   ├── test_api.py  → 14 API тестов
│   │   ├── API_DOCS.md
│   │   └── migrations/
│   ├── ai_providers/    [✓ готово]
│   │   ├── models.py    → AIProvider + AIModel
│   │   ├── admin.py     → custom methods
│   │   ├── services.py  → build_request_from_schema
│   │   ├── tests.py     → unit тесты
│   │   └── migrations/
│   └── sharing/         [✓ готово]
│       ├── models.py    → SharedLink + Comment
│       ├── admin.py     → admin actions
│       ├── services.py  → создание ссылок, комментарии
│       ├── tests.py     → unit тесты
│       └── migrations/
└── manage.py
```

## INSTALLED_APPS

```python
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',           # ✓ для API
    'apps.users',               # ✓ User модель
    'apps.projects',            # ✓ Project модель + REST API
    'apps.boxes',               # ✓ Box модель + REST API
    'apps.assets',              # ✓ Asset модель + REST API
    'apps.ai_providers',        # ✓ AIProvider + AIModel
    'apps.sharing',             # ✓ SharedLink + Comment
]
```

## Возможности админки

### Users
- Фильтры: is_staff, is_superuser, is_active
- Поиск: username, email
- Отображение: username, email, is_staff, created_at

### Projects
- Фильтры: created_at, updated_at
- Поиск: name, user__username, user__email
- Отображение: name, user, created_at, updated_at

### Boxes
- Фильтры: project, created_at
- Поиск: name
- Отображение: name, project, order_index, created_at
- **list_editable: order_index** 🔄

### Assets
- Фильтры: asset_type, is_favorite, **box__project** 🔥
- Поиск: prompt_text
- Отображение: id, box, asset_type, is_favorite, created_at
- **list_editable: is_favorite** 🌟

## Ключевые функции сервисов

### Projects (3)
- create_project, update_project, delete_project

### Boxes (5)
- create_box, update_box, delete_box
- **reorder_boxes** (bulk update order_index)
- get_project_boxes (с select_related)

### Assets (7)
- create_asset, update_asset, delete_asset
- **toggle_favorite** (переключение избранного)
- get_box_assets (с фильтром по типу)
- get_favorite_assets (только избранные)
- Все с select_related('box', 'box__project')

## Следующие этапы (по TECHNICAL.md)

### 📋 Модели (продолжение)
- [✓] **AIProvider** - провайдеры AI (Kie.ai и др.)
- [✓] **AIModel** - модели генерации (Nano Banana, Seedance)
- [✓] **SharedLink** - публичные ссылки на проекты
- [✓] **Comment** - комментарии к боксам
- [✓] Расширение Asset:
  - [✓] source_type (GENERATED | UPLOADED | IMG2VID)
  - [✓] parent_asset_id (FK на Asset для img2vid)
  - [✓] status (PENDING | PROCESSING | COMPLETED | FAILED)
  - [✓] error_message, external_task_id
- [ ] Добавить в Box: headliner_asset_id (FK на Asset, nullable)
- [ ] **SystemConfig** - конфиг для Smart Edit

### 🔌 API (DRF) - ОСНОВА ГОТОВА ✅
- [✓] Serializers для Projects, Boxes, Assets
- [✓] ViewSets для Projects, Boxes, Assets
- [✓] Permissions (IsAuthenticated, IsOwner, IsProjectOwner, IsBoxProjectOwner)
- [✓] Endpoints:
  - [✓] Projects: /api/projects/
  - [✓] Boxes: /api/boxes/ с фильтром по project
  - [✓] Assets: /api/assets/ с фильтрами по box, type, favorite
- [✓] Custom actions:
  - [✓] POST /api/boxes/{id}/upload/ - загрузка файлов на S3
  - [✓] POST /api/boxes/{id}/generate/ - AI генерация (img2vid, image)
  - [ ] /api/boxes/{id}/reorder/ - массовое изменение порядка
  - [ ] /api/assets/{id}/favorite/ - toggle favorite
- [ ] Nested routing:
  - /api/projects/{id}/boxes/
  - /api/boxes/{id}/assets/
- [ ] Auth: /api/auth/register/, /api/auth/login/
- [ ] Pagination (PageNumberPagination)
- [ ] Поиск по полям (SearchFilter)

### 🗄️ S3 Storage ✅
- [✓] django-storages + boto3
- [✓] Загрузка файлов на TimeWeb S3
- [✓] Генерация URL для доступа
- [✓] Публичный доступ, кеширование
- [✓] Утилиты: upload_file_to_s3, detect_asset_type
- [ ] Два бакета: dev и prod (пока один)

### ⚙️ Celery ✅
- [✓] Инфраструктура Celery + Redis
- [✓] Задачи генерации (start_generation, check_generation_status)
- [✓] Retry-политика (max_retries=60)
- [✓] Логирование через warnings/logger
- [✓] Docker контейнер apom_celery

### 🎨 AI Integration ✅
- [✓] Универсальная система через AIProvider/AIModel
- [✓] Клиент для любых AI API (протестировано на Kie.ai)
- [✓] Генерация изображений (Nano Banana)
- [✓] img2vid (Seedance 1.5 Pro) ✅
- [✓] Polling результатов через check_generation_status
- [✓] Обработка ошибок и сохранение error_message
- [✓] Автоматическая загрузка результатов на S3
- [✓] Рекурсивная подстановка через substitute_variables()

### 🔄 WebSocket (Channels) - СЛЕДУЮЩИЙ ЭТАП
- [ ] Django Channels + Redis
- [ ] Consumer для проектов
- [ ] Группы: project_{id}
- [ ] События: asset_status_changed
- [ ] Аутентификация через middleware
- [ ] Real-time обновление статусов генерации

### 🔒 Authentication
- [ ] Регистрация пользователей
- [ ] JWT или Token Auth
- [ ] Logout endpoint

### 📤 Export
- [ ] Генерация .docx (python-docx)
- [ ] Экспорт проекта с хедлайнерами
- [ ] Таблица: шот, thumbnail, промпт, модель

### 🗑️ Retention Policy
- [ ] Celery Beat для периодических задач
- [ ] Удаление старых не-избранных ассетов (10 дней)
- [ ] Удаление файлов с S3

## Принципы разработки (соблюдаются ✓)

- ✅ Бизнес-логика в services.py
- ✅ Все модели с created_at, updated_at
- ✅ Русские verbose_name
- ✅ Type hints в функциях
- ✅ related_name для FK
- ✅ select_related для оптимизации
- ✅ Unit-тесты для всех сервисов
- ✅ Миграции атомарные, по фиче
- ✅ Choices с константами класса
- ✅ Документация (README) для каждого app

## Команды для проверки

```bash
# Проверка системы
docker compose exec backend python manage.py check

# Все тесты
docker compose exec backend python manage.py test
# Found 28 test(s)
# Ran 28 tests in 2.591s
# OK ✓

# Тесты конкретного приложения
docker compose exec backend python manage.py test apps.assets

# Миграции
docker compose exec backend python manage.py makemigrations
docker compose exec backend python manage.py migrate

# Shell для экспериментов
docker compose exec backend python manage.py shell

# Создание суперпользователя
docker compose exec backend python manage.py createsuperuser

# Запуск сервера
docker compose up
```

## Результаты тестирования

```
Found 100 test(s).
System check identified no issues (0 silenced).
....................................................................................................
----------------------------------------------------------------------
Ran 100 tests in 11.584s

OK ✓✓✓

Breakdown:
- apps.users:        included in base Django
- apps.projects:     6 unit tests + 10 API tests = 16 ✓
- apps.boxes:        9 unit tests + 13 API tests = 22 ✓
- apps.assets:       13 unit tests + 14 API tests = 27 ✓
- apps.ai_providers: unit tests ✓
- apps.sharing:      unit tests ✓
```

## Примеры использования

### Создание полной иерархии
```python
from apps.users.models import User
from apps.projects.services import create_project
from apps.boxes.services import create_box
from apps.assets.services import create_asset
from apps.assets.models import Asset

# Пользователь
user = User.objects.get(username='john')

# Проект
project = create_project(user=user, name='My Video Project')

# Боксы
box1 = create_box(project=project, name='Scene 1', order_index=0)
box2 = create_box(project=project, name='Scene 2', order_index=1)

# Ассеты
image1 = create_asset(
    box=box1,
    asset_type=Asset.ASSET_TYPE_IMAGE,
    file_url='https://s3.example.com/image1.jpg',
    prompt_text='A beautiful sunset',
    is_favorite=True
)

video1 = create_asset(
    box=box1,
    asset_type=Asset.ASSET_TYPE_VIDEO,
    file_url='https://s3.example.com/video1.mp4'
)

# Получение данных
project_boxes = project.boxes.all()  # related_name
box_assets = box1.assets.filter(asset_type=Asset.ASSET_TYPE_IMAGE)
```

### Быстрая работа с избранным
```python
from apps.assets.services import toggle_favorite, get_favorite_assets

# Переключение
toggle_favorite(image1)  # is_favorite = False
toggle_favorite(image1)  # is_favorite = True

# Получение всех избранных
favorites = get_favorite_assets(box1)
```

---

**Последнее обновление:** 08.02.2026, 20:30  
**Этап:** ✅ AI Generation System (универсальная система генерации)  
**Следующий шаг:** WebSocket (Channels) для real-time обновлений  
**Общий прогресс:** ~65% (базовые модели + API + S3 + Celery + AI генерация готовы)
