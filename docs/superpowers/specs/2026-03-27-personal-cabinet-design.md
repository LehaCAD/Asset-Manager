# Личный кабинет — Спецификация

## Обзор

Личный кабинет пользователя: аналитика, журнал генераций, баланс, хранилище, уведомления (заглушка), настройки. Изолирован как отдельный route group + Django app — удаляется в один клик.

## Архитектура

### Backend: `apps/cabinet` (TIER 3 — read-only)

```
backend/apps/cabinet/
├── __init__.py
├── apps.py
├── services.py        — PUBLIC INTERFACE (frozen dataclasses)
├── views.py           — thin dispatch → services
├── serializers.py     — DRF response serializers
└── urls.py            — /api/cabinet/*
```

Не создаёт своих моделей. Читает из: `CreditsTransaction`, `Element`, `Project`, `AIModel`, `User`, `UserQuota`.

### Frontend: `app/(workspace)/cabinet/`

```
frontend/app/(workspace)/cabinet/
├── layout.tsx              — sidebar nav + content area
├── page.tsx                — redirect → analytics
├── analytics/page.tsx      — bar charts + summary cards
├── history/page.tsx        — журнал генераций (таблица)
├── balance/page.tsx        — баланс + транзакции
├── storage/page.tsx        — хранилище по проектам
├── notifications/page.tsx  — заглушка
└── settings/page.tsx       — профиль + пароль + тема

frontend/lib/api/cabinet.ts    — API client
frontend/lib/store/cabinet.ts  — Zustand store
frontend/lib/types/index.ts    — новые типы (extend)
frontend/components/cabinet/   — компоненты кабинета
```

Новая зависимость: `recharts` (bar charts).

## API Endpoints

### GET /api/cabinet/analytics/

Query: `?period=30d&ai_model_id=&element_type=`

```python
@dataclass(frozen=True)
class AnalyticsResult:
    period_start: date
    period_end: date
    balance: Decimal
    total_spent: Decimal
    total_generations: int
    success_rate: float
    storage_used_bytes: int
    storage_limit_bytes: int
    spending_by_day: list[DaySpending]     # [{date, amount, count}]
    spending_by_model: list[ModelSpending]  # [{model_name, amount, count}]
    spending_by_project: list[ProjectSpending]
    generation_stats: GenerationStats
```

Гранулярность: period ≤ 31d → дни, ≤ 90d → недели, > 90d → месяцы.

### GET /api/cabinet/history/

Query: `?page=1&page_size=20&status=&ai_model_id=&source_type=&element_type=&project_id=&date_from=&date_to=&ordering=-created_at`

Пагинированный список элементов с аннотированной стоимостью. Каждая запись:
- id, created_at, element_type, source_type, status, error_message
- ai_model_name, prompt_text (truncated 100 chars), generation_config
- file_size, generation_cost, project_name, project_id
- thumbnail_url (для превью)

### GET /api/cabinet/transactions/

Query: `?page=1&page_size=20&reason=&date_from=&date_to=`

Пагинированный список CreditsTransaction:
- id, created_at, reason, reason_display, amount, balance_after
- ai_model_name (из metadata), element_id

### GET /api/cabinet/storage/

```python
@dataclass(frozen=True)
class StorageResult:
    storage_used_bytes: int
    storage_limit_bytes: int
    by_project: list[ProjectStorage]  # [{project_id, name, elements_count, bytes}]
```

### POST /api/auth/me/password/

В users app: `{current_password, new_password}` → 200/400.

## UI Детали

### Аналитика
- 4 summary cards: баланс, потрачено, генераций, хранилище %
- Bar chart (recharts BarChart): столбики трат по дням
- Фильтры: период (7d/30d/90d/all/custom), модель (dropdown), тип (все/image/video)
- При выборе модели — все данные фильтруются относительно неё
- Два horizontal bar breakdown: по моделям, по проектам

### Журнал генераций
- Таблица с колонками: дата, тип, модель, промпт, статус (badge), стоимость, размер, проект
- Фильтры: статус, модель, тип, проект, период
- Сортировка по дате (desc)
- Клик по строке → навигация к проекту

### Баланс
- Большая карточка баланса + ставка
- Кнопка "Пополнить" (disabled)
- Таблица транзакций с фильтрами по типу и периоду

### Хранилище
- Progress bar использования
- Таблица проектов: название, файлов, объём, % лимита

### Уведомления
- Табы: Все / Комментарии / Генерации
- Empty state: "Уведомления появятся когда будет подключён шеринг"
- Подготовка к будущим Comment и SharedLink уведомлениям

### Настройки
- Профиль: имя (editable), email (read-only), дата регистрации
- Смена пароля: текущий + новый
- Тема: тёмная/светлая/системная
- Удаление аккаунта: **серая disabled кнопка** с tooltip "Скоро"

## Зависимости

- recharts (frontend, в package.json → docker rebuild)
- Никаких новых Python-зависимостей
