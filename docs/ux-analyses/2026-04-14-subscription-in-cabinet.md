## UX Analysis: Подписка в кабинете
### Размер: L

### 1. Текущее состояние
- Кабинет: 8 разделов в sidebar, 3 группы (Обзор, Оплата, Инструменты)
- Pricing page (`/pricing`): 533 строки, 4 карточки тарифов + таблица сравнения, CTA-заглушки
- Subscription инфраструктура: backend (Plan, Feature, Subscription), frontend (store, API, types, TrialBanner, FeatureGate, UpgradeModal)
- Из кабинета нет ни одной ссылки на подписку
- Trial-информация (trialDaysLeft) есть в store, но нигде в кабинете не показана

### 2. Impact Map
- `frontend/app/(cabinet)/cabinet/layout.tsx` — добавить пункт в NAV_SECTIONS
- `frontend/app/(cabinet)/cabinet/subscription/page.tsx` — новый файл
- `frontend/lib/store/subscription.ts` — уже готов, данные доступны
- `frontend/lib/api/subscriptions.ts` — уже есть getPlans(), getFeatureGate()
- `frontend/components/subscription/TrialBanner.tsx` — может дублироваться на /cabinet/subscription
- Pricing page — без изменений, используется как точка сравнения тарифов

### 3. Решение (визировано пользователем)

**Архитектура: два экрана, разные задачи**
- `/pricing` — витрина (сравнение тарифов, wow-фактор)
- `/cabinet/subscription` — пульт управления (текущий план, usage, функции)

**Mockup:** `pen/pencil-new.pen` — три фрейма:
1. `iwngI` — активная подписка (Создатель Pro)
2. `Zfj8b` — пробный период (Trial)
3. `iCXSq` — бесплатный тариф (Старт)

**Sidebar:** пункт «Подписка» (иконка `circle-check-big`) в группе «Оплата», перед «Платежи»

**Карточка текущего тарифа:**
- Название + цена + бейдж статуса (Активна / Бесплатно / X дней осталось)
- Дата следующего списания (для платных)
- Прогресс-бар trial (для пробного периода)
- CTA: «Сменить тариф» → redirect на `/pricing`
- «Отменить подписку» (ghost, для платных)
- «Подключить тариф» (primary, для бесплатных и trial)

**Использование:** три карточки с прогресс-барами
- Проекты (использовано / лимит)
- Хранилище (ГБ использовано / лимит)
- Группы (использовано / лимит)

**Функции тарифа:** полный список ВСЕХ фич системы
- Доступные: зелёная галочка (circle-check) + описание + бейдж тарифа (PLUS/PRO/TEAM)
- Недоступные: замок (lock) + описание + бейдж тарифа, затемнённые (opacity 0.6)
- Каждая функция с подзаголовком-описанием (продажа ценности)

**Ссылка внизу:** «Сравнить все тарифы» → `/pricing`

### 4. Развилки (решены)

| Вопрос | Решение | Почему |
|--------|---------|--------|
| Где показывать карточки тарифов при смене? | Redirect на `/pricing` | Оплата не работает онлайн, не дублируем код |
| Объединять подписку и платежи? | Два отдельных раздела | Разный контент и задачи |
| Группа "Оплата" — переименовать? | Оставить | Достаточно широкое название |
| Иконка sidebar | `circle-check-big` | Спокойная, уверенная, не пошлая |
| Цвета trial | Фиолетовый (primary) | Brandbook: красный/оранжевый не используются |

### 5. Scope для имплементации

**Файлы для изменения:**

| Файл | Что делаем |
|------|------------|
| `frontend/app/(cabinet)/cabinet/layout.tsx` | Добавить «Подписка» в NAV_SECTIONS группы «Оплата» |
| `frontend/app/(cabinet)/cabinet/subscription/page.tsx` | **Новый файл** — страница управления подпиской |

**Данные доступны из существующих stores/API:**
- `useSubscriptionStore` — planCode, planName, status, features, isTrial, trialDaysLeft
- `useAuthStore` → user.quota — max_projects, max_scenes_per_project, storage_limit_bytes, storage_used_bytes, projects_count, scenes_count
- `subscriptionsApi.getPlans()` — для полного списка фич с описаниями
- `subscriptionsApi.getFeatureGate(code)` — детали фичи

**Порядок работы:**
1. Добавить пункт в sidebar (`layout.tsx`)
2. Создать страницу `/cabinet/subscription/page.tsx`
3. Подключить данные из subscription store + auth store (quota)
4. Загрузить все фичи из plans API для описаний
5. Проверить все states (trial/active/expired/free)

**Edge cases:**
- Trial active: countdown + прогресс-бар + CTA «Подключить»
- Trial expired: автоматически откат на «Старт»
- Active paid: план + дата + usage + «Сменить/Отменить»
- Free (Старт): лимиты + все фичи заблокированы + CTA «Подключить»
- Loading: skeleton
- Error: retry
