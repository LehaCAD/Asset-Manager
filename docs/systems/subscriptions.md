# Подписки и feature gating

> Актуальное состояние подсистемы. Обновлять при внесении изменений.
> Последнее обновление: 2026-04-17

---

## Назначение

Система тарифных планов с feature gating. Пользователь видит заблокированные фичи с предложением апгрейда. Администратор управляет тарифами, фичами и подписками через Django Admin.

## Приложение

`backend/apps/subscriptions/`

## Модели

### Plan (Тарифный план)

Файл: `backend/apps/subscriptions/models.py`

| Поле | Тип | Назначение |
|------|-----|------------|
| `code` | CharField, unique | Идентификатор (`free`, `creator`, `creator_pro`, `team`, `enterprise`) |
| `name` | CharField | Название для пользователя |
| `price` | DecimalField | Цена ₽/мес |
| `credits_per_month` | IntegerField | Кадров при автоматической оплате (0 = не начисляются) |
| `max_projects` | IntegerField | Лимит проектов (0 = безлимит) |
| `max_scenes_per_project` | IntegerField | **Не используется** (оставлено для обратной совместимости) |
| `storage_limit_gb` | IntegerField | Хранилище в ГБ (0 = безлимит) |
| `features` | ManyToMany → Feature | Бинарные фичи, включённые в тариф |
| `is_default` | BooleanField | Тариф для новых пользователей (только один) |
| `is_recommended` | BooleanField | Подсвечивается на странице тарифов |
| `is_trial_reference` | BooleanField | Используется как план во время триала (только один) |
| `is_active` | BooleanField | Отображается на фронтенде |
| `display_order` | IntegerField | Порядок отображения |

Свойство `storage_limit_bytes` — конвертирует ГБ в байты для обратной совместимости.

`save()` автоматически снимает `is_default` / `is_trial_reference` с других планов.

### Feature (Фича)

| Поле | Тип | Назначение |
|------|-----|------------|
| `code` | CharField, unique | Идентификатор (`sharing`, `batch_download`, `ai_prompt`, `analytics_export`) |
| `title` | CharField | Заголовок в модалке апгрейда |
| `description` | TextField | Описание в модалке |
| `icon` | CharField | Имя иконки Lucide |
| `min_plan` | FK → Plan | Минимальный тариф (для лейбла «Доступно начиная с...») |

### Subscription (Подписка)

| Поле | Тип | Назначение |
|------|-----|------------|
| `user` | OneToOne → User | Один юзер = одна подписка |
| `plan` | FK → Plan | Текущий тариф |
| `status` | CharField | `active`, `trial`, `expired`, `cancelled` |
| `started_at` | DateTimeField | Начало периода |
| `expires_at` | DateTimeField | Конец периода |
| `cancelled_at` | DateTimeField, null | Дата отмены |

Свойства: `is_trial` (bool), `trial_days_left` (int или None).

## Текущие тарифы

| Код | Название | Цена | Проекты | Хранилище | Фичи |
|-----|----------|------|---------|-----------|-------|
| `free` | Старт | 0 ₽ | 1 | 1 ГБ | — |
| `creator` | Создатель | 990 ₽ | 5 | 20 ГБ | Доступ по ссылке |
| `creator_pro` | Создатель Pro | 1 990 ₽ | ∞ | 100 ГБ | + Массовое скачивание, Усиление промпта |
| `team` | Команда | 4 990 ₽ | ∞ | 500 ГБ | + Экспорт аналитики |
| `enterprise` | Корпоративный | — | ∞ | ∞ | Все (скрыт) |

## Сервис

`backend/apps/subscriptions/services.py` — `SubscriptionService`

Единая точка входа для всех проверок. Все методы — `@staticmethod`.

| Метод | Назначение |
|-------|------------|
| `get_active_plan(user)` | Текущий план. Ленивая проверка истечения встроена. |
| `has_feature(user, code)` | Есть ли фича у пользователя |
| `can_create_project(user)` | Не превышен ли лимит проектов |
| `can_create_scene(user, project)` | Всегда `True` (лимит убран) |
| `check_storage(user)` | Не заполнено ли хранилище |
| `get_limits(user)` | Все лимиты + usage (для сериализатора) |
| `get_feature_gate_info(code)` | Данные для модалки апгрейда |

### Ленивая проверка истечения

Встроена в `get_active_plan()`. Если `expires_at <= now()`:
- Статус меняется на `expired`
- План откатывается на дефолтный
- Сохраняется в БД

Celery Beat не нужен — проверка при каждом обращении.

