# Карта модулей — Раскадровка

> Куда смотреть при проблемах и где добавлять новые фичи.

## Быстрая навигация по проблемам

| Проблема | Модуль | Файл |
|----------|--------|------|
| Генерация не запускается | elements | `orchestration.py` |
| Генерация зависла / не завершается | elements | `tasks.py` + `generation.py` |
| Неправильно списались кредиты | credits | `services.py` |
| Цена рассчиталась неверно | ai_providers | `services.py` → `compiler.py` |
| Файл не загрузился в S3 | storage | `s3.py` |
| Presigned URL не работает | storage | `presigned.py` |
| Thumbnail не генерируется | storage | `thumbnails.py` |
| Нет real-time уведомления | notifications | `services.py` |
| Модель отвечает неправильно | ai_providers | `response_mapping` на модели |
| Ошибка при аплоаде файла | elements | `orchestration.py` → storage |
| Шеринг не работает | sharing | `views.py` |
| Проблема с авторизацией | users | `views.py` + permissions |

## Архитектура модулей

```
TIER 0 — Инфраструктура (0 доменных зависимостей)
├── storage/           S3, presigned URLs, thumbnails, файл-валидация
│   ├── s3.py          upload, delete, staging, detect_element_type
│   ├── presigned.py   presigned URLs, head_s3_object, get_public_url
│   ├── thumbnails.py  Pillow resize, ffmpeg video frames
│   └── services.py    ← ПУБЛИЧНЫЙ ВХОД (импортируй отсюда)
│
└── notifications/     WebSocket уведомления
    └── services.py    notify_element_status()

TIER 1 — Leaf-модули (0 внутренних зависимостей)
├── users/             User, UserQuota, JWT auth
│   └── views.py       RegisterView, MeView
│
└── ai_providers/      AIProvider, AIModel, параметры, pricing
    ├── models.py      AIModel, CanonicalParameter, ModelParameterBinding
    ├── compiler.py    compile_parameters_schema, compile_pricing_payload
    ├── validators.py  validate_model_admin_config
    └── services.py    ← ПУБЛИЧНЫЙ ВХОД
                       substitute_variables, build_generation_context,
                       compile_pricing_payload, validate_model_admin_config

TIER 2 — Зависят от T0-1
├── credits/           "Банк": баланс, дебит, рефунд, оценка
│   ├── models.py      CreditsTransaction (журнал)
│   └── services.py    ← ПУБЛИЧНЫЙ ВХОД
│                      CreditsService: debit, refund, estimate, topup
│
└── projects/          Project CRUD
    └── views.py       ProjectViewSet + generate/upload/presign actions

TIER 3 — Зависят от T0-2
├── elements/          Element CRUD + оркестрация
│   ├── models.py      Element
│   ├── services.py    CRUD: create, update, toggle_favorite, reorder
│   ├── orchestration.py  create_generation(), create_upload()
│   ├── generation.py  finalize_success/failure, normalize_provider_response
│   ├── tasks.py       Celery: start_generation, check_status, process_upload
│   ├── views.py       ElementViewSet
│   ├── views_upload.py   upload_complete (presigned flow)
│   └── views_webhook.py  generation_callback_view (Kie.ai webhook)
│
├── scenes/            Scene (Group) CRUD, reorder
│   └── views.py       SceneViewSet + generate/upload/presign actions
│
└── sharing/           Публичные ссылки, комментарии
    └── views.py       SharedLinkViewSet, PublicProjectView
```

## Правило модулей

**Каждый модуль общается с другими только через `services.py`.**

```
✅ from apps.storage.services import upload_staging_to_s3
✅ from apps.credits.services import CreditsService
✅ from apps.ai_providers.services import compile_pricing_payload

❌ from apps.storage.s3 import upload_staging_to_s3         (внутренний файл)
❌ from apps.ai_providers.compiler import compile_pricing_payload  (внутренний файл)
```

Исключение: модели (`models.py`) можно импортировать напрямую для FK/queries.

## Flow: Генерация

```
Frontend → POST /api/scenes/{id}/generate/
  → scenes/views.py → elements/orchestration.py::create_generation()
    → credits/services.py::debit_for_generation()
    → Element.objects.create(status=PENDING)
    → Celery: elements/tasks.py::start_generation()
      → ai_providers/services.py::build_generation_context()
      → ai_providers/services.py::substitute_variables()
      → POST to provider
      → Celery: check_generation_status() (poll каждые 10с)
        → elements/generation.py::normalize_provider_response()
        → elements/generation.py::finalize_generation_success()
          → storage/services.py::upload_staging_to_s3()
          → storage/services.py::generate_thumbnails()
          → notifications/services.py::notify_element_status()
```

## Flow: Upload

```
Frontend → POST /api/scenes/{id}/upload/
  → scenes/views.py → elements/orchestration.py::create_upload()
    → storage/services.py::validate_file_type()
    → storage/services.py::save_to_staging()
    → Element.objects.create(status=PROCESSING)
    → Celery: elements/tasks.py::process_uploaded_file()
      → storage/services.py::upload_staging_to_s3()
      → storage/services.py::generate_thumbnails()
      → notifications/services.py::notify_element_status()
```

## Куда добавлять новые фичи

| Фича | Куда |
|------|------|
| Новый AI-провайдер | `ai_providers/` — AIProvider + AIModel + response_mapping |
| Новый тип файла | `storage/s3.py` — расширения + content types |
| Новый параметр генерации | `ai_providers/` — CanonicalParameter + ModelParameterBinding |
| Биллинг (оплата) | `credits/services.py` — добавить PaymentService, вызывает topup() |
| Личный кабинет | Новый app `accounts/` или расширить `users/` |
| Новый тип уведомления | `notifications/services.py` |
| Аналитика | Новый app `analytics/` — читает из CreditsTransaction + Element |

## Tech debt после рефакторинга

Эти пункты не блокируют работу — всё функционирует. Чистить при случае.

| # | Что | Приоритет | Описание |
|---|-----|-----------|----------|
| 1 | Удалить стабы обратной совместимости | Низкий | `scenes/s3_utils.py`, `common/presigned.py`, `common/thumbnail_utils.py`, `common/generation.py` — сейчас просто re-export из новых модулей. Убедиться что в проде ок → удалить |
| 2 | Транзакционные границы в orchestration.py | Средний | `debit_for_generation()` вызывается ДО `transaction.atomic()`. Если создание элемента упадёт — debit уже списан, рефунд через except. Правильнее: обернуть debit + create в один atomic. Нужно аккуратное тестирование |
| 3 | Подключить import-linter | Низкий | Автоматическая проверка на CI, что модули не импортируют внутренности друг друга (только через `services.py`). Пока это дисциплина, не автоматика |
| 4 | Вынести presign-логику из views | Низкий | `scenes/views.py::presign` и `projects/views.py::presign` дублируют создание Element в UPLOADING статусе. Можно вынести в `orchestration.py::create_presigned_upload()` |
