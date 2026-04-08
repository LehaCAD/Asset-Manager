# Подписки и ограничение фич — Спецификация

> Дата: 8 апреля 2026  
> Статус: Утверждён  
> Контекст: Платформа готовится к продакшену. Нужна система тарифов, ограничения фич по тарифу, управление подписками через админку.

---

## 1. Цель

Реализовать систему тарифных планов с гейтингом фич:
- Пользователь видит заблокированные фичи с предложением апгрейда
- Администратор управляет тарифами, фичами и подписками через Django Admin
- Триал при регистрации (7 дней полного доступа)
- Модель данных готова к автоматической оплате (ЮKassa), но на старте тарифы назначаются вручную

---

## 2. Тарифная сетка (из 05-PRICING-MODEL.md)

| | Старт | Создатель | Создатель Pro ⭐ | Команда | Корпоративный |
|---|---|---|---|---|---|
| Цена | 0 ₽ | 990 ₽/мес | 1 990 ₽/мес | 4 990 ₽/мес | По запросу |
| Кадров/мес | — | 1 000 | 2 000 | 5 000 | Индивидуально |
| Проекты | 1 | 5 | ∞ | ∞ | ∞ |
| Хранилище | 1 ГБ | 20 ГБ | 100 ГБ | 500 ГБ | ∞ |
| Доступ по ссылке | — | ✓ | ✓ | ✓ | ✓ |
| Массовое скачивание | — | — | ✓ | ✓ | ✓ |
| Усиление промпта | — | — | ✓ | ✓ | ✓ |
| Экспорт аналитики | — | — | — | ✓ | ✓ |

| Групп в проекте | 10 | 20 | 50 | 100 | ∞ |
| Элементов в группе | 10 | 20 | 50 | 100 | ∞ |

Все модели генерации доступны всем тарифам без ограничений.

---

## 3. Модель данных

### 3.1 Новое приложение: `backend/apps/subscriptions/`

Три модели:

#### Plan (Тариф)

| Поле | Тип | Описание |
|---|---|---|
| `code` | CharField, unique | Идентификатор в коде (`free`, `creator`, `creator_pro`, `team`, `enterprise`) |
| `name` | CharField | Название для пользователя |
| `price` | DecimalField | Цена ₽/мес (0 для бесплатного) |
| `credits_per_month` | IntegerField | Кадров при автоматической оплате подписки (0 = не начисляются) |
| `max_projects` | IntegerField | Лимит проектов (0 = безлимит) |
| `max_scenes_per_project` | IntegerField | Лимит групп в проекте |
| `max_elements_per_scene` | IntegerField | Лимит элементов в группе |
| `storage_limit_gb` | IntegerField | Хранилище в ГБ (0 = безлимит) |
| `features` | ManyToManyField → Feature | Включённые фичи |
| `is_default` | BooleanField | Тариф для новых пользователей (только один) |
| `is_recommended` | BooleanField | Подсвечивается на странице тарифов |
| `is_trial_reference` | BooleanField | План, используемый во время триала (только один) |
| `is_active` | BooleanField | Виден на фронтенде |
| `display_order` | IntegerField | Порядок отображения |
| `created_at` | DateTimeField, auto | — |
| `updated_at` | DateTimeField, auto | — |

#### Feature (Фича)

| Поле | Тип | Описание |
|---|---|---|
| `code` | CharField, unique | Идентификатор в коде (`sharing`, `batch_download`, `ai_prompt`, `analytics_export`) |
| `title` | CharField | Заголовок в модалке апгрейда |
| `description` | TextField | Описание в модалке (1-2 предложения) |
| `icon` | CharField | Имя иконки Lucide |
| `min_plan` | ForeignKey → Plan | Минимальный тариф (для лейбла «Доступно начиная с...») |

Начальные фичи:

| Код | Название | Мин. тариф |
|---|---|---|
| `sharing` | Доступ по ссылке | Создатель |
| `batch_download` | Массовое скачивание | Создатель Pro |
| `ai_prompt` | Усиление промпта | Создатель Pro |
| `analytics_export` | Экспорт аналитики | Команда |

#### Subscription (Подписка)