### Триал

При регистрации:
1. Создаётся `Subscription(plan=free, status='trial', expires_at=+7 дней)`
2. Начисляется 50 бонусных Кадров (`CreditsService.topup`, reason=`trial_bonus`)

Во время триала `get_active_plan()` возвращает план с `is_trial_reference=True` (Pro).
После истечения — откат на Старт. Кадры не сгорают.

## Enforcement (бэкенд)

| Где | Проверка | Файл |
|-----|----------|------|
| Создание проекта | `can_create_project()` | `projects/views.py` |
| Создание группы | ~~`can_create_scene()`~~ — **убрано** | — |
| Создание shared link | `has_feature('sharing')` | `sharing/views.py` |
| Массовое скачивание | `has_feature('batch_download')` | `elements/views.py` → `download_meta` |
| Генерация | `check_storage()` → HTTP 403 если заполнено | `elements/orchestration.py` |
| Upload | `check_storage()` → HTTP 403 если заполнено | `elements/orchestration.py` |
| Presign | `check_storage()` | `projects/views.py`, `scenes/views.py` |

Паттерн для фич: `FeatureGatePermission` — DRF permission class.
Фабрика: `feature_required('sharing')` создаёт permission class.

## API

| Endpoint | Метод | Авторизация | Назначение |
|----------|-------|-------------|------------|
| `/api/subscriptions/plans/` | GET | AllowAny | Список активных тарифов для /pricing |
| `/api/subscriptions/feature-gate/{code}/` | GET | IsAuthenticated | Данные для модалки апгрейда |

Подписка также доступна в `/api/auth/me/` как поле `subscription`:
```json
{
  "subscription": {
    "plan_code": "creator_pro",
    "plan_name": "Создатель Pro",
    "status": "active",
    "features": ["sharing", "batch_download", "ai_prompt"],
    "is_trial": false,
    "trial_days_left": null
  }
}
```

`plan_code` и `plan_name` — `SerializerMethodField`, вызывают `get_active_plan()`. Пользователь на триале видит имя триального плана (`is_trial_reference=True`), а не «Старт».

`features` возвращает `list[str]` — только коды фич (`["sharing", "batch_download"]`), без объектов с title/description/icon.

Внутренний `_get_active_plan()` кешируется на время сериализации, чтобы избежать нескольких запросов к БД.

`UserSerializer.get_subscription()` явно ловит `Subscription.DoesNotExist` (вместо широкого `Exception`).

Поле `quota` вычисляется из Plan (UserQuota удалена).

## Django Admin

Файл: `backend/apps/subscriptions/admin.py`

Три раздела в «Подписки и тарифы»:

- **Тарифные планы** — таблица с бейджами, 4 fieldset-а, list_editable для порядка
- **Фичи** — редактирование текстов модалок
- **Подписки** — управление подписками пользователей. Быстрые действия:
  - Назначить Создатель Pro на 30 дней
  - Продлить на 30 дней
  - Сбросить на Старт

CSS: `backend/static/admin/subscriptions/subscriptions_admin.css`

**Все быстрые действия используют `.save()` для каждой подписки** (не `queryset.update()`), чтобы срабатывал `post_save` сигнал и уходило WebSocket-уведомление.

## Real-time обновление подписки

При смене тарифа (через Django Admin или API) фронтенд получает уведомление мгновенно через WebSocket.

### Поток данных

```
Admin меняет тариф → Subscription.save()
  → post_save signal (apps/subscriptions/signals.py)
  → channel_layer.group_send('user_{id}', {type: 'subscription_changed', ...})
  → NotificationConsumer.subscription_changed() (apps/notifications/consumers.py)
  → WebSocket → frontend notification-ws.ts
  → authApi.getMe() → setUser() → subscriptionStore обновлён
  → toast «Тариф обновлён: {название}»
```

### Файлы

| Файл | Роль |
|------|------|
| `backend/apps/subscriptions/signals.py` | `post_save` на `Subscription` → WS-уведомление |
| `backend/apps/subscriptions/apps.py` | `ready()` импортирует signals |
| `backend/apps/notifications/consumers.py` | Handler `subscription_changed` |
| `frontend/lib/api/notification-ws.ts` | Обработка `subscription_changed` → `getMe()` |

---

## Страница тарифов (/pricing)

Файл: `frontend/app/(pricing)/pricing/page.tsx`

Отдельная route group `(pricing)` с layout без Navbar (`frontend/app/(pricing)/layout.tsx`).

### Структура карточки (PlanCard)

