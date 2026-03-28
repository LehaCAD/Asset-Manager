# Личный кабинет — Handoff

> Что было сделано, где лежит, как удалить, что доделать.

## Что реализовано

Полный личный кабинет пользователя с 6 страницами, изолированный в отдельный route + Django app.

### Backend: `backend/apps/cabinet/`

**Новый Django app (TIER 3, read-only).** Не имеет своих моделей — только агрегирует данные из других apps.

| Файл | Назначение |
|------|-----------|
| `services.py` | Public interface. Frozen dataclasses: `AnalyticsResult`, `StorageResult`, `HistoryEntry`, `TransactionEntry`. Функции: `get_analytics()`, `get_storage()`, `get_history_queryset()`, `get_transactions_queryset()` |
| `views.py` | Thin HTTP dispatch → services. 4 endpoints |
| `urls.py` | Роуты под `/api/cabinet/` |
| `apps.py` | Django AppConfig |

**API endpoints:**

| Endpoint | Метод | Что делает |
|----------|-------|-----------|
| `GET /api/cabinet/analytics/` | GET | Агрегация: summary + spending by day (bar chart) + by model + by project. Фильтры: `period`, `ai_model_id`, `element_type` |
| `GET /api/cabinet/history/` | GET | Журнал генераций — пагинированные Element'ы с cost annotation. Фильтры: `status`, `ai_model_id`, `source_type`, `element_type`, `project_id`, `date_from`, `date_to` |
| `GET /api/cabinet/transactions/` | GET | Пагинированные CreditsTransaction. Фильтры: `reason`, `date_from`, `date_to` |
| `GET /api/cabinet/storage/` | GET | Использование хранилища с разбивкой по проектам |

**Также добавлено в `backend/apps/users/`:**
- `POST /api/auth/me/password/` — смена пароля (current + new)

**Регистрация:**
- `config/settings.py` → `INSTALLED_APPS` += `apps.cabinet`
- `config/urls.py` → `path('api/cabinet/', include('apps.cabinet.urls'))`

### Frontend: `app/(workspace)/cabinet/`

| Файл | Страница |
|------|----------|
| `cabinet/layout.tsx` | Sidebar навигация (6 пунктов с Lucide иконками) |
| `cabinet/page.tsx` | Redirect → `/cabinet/analytics` |
| `cabinet/analytics/page.tsx` | Bar chart (recharts), 4 summary cards, фильтры по периоду/модели, breakdowns по моделям и проектам |
| `cabinet/history/page.tsx` | Таблица генераций: дата, тип, модель, промпт, статус (badge), стоимость, размер, проект. Фильтры + пагинация |
| `cabinet/balance/page.tsx` | Карточка баланса, ставка, "Пополнить" (disabled), таблица транзакций с фильтрами |
| `cabinet/storage/page.tsx` | Progress bar + таблица проектов по объёму |
| `cabinet/notifications/page.tsx` | Заглушка: табы (Все/Комментарии/Генерации), empty state с BellOff иконкой |
| `cabinet/settings/page.tsx` | Профиль (имя editable, email read-only), смена пароля, тема (dark/light/system), удаление аккаунта (серая disabled кнопка) |

**Инфраструктура:**
- `lib/api/cabinet.ts` — API клиент (getAnalytics, getHistory, getTransactions, getStorage, changePassword)
- `lib/types/index.ts` — типы `CabinetAnalytics`, `CabinetHistoryEntry`, `CabinetTransaction`, `CabinetStorage`
- `components/layout/Navbar.tsx` — добавлена ссылка "Личный кабинет" в dropdown

**Зависимости:**
- `recharts@2.15.x` добавлен в `package.json`

## Как удалить (в один клик)

**Frontend:**
1. Удалить `frontend/app/(workspace)/cabinet/`
2. Убрать ссылку из `components/layout/Navbar.tsx` (DropdownMenuItem с `/cabinet`)
3. Убрать типы `Cabinet*` из `lib/types/index.ts`
4. Удалить `lib/api/cabinet.ts`
5. (Опционально) удалить recharts из package.json

**Backend:**
1. Удалить `backend/apps/cabinet/`
2. Убрать `'apps.cabinet'` из `config/settings.py` INSTALLED_APPS
3. Убрать `path('api/cabinet/', ...)` из `config/urls.py`
4. (Опционально) убрать `change_password_view` из users

## Что НЕ реализовано / TODO

| Фича | Статус | Комментарий |
|------|--------|-------------|
| Уведомления | Заглушка | UI готов, бэкенд нужен после реализации шеринга/комментариев |
| Удаление аккаунта | Серая кнопка | Disabled, tooltip "Скоро" |
| Пополнение баланса | Серая кнопка | Ожидает подключения биллинга |
| Аватар пользователя | Нет | Нужно новое поле в User + S3 upload |
| Custom date range picker | Нет | Пока только preset периоды (7d/30d/90d/all) |
| Recharts responsive | Базовый | ResponsiveContainer есть, но не тестировалось на мобильных |
| Тесты | Нет | Нужны unit-тесты для services.py |

## Дизайн-макеты

Все 5 экранов отрисованы в pen-файле:
- `pen/pencil-new.pen` → фрейм `oMZqU` (node "Личный кабинет")
- Экраны: Аналитика, Баланс, Профиль, Хранилище, Настройки
- Каждый с sidebar и разной активной вкладкой

## Документация

- `docs/research/personal-cabinet-design.md` — ресёрч конкурентов + проектирование
- `docs/superpowers/specs/2026-03-27-personal-cabinet-design.md` — спецификация
- `docs/superpowers/plans/2026-03-27-personal-cabinet.md` — план реализации