| Поле | Тип | Описание |
|---|---|---|
| `user` | OneToOneField → User | Один юзер = одна подписка |
| `plan` | ForeignKey → Plan | Текущий тариф |
| `status` | CharField (choices) | `active`, `trial`, `expired`, `cancelled` |
| `started_at` | DateTimeField | Начало текущего периода |
| `expires_at` | DateTimeField | Конец периода |
| `cancelled_at` | DateTimeField, null | Дата отмены (работает до expires_at) |
| `created_at` | DateTimeField, auto | — |

### 3.2 Удаление UserQuota

Модель `UserQuota` удаляется. Лимиты теперь живут на `Plan`. Сериализатор `user.quota` вычисляет данные на лету из `subscription.plan`:

```
user.subscription.plan → лимиты → сериализатор → user.quota (формат не меняется)
```

Фронтенд API обратно совместим — `user.quota` возвращает те же поля.

### 3.3 Жизненный цикл подписки

| Событие | Действие |
|---|---|
| Регистрация | Subscription(plan=дефолтный, status=trial, expires_at=+7 дней) + `CreditsService.topup(50, reason='trial_bonus')` |
| Триал истёк | status=expired, план остаётся дефолтным (Старт). Бонусные Кадры не сгорают (они купленного типа). |
| Ручное назначение тарифа (админка) | plan=выбранный, status=active, expires_at=указанная дата. Кадры НЕ начисляются |
| Автоматическая оплата (ЮKassa, потом) | plan=оплаченный, status=active, expires_at=+30 дней, credits начисляются |
| Отмена | cancelled_at=now, status=cancelled. Фичи работают до expires_at |
| Период истёк | status=expired, откат на дефолтный план |

### 3.4 Связка тариф / кадры

Тариф и Кадры — независимые системы:
- **Тариф** = доступ к фичам и лимитам
- **Кадры** = валюта для генераций

При ручном назначении тарифа Кадры не начисляются. Пополнение баланса — отдельное действие (уже реализовано).
При автоматической оплате (будущее) — Кадры начисляются вместе с тарифом.
Пользователь может покупать Кадры без подписки на тарифе Старт.

---

## 4. Backend: Сервис проверки доступа

### 4.1 SubscriptionService

Единая точка входа для всех проверок:

```python
class SubscriptionService:
    @staticmethod
    def get_active_plan(user) -> Plan:
        """Текущий план. Если подписки нет или expired — дефолтный."""

    @staticmethod
    def has_feature(user, feature_code: str) -> bool:
        """Есть ли у пользователя фича."""

    @staticmethod
    def can_create_project(user) -> bool:
        """Не превышен ли лимит проектов."""

    @staticmethod
    def can_create_scene(user, project) -> bool:
        """Не превышен ли лимит групп."""

    @staticmethod
    def can_generate(user) -> bool:
        """Не превышен ли лимит хранилища."""

    @staticmethod
    def get_limits(user) -> dict:
        """Все лимиты + текущее использование."""

    @staticmethod
    def get_feature_gate_info(user, feature_code: str) -> dict:
        """Инфо для модалки: title, description, icon, min_plan_name, min_plan_price."""
```

### 4.2 Enforcement (где проверяется)

| Endpoint | Проверка |
|---|---|
| `POST /api/projects/` | `can_create_project()` |
| `POST /api/scenes/` | `can_create_scene()` |
| `POST /api/scenes/{id}/generate/` | `can_generate()` (хранилище) + баланс (уже есть) |
| `POST /api/projects/{id}/generate/` | `can_generate()` (хранилище) + баланс (уже есть) |
| `POST /api/scenes/{id}/upload/` | `can_generate()` (хранилище) |
| `POST /api/projects/{id}/upload/` | `can_generate()` (хранилище) |
| `POST /api/sharing/` | `has_feature("sharing")` |
| Массовое скачивание (будущий endpoint) | `has_feature("batch_download")` |
| Усиление промпта (будущий endpoint) | `has_feature("ai_prompt")` |
| Экспорт аналитики (будущий endpoint) | `has_feature("analytics_export")` |

Паттерн проверки: reusable `FeatureGatePermission(feature_code)` — DRF permission class, применяется к viewset декоративно. Для лимитов — проверка в `perform_create()` с вызовом SubscriptionService.

### 4.3 Триал