```
[Баннер: «Ваш тариф» / «Лучший выбор»]  ← выступает над карточкой
┌─────────────────────────────────────┐
│  [Пробный период]                   │  ← статус (если trial)
│        Создатель PRO                │  ← название + inline tier pill
│                                     │
│        ₽ 1 990 /мес                 │  ← цена по центру
│                                     │
│      [ Подключить ]                 │  ← gradient кнопка
│                                     │
│  КОМУ ПОДОЙДЁТ                      │
│  Для профессионалов и ...           │  ← фиксированная высота 2 строки
│                                     │
│  ┌─ фичи ─────────────────────┐    │
│  │ ✓ Безлимит проектов        │    │  ← rounded bg контейнер
│  │ ✓ 100 ГБ хранилища        │    │
│  │ ✓ Усиление промпта        │    │
│  └────────────────────────────┘    │
└─────────────────────────────────────┘
```

### Логика баннеров

| Ситуация | Баннер | Цвет |
|----------|--------|------|
| Это текущий тариф | «Ваш тариф» | Зелёный gradient |
| Рекомендованный И ранг выше текущего | «Лучший выбор» | Фиолетовый gradient + glow |
| Рекомендованный НО ранг ≤ текущего | Нет баннера | — |
| Все остальные | Нет баннера | — |

### Логика кнопок

| Ситуация | Текст кнопки | Состояние |
|----------|-------------|-----------|
| Текущий тариф | «Текущий тариф» | disabled |
| Тариф ниже текущего | «Включён в ваш тариф» | disabled |
| Бесплатный, нет текущего | «Начать бесплатно» | active |
| Платный, выше текущего | «Подключить» | active + gradient |

### Ранги планов

```
free: 0 → creator: 1 → creator_pro: 2 → team: 3
```

### Tier-бейджи в названиях

Inline pill на baseline текста: «Создатель **PLUS**», «Создатель **PRO**», «Команда **TEAM**». Стиль: `from-indigo-500 to-violet-500`, white bold, rounded-full.

### Glow

Через CSS `filter: drop-shadow()` на обёртке карточки — единый glow покрывает и баннер, и тело карточки.

---

## Feature Gating — UI

### Философия

