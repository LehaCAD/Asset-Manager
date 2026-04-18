# Кабинет (личный кабинет)

> Актуальное состояние подсистемы. Обновлять при внесении изменений.
> Последнее обновление: 2026-04-15

---

## Назначение

Личный кабинет — единая точка входа пользователя для управления аккаунтом, подпиской, платежами, аналитикой и настройками. Доступен по `/cabinet/*`. Требует авторизации (`AuthGuard`).

## Структура

### Layout

Файл: `frontend/app/(cabinet)/cabinet/layout.tsx`

Двухуровневый layout:
- **Desktop (md+):** sidebar 260px (навигация по секциям, юзер-карточка, баланс) + контент справа.
- **Mobile (<md):** компактный хедер (аватар + баланс) + горизонтальные скролл-табы + контент ниже.

Sidebar навигация группируется по секциям: Обзор, Оплата, Инструменты, Администрирование (для `is_staff`).

Контент оборачивается в `max-w-5xl mx-auto p-4 md:p-8`. Для полноэкранных страниц (feedback, inbox) используется `flex flex-col overflow-hidden`.

### Страницы

| Путь | Файл | Назначение |
|------|------|------------|
| `/cabinet/analytics` | `analytics/page.tsx` | Аналитика: summary-карточки, график расходов, breakdown по моделям/проектам |
| `/cabinet/history` | `history/page.tsx` | Журнал генераций: таблица с фильтрами, превью, копирование промптов |
| `/cabinet/achievements` | `achievements/page.tsx` | Достижения: прогресс онбординга, карточки задач с наградами |
| `/cabinet/subscription` | `subscription/page.tsx` | Подписка: текущий план, статус, usage, feature list, CTA апгрейда |
| `/cabinet/balance` | `balance/page.tsx` | Платежи: пополнение баланса (СБП/карта) + история операций |
| `/cabinet/storage` | `storage/page.tsx` | Хранилище: использование, breakdown по проектам |
| `/cabinet/notifications` | `notifications/page.tsx` | Уведомления: список с табами (все/отзывы/контент), фильтр по проекту |
| `/cabinet/feedback` | `feedback/page.tsx` | Обратная связь: чат поддержки |
| `/cabinet/settings` | `settings/page.tsx` | Профиль: имя, email, пароль, тема оформления, удаление аккаунта |
| `/cabinet/inbox` | `inbox/page.tsx` | Входящие: админ-панель обратной связи (только `is_staff`) |

## Компоненты

| Компонент | Файл | Назначение |
|-----------|------|------------|
| `AmountPresets` | `components/cabinet/AmountPresets.tsx` | Сетка пресетов суммы пополнения + поле ввода произвольной суммы |
| `PaymentMethods` | `components/cabinet/PaymentMethods.tsx` | Выбор способа оплаты (СБП, карта) с radio-кнопками |
| `TopUpSummary` | `components/cabinet/TopUpSummary.tsx` | Итого + кнопка оплаты, вызывает `createTopUp` из credits store |
| `BalanceCard` | `components/cabinet/BalanceCard.tsx` | Карточка баланса (устаревший, не используется в текущем layout) |

## Сторы

| Стор | Файл | Данные |
|------|------|--------|
| `useCreditsStore` | `lib/store/credits.ts` | `balance`, `selectedAmount`, `customAmount`, `paymentMethod`, `createTopUp()` |
| `useSubscriptionStore` | `lib/store/subscription.ts` | `planCode`, `planName`, `status`, `isTrial`, `features`, `trialDaysLeft` |
| `useNotificationStore` | `lib/store/notifications.ts` | `notifications`, `activeTab`, `projectId`, `fetchNotifications()`, `markRead()` |
| `useFeedbackAdminStore` | `lib/store/feedback-admin.ts` | `totalUnread`, `loadConversations()` — для бейджа в навигации |
| `useAuthStore` | `lib/store/auth.ts` | `user` (username, email, quota, subscription, is_staff) |

## API