Стратегия: Plan имеет флаг `is_trial_reference = True` (устанавливается на одном плане — Создатель Pro). Во время триала `get_active_plan()` возвращает этот план вместо дефолтного.

При `status=trial` и `expires_at > now()`:
- `get_active_plan()` возвращает план с `is_trial_reference=True` (Pro)
- `has_feature()` возвращает `True` для всех фич этого плана
- Лимиты = лимиты trial-reference плана (Pro)

### 4.4 Ленивая проверка истечения

Проверка встроена в `get_active_plan()` — никаких Celery Beat задач:

```python
def get_active_plan(user) -> Plan:
    sub = user.subscription  # prefetch через select_related
    if sub is None:
        return Plan.objects.get(is_default=True)
    if sub.status in ('trial', 'active', 'cancelled') and sub.expires_at < now():
        sub.status = 'expired'
        sub.plan = Plan.objects.get(is_default=True)
        sub.save(update_fields=['status', 'plan'])
    if sub.status == 'trial':
        return Plan.objects.get(is_trial_reference=True)
    if sub.status in ('active', 'cancelled'):
        return sub.plan
    return Plan.objects.get(is_default=True)
```

Статус `cancelled` с `expires_at > now()` — план продолжает работать (пользователь отменил, но оплаченный период ещё не истёк).

### 4.5 Миграционный чеклист UserQuota

Файлы, которые нужно обновить при удалении UserQuota:
- `backend/apps/users/models.py` — удалить модель и `post_save` сигнал
- `backend/apps/users/admin.py` — удалить `UserQuotaAdmin`
- `backend/apps/users/serializers.py` — `get_quota()` пересчитать из `subscription.plan`
- `backend/apps/cabinet/services.py` — `get_analytics()` и `get_storage()` читают `quota.storage_limit_bytes`
- `frontend/lib/types/index.ts` — тип `UserQuota` остаётся (формат тот же)
- `frontend/components/layout/Navbar.tsx` — прогресс-бар хранилища (заменить красный/оранжевый на фиолетовый)

### 4.6 API для фронтенда

Расширение `/api/auth/me/`:

```json
{
  "id": 1,
  "username": "ivan",
  "email": "ivan@mail.ru",
  "quota": {
    "max_projects": 0,
    "used_projects": 3,
    "storage_limit_bytes": 107374182400,
    "storage_used_bytes": 8800000000
  },
  "subscription": {
    "plan_code": "creator_pro",
    "plan_name": "Создатель Pro",
    "status": "active",
    "expires_at": "2026-05-08T00:00:00Z",
    "features": ["sharing", "batch_download", "ai_prompt"],
    "is_trial": false,
    "trial_days_left": null
  }
}
```

Новый endpoint: `GET /api/subscriptions/plans/` — список тарифов для страницы /pricing.

Новый endpoint: `GET /api/subscriptions/feature-gate/{code}/` — инфо для модалки апгрейда (title, description, icon, min_plan_name, min_plan_price).

---

## 5. Frontend

### 5.1 Новый стор: `useSubscriptionStore`

```typescript
interface SubscriptionState {
  planCode: string
  planName: string
  status: 'active' | 'trial' | 'expired' | 'cancelled'
  features: string[]
  expiresAt: string | null
  isTrial: boolean
  trialDaysLeft: number | null

  hasFeature(code: string): boolean
  canCreate(resource: 'project' | 'scene'): boolean
  isAtLimit(resource: string): boolean
}
```

Данные загружаются из `user.subscription` при авторизации.

### 5.2 Паттерны блокировки

Три паттерна, комбинируются по ситуации:

**Замок на кнопке** — для бинарных фич:
- Кнопка серая (muted), рядом бейдж PRO (фиолетовый градиент)
- Клик открывает модалку апгрейда
- Применяется к: «Поделиться», «Скачать всё», «Улучшить промпт»

**Прогресс-бар лимита** — для количественных ограничений:
- Полоска всегда фиолетовая (primary), при 100% — тот же цвет
- Под заблокированной кнопкой: «Хочу больше проектов →»
- Применяется к: проекты, хранилище