1. Кнопки **НЕ серые, НЕ disabled** — нормальный цвет, нормальный текст
2. **Показать + пометить** — фичи не прячем, бейдж + модалка при клике
3. **Тон позитивный** — «доступно на тарифе X», фиолетовый (#8B7CF7), без красного/жёлтого
4. Референс: Canva (показать + пометить), не Midjourney (скрыть)

### Архитектура гейтинга (frontend)

Три слоя:

```
TierBadge (визуал)          — градиентный pill PLUS/PRO/TEAM
useFeatureGate(code) (хук)  — логика: isLocked, tier, openUpgrade(), modal state
FeatureGate (обёртка)       — удобная обёртка для простых случаев
```

### Стор

`frontend/lib/store/subscription.ts` — `useSubscriptionStore`

Синхронизируется из `user.subscription` при авторизации. Основной хелпер: `hasFeature(code)`.

### Компоненты

| Компонент | Путь | Назначение |
|-----------|------|------------|
| `TierBadge` | `components/subscription/TierBadge.tsx` | Градиентный pill (PLUS/PRO/TEAM) или Glow Ring ↑ |
| `FeatureGate` | `components/subscription/FeatureGate.tsx` | Обёртка: если фича заблокирована — нормальный вид + TierBadge + клик → UpgradeModal |
| `LimitBar` | `components/subscription/LimitBar.tsx` | Прогресс-бар лимита (всегда фиолетовый) |
| `UpgradeModal` | `components/subscription/UpgradeModal.tsx` | Модалка апгрейда (два режима: feature + limit) |
| `SubscriptionStatusBanner` | `components/subscription/SubscriptionStatusBanner.tsx` | Постоянная полоса статуса подписки поверх workspace/cabinet. Скрыта для активных платных тарифов; показывается для free / trial / expired / cancelled с CTA в `/pricing` |

### Хук `useFeatureGate`

`frontend/lib/hooks/useFeatureGate.ts`

```ts
const gate = useFeatureGate("sharing");
// gate.isLocked — заблокировано ли
// gate.tier — "plus" | "pro" | "team"
// gate.openUpgrade() — открыть модалку
// gate.upgradeOpen / gate.setUpgradeOpen — для <UpgradeModal>
// gate.handleClick(e?) — перехватить клик если заблокировано
```

Используется для кастомных layout-ов (dropdown items, toggles), где `<FeatureGate>` обёртка не подходит.

### TierBadge

Градиентный pill с текстом тарифа:

| Tier | Текст | Когда |
|------|-------|-------|
| `plus` | PLUS | Фичи тарифа Создатель (sharing) |
| `pro` | PRO | Фичи тарифа Создатель Pro (batch_download, ai_prompt) |
| `team` | TEAM | Фичи тарифа Команда (analytics_export) |

Стиль: градиент `from-indigo-500 to-violet-500`, 9px bold white, pill 18px.
Резервный вариант `variant="icon"`: Glow Ring со стрелкой ↑ (когда pill не помещается).

Маппинг feature → tier статический в `TierBadge.tsx` (`FEATURE_TIER_MAP`).

### Где используется гейтинг

| Место | Файл | Паттерн | Что проверяет |
|-------|------|---------|---------------|
| GroupCard → «Поделиться» | `components/element/GroupCard.tsx` | `useFeatureGate("sharing")` + TierBadge | feature `sharing` |
| GroupCard → «Скачать» | `components/element/GroupCard.tsx` | `useFeatureGate("batch_download")` + TierBadge | feature `batch_download` |
| ProjectCard → «Поделиться» | `components/project/ProjectCard.tsx` | `useFeatureGate("sharing")` + TierBadge | feature `sharing` |
| ProjectCard → «Скачать» | `components/project/ProjectCard.tsx` | `useFeatureGate("batch_download")` + TierBadge | feature `batch_download` |
| ElementBulkBar → «Поделиться» | `components/element/ElementBulkBar.tsx` | `<FeatureGate feature="sharing">` | feature `sharing` |
| ElementBulkBar → «Скачать» | `components/element/ElementBulkBar.tsx` | `<FeatureGate feature="batch_download">` | feature `batch_download` |
| PromptEnhanceToggle | `components/generation/PromptEnhanceToggle.tsx` | `useFeatureGate("ai_prompt")` + TierBadge | feature `ai_prompt` |
| ProjectGrid → «Создать проект» | `components/project/ProjectGrid.tsx` | quota check + TierBadge + UpgradeModal (limit mode) | `max_projects` |
| DetailPanel → «Повторить запрос» | `components/lightbox/DetailPanel.tsx` | quota check + TierBadge + UpgradeModal (limit mode) | `storage_limit` |

### Страница /pricing

`frontend/app/(workspace)/pricing/page.tsx` — полноценная страница тарифов:

- 4 карточки тарифов в адаптивной сетке (1/2/4 колонки)
- Бейджи: «Рекомендуем» / «Ваш тариф» / «Пробный период»
- CTA-кнопки (градиентная — для рекомендованного плана)
- Баннер Enterprise («Свяжитесь с нами»)
- Сравнительная таблица под карточками
- Информационные плашки: «Все модели доступны на любом тарифе», «7 дней + 50 Кадров»
- 0 в значениях лимитов везде отображается как «∞»

### Страница /cabinet/subscription

`frontend/app/(cabinet)/cabinet/subscription/page.tsx` — управление подпиской в кабинете:

- Карточка текущего тарифа (название, цена, статус, дата следующего списания)
- Бейджи статуса: Активна / X дней осталось / Бесплатно / Истекла / Отменена
- Прогресс-бар пробного периода (использует `trial_total_days` из API, не хардкод)
- Usage-метрики: проекты, хранилище (из `user.quota`) с прогресс-барами
- Полный список функций: доступные (✓ зелёный) и заблокированные (🔒 затемнённые) с описаниями и TierBadge
- Feature tier определяется динамически из plans API через `inferFeatureTier()`
- CTA: «Сменить тариф» (для платных) / «Подключить тариф» (для остальных) → redirect на `/pricing`
- Ссылка «Сравнить все тарифы» → `/pricing`

Данные: `useSubscriptionStore` (включая `trialTotalDays`), `useAuthStore` → `user.quota`, `subscriptionsApi.getPlans()`

Sidebar: пункт «Подписка» (иконка `CircleCheckBig`) в группе «Оплата», перед «Платежи».

### SubscriptionStatusBanner — постоянная полоса статуса

`frontend/components/subscription/SubscriptionStatusBanner.tsx`

Тонкая (≈32 px) полоса поверх всех рабочих областей (`(workspace)/layout.tsx` и `(cabinet)/layout.tsx`). Всегда показывает пользователю его текущий статус и CTA на `/pricing`.

| Состояние | Текст (desktop) | Короткий текст (mobile) | CTA |
|-----------|-----------------|-------------------------|-----|
| `is_trial=true` | «Пробная подписка «X» — осталось N дн. После — тариф «Старт».» | «Пробный «X» · N дней» | Выбрать тариф |
| `status='expired'` | «Пробный период завершён — вы на тарифе «Старт». Выберите тариф, чтобы вернуть полные возможности.» | «Пробный завершён · «Старт»» | Выбрать тариф |
| `status='cancelled'` | «Тариф «X» отменён и действует до окончания периода. Возобновите подписку, чтобы сохранить доступ.» | «Тариф «X» отменён» | Возобновить |
| active + `plan_code='free'` | «У вас тариф «Старт». Некоторые функции могут быть ограничены.» | «Тариф «Старт»» | Выбрать тариф |
| active + paid plan | не отображается | — | — |

Скрыт на `/pricing/*` (не дублируем CTA на самой странице тарифов).

Имя плана берётся из `subscription.plan_name` (на триале это имя `is_trial_reference` плана). Имя «Старт» зашито как константа для fallback-сценариев (ожидается, что `is_default` — это бесплатный план с именем «Старт»).

### Конфигурация триала

Параметры триала настраиваются через Django Admin на плане с `is_trial_reference=True`:

| Поле | Тип | Назначение |
|------|-----|------------|
| `trial_duration_days` | PositiveIntegerField, default=7 | Длительность пробного периода |
| `trial_bonus_credits` | DecimalField, default=50 | Бонусные кадры при регистрации (0 = не начислять) |

Сигнал `create_user_subscription` читает эти значения из триал-референс плана. API отдаёт `trial_total_days` — вычисляется из `expires_at - started_at`.

---

## Цветовая схема ограничений

- **Фиолетовый** (primary) — бейджи TierBadge, кнопки апгрейда, прогресс-бар
- Кнопки **не серые** — нормальный стиль + бейдж при ограничении

Красный, оранжевый — не используются. Тон позитивный.

## Названия фич (русский)

| Код | Название | Лейбл кнопки |
|-----|----------|--------------|
| `sharing` | Доступ по ссылке | Поделиться |
| `batch_download` | Массовое скачивание | Скачать |
| `ai_prompt` | Усиление промпта | Улучшить промпт |
| `analytics_export` | Экспорт аналитики | Экспорт |

## Тесты

`backend/apps/subscriptions/tests/` — 111 тестов:

| Файл | Кол-во | Что тестирует |
|------|--------|---------------|
| `test_models.py` | 18 | Свойства моделей, уникальность флагов, constraints |
| `test_services.py` | 35 | Все методы SubscriptionService, ленивое истечение, триал |
| `test_permissions.py` | 10 | FeatureGatePermission, фабрика feature_required |
| `test_views.py` | 11 | API endpoints, фильтрация, авторизация |
| `test_enforcement.py` | 17 | Проверки в views (проекты, сцены, шеринг, хранилище) |
| `test_serializers.py` | 20 | Формат ответов API, обратная совместимость quota |

```bash
docker compose exec backend python manage.py test apps.subscriptions.tests -v 2
```

## Что НЕ реализовано

- **Лимит на группы (scenes) убран** — создание групп бесплатно и безлимитно на любом тарифе. Поле `max_scenes_per_project` на модели Plan сохранено для обратной совместимости, но не используется.
- Интеграция с ЮKassa (отдельная подсистема)
- Промо-коды и реферальная система
- Командные аккаунты (team management)
- Сгорание и перенос Кадров (50% перенос)
- ~~Массовое скачивание~~ — **реализовано**, см. `docs/systems/features/batch-download.md`
- ~~Усиление промпта~~ — **реализовано**, см. `docs/systems/features/prompt-enhance.md`
- Экспорт аналитики (endpoint)

## Связанные изменения в других приложениях

- `backend/apps/users/models.py` — сигнал `create_user_subscription` создаёт триал
- `backend/apps/users/serializers.py` — `get_quota()` берёт лимиты из Plan
- `backend/apps/users/views.py` — `select_related('subscription', 'subscription__plan')`
- `backend/apps/users/admin.py` — UserQuotaAdmin удалён
- `backend/apps/credits/models.py` — добавлен `REASON_TRIAL_BONUS`
- `backend/apps/cabinet/services.py` — хранилище из `SubscriptionService.get_active_plan()`
- `frontend/lib/types/index.ts` — типы `UserSubscription`, `FeatureGateInfo`, `PlanInfo`
- `frontend/lib/store/auth.ts` — синхронизация subscription store при setUser