| Эндпоинт | Функция | Файл |
|----------|---------|------|
| `GET /api/cabinet/analytics/` | `getAnalytics()` | `lib/api/cabinet.ts` |
| `GET /api/cabinet/history/` | `getHistory()` | `lib/api/cabinet.ts` |
| `GET /api/cabinet/transactions/` | `getTransactions()` | `lib/api/cabinet.ts` |
| `GET /api/cabinet/storage/` | `getStorage()` | `lib/api/cabinet.ts` |
| `POST /api/auth/me/password/` | `changePassword()` | `lib/api/cabinet.ts` |
| `PATCH /api/auth/me/` | (inline) | Смена имени в settings |

Фильтры аналитики и журнала: `date_from`, `date_to`, `ai_model_id`, `project_id`, `status`, `source_type`. Пагинация: `page` (20 записей).

## Backend

Приложение: `backend/apps/cabinet/`

Предоставляет read-only аналитику и журнал. Агрегирует данные из `Element`, `CreditsTransaction`, `Project`.

## Дизайн-система (цвета)

Все страницы кабинета используют единый паттерн:

| Элемент | Классы |
|---------|--------|
| Карточка | `rounded-md border border-border bg-card shadow-[var(--shadow-card)]` |
| Таблица | `rounded-md border border-border bg-card shadow-[var(--shadow-card)] overflow-x-auto` + `min-w-[...]` |
| Status badge (success) | `bg-success/10 text-success` |
| Status badge (primary) | `bg-primary/10 text-primary` |
| Status badge (warning) | `bg-warning/10 text-warning` |
| Status badge (error) | `bg-destructive/10 text-destructive` |
| Primary button | `bg-primary text-primary-foreground hover:bg-primary/90` |
| Secondary button | `border border-border text-muted-foreground hover:bg-muted/50` |
| Selected item | `border-primary bg-primary/10` |
| Unselected item | `border-border bg-card hover:bg-muted/50` |
| Progress bar | Track: `bg-muted`, fill: `bg-primary` |
| Pagination | `bg-muted/60 text-muted-foreground hover:bg-muted` |

**Запрещено** использовать: кастомные CSS-переменные (`--success-muted`, `--primary-muted`), градиентные фоны на карточках, glow-тени на бейджах, `bg-[var(--bg-elevated)]` / `bg-[var(--bg-inset)]` (использовать `bg-card` и `bg-muted/50`).

## Мобильная адаптация

- **Layout:** sidebar скрывается на `<md`. Вместо него — бургер-меню (иконка Menu) в хедере, при нажатии — drawer-панель поверх контента с полной навигацией, юзер-карточкой и балансом. Drawer закрывается при навигации и по клику на backdrop.
- **Safe area:** хедер и drawer используют `pt-[max(0.75rem,env(safe-area-inset-top))]` для отступа от камер/микрофонов телефона.
- **Хедер:** бургер-иконка слева, название текущей страницы по центру, баланс справа.
- **Гриды:** `grid-cols-1 sm:grid-cols-N` (аналитика: summary 1→3, breakdown 1→2; подписка: usage 1→2; пресеты оплаты: 2→3).
- **Фильтры (журнал):** `grid grid-cols-2 sm:flex` — на мобилке 2 колонки, дата-пикер на полную ширину (`col-span-2`).
- **Таблицы:** платежи — колонка «Описание» скрыта на мобилке (`hidden sm:table-cell`), padding сжат (`px-2 sm:px-4`). Журнал — горизонтальный скролл с `min-w-[640px]`.
- **Хедеры с фильтрами:** `flex-col sm:flex-row` с `gap-3`.
- **Контент:** padding `px-4 py-5 md:p-8`. На мобилке контент без border и shadow.
- **Кнопки подписки:** стрелка ArrowRight скрыта на мобилке, кнопки стеком (`flex-col sm:flex-row`).
- **Overflow:** корневой layout и контент-контейнер имеют `overflow-x-hidden` для предотвращения горизонтального скролла.

## Интеграции

- **Подписки** (`subscriptions`): страница подписки читает `useSubscriptionStore` и `subscriptionsApi.getPlans()` для отображения текущего плана и feature list.
- **Кредиты** (`credits`): страница платежей использует `useCreditsStore` для баланса и создания пополнения через ЮKassa.
- **Feature gating**: CTA-баннер на странице подписки ведёт на `/pricing`.
- **Уведомления** (`notifications`): стор `useNotificationStore` + API notifications.
- **Обратная связь** (`feedback`): компонент `FeedbackChat`, стор `useFeedbackAdminStore` для бейджа входящих.