**Модалка апгрейда** — единый компонент `<UpgradeModal>`:
- Для фич: иконка + заголовок + описание + «Подключить {plan} — {price}₽/мес» + «Сравнить тарифы →»
- Для лимитов: иконка + «Нужно больше проектов» + прогресс-бар + кнопка апгрейда
- Контент загружается из бэкенда (Feature model)
- Ссылка «Сравнить тарифы» ведёт на /pricing

### 5.3 Цветовая схема ограничений

Только два цвета:
- **Фиолетовый** (primary) — бейджи PRO, кнопки апгрейда, прогресс-бар на любом уровне заполнения
- **Серый** (muted) — заблокированные кнопки и текст

Красный, оранжевый, янтарный — не используются нигде в контексте ограничений.
Тон позитивный: «Откройте новые возможности», «Хочу больше проектов», не «Лимит исчерпан».

### 5.4 Баннер триала

Акцентный текст в хедере (минималистичный, в стиле бренда):
- За 2 дня до конца: `Пробный период: 2 дня` — фиолетовым, рядом с аватаром
- После окончания: баннер «Пробный период завершён. Откройте новые возможности с подпиской.» — показывается один раз, закрывается

### 5.5 Названия фич (русский)

| Код | Название для пользователя | Лейбл кнопки |
|---|---|---|
| `sharing` | Доступ по ссылке | Поделиться |
| `batch_download` | Массовое скачивание | Скачать всё |
| `ai_prompt` | Усиление промпта | Улучшить промпт |
| `analytics_export` | Экспорт аналитики | Экспорт |

### 5.6 Страница /pricing

Временная заглушка: таблица тарифов (данные из `GET /api/subscriptions/plans/`) + текст «Для подключения напишите нам». Будет заменена дизайнером.

---

## 6. Админка Django

Уровень качества: как у AIModel — кастомные шаблоны, help-тексты, быстрые действия.

### 6.1 PlanAdmin

**Список:** Колонки: порядок, название, цена, кадры, проекты, хранилище, фичи (бейджи), статус. Бейджи «по умолчанию», «рекомендуемый». `list_editable` для порядка и is_active. Подсказки.

**Форма:** 4 fieldset-а:
1. **Основное** — code (readonly после создания), name, price, credits_per_month
2. **Лимиты** — max_projects, max_scenes_per_project, max_elements_per_scene, storage_limit_gb. Help: «0 = безлимит»
3. **Фичи** — checkbox widget с кодом и описанием каждой фичи
4. **Отображение** — display_order, is_active, is_recommended, is_default

### 6.2 FeatureAdmin

**Форма:** 2 fieldset-а:
1. **Контент модалки** — code (readonly), title, description, icon. Help: «Этот текст видит пользователь при клике на заблокированную фичу»
2. **Привязка** — min_plan (выпадающий список)
3. **Предпросмотр** — readonly поле с отрендеренным HTML модалки

### 6.3 SubscriptionAdmin

**Список:** Пользователь, тариф, статус (цветной бейдж), начало, истекает. Фильтры: по тарифу, по статусу.

**Быстрые действия:**
- «Назначить тариф на 30 дней» (dropdown с выбором плана)
- «Продлить на 30 дней»
- «Сбросить на Старт»

Help: «Это главный инструмент для тестирования. При ручном назначении Кадры не начисляются — используйте пополнение баланса отдельно.»

---

## 7. Миграция и seed-данные

### 7.1 Миграции

1. Создать приложение `subscriptions` с моделями Plan, Feature, Subscription
2. Data migration: создать 5 планов и 4 фичи из тарифной сетки
3. Data migration: для каждого существующего User создать Subscription(plan=Старт, status=active)
4. Удалить модель UserQuota (после проверки, что сериализатор работает без неё)

### 7.2 Seed-скрипт (management command)

`python manage.py seed_plans` — создаёт/обновляет стандартные планы и фичи. Идемпотентный — безопасно запускать повторно.

---

## 8. Что НЕ входит в эту задачу

- Интеграция с ЮKassa (отдельная задача)
- Промо-коды и реферальная система (архитектура не мешает, добавим потом)
- Командные аккаунты (тариф Команда — просто строка с лимитами, без team management)
- Логика сгорания и переноса Кадров (50% перенос — отдельная задача)
- Докупка пакетов Кадров через UI (пока только ручное пополнение)
