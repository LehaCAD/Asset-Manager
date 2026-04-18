# Сессия 06 — Realtime: баланс кадров и уведомления

**Цель:** баланс кадров и список уведомлений обновляются в реальном времени через WebSocket, без перезагрузки страницы.

---

## BF-06-01 — Баланс кадров не обновляется при начислении админом ✅

**Симптом:**
> «Нету вебсокета. Вот я из чата поддержки начисляю кадры, вознаграждаю за отзыв — а количество кадров, отображаемое у пользователя, не меняется. После обновления страницы только обновляется».

**Корень:** `_notify_balance_changed` вызывался только из вебхука YooKassa и слал `credits_balance_changed`, для которого **не было handler-метода** в `NotificationConsumer`. Админское начисление/бонусы/рефанды вообще ничего не отправляли.

**Фикс:**
- `backend/apps/credits/signals.py` — новый `post_save`-сигнал на `CreditsTransaction` шлёт `credits_changed` с `balance_after` в группу `user_{id}`. Подключён через `CreditsConfig.ready()`.
- `backend/apps/notifications/consumers.py` — добавлены handler-методы `credits_changed` и `credits_balance_changed` (второй оставлен для обратной совместимости, реэмитит как `credits_changed`).
- `frontend/lib/api/notification-ws.ts` — обрабатывает `credits_changed`, кладёт `balance` в `useCreditsStore` напрямую (без лишнего HTTP). Если payload пустой — fallback на `loadBalance()`.

**Смежно проверено:** `CreditsTransaction` создаётся единственной точкой — через `CreditsService`/`PaymentService`; значит любой сценарий (админ-начисление, рефанды, topup, ачивка, generation debit) теперь автоматически триггерит WS. Legacy-вызов `_notify_balance_changed` в `views.py:209` оставил — теперь работает как алиас.

**Тест:** админ начисляет → за ≤2 сек баланс обновляется у юзера без F5.

---

## BF-06-02 — Ачивка не создаёт нотификацию ✅ (закрыто вместе с BF-05-03)

**Дубль [BF-05-03](05-onboarding-achievements.md).** В этой сессии — часть про WS-доставку: когда ачивка создаёт Notification, оно должно прилететь по WS в список уведомлений.

**Статус:** закрыто вместе с BF-05-03. `OnboardingService._notify_task_completed` вызывает `create_notification(type='achievement_earned', …)`, которое уже шлёт `new_notification` через канал `user_{id}` → `notification-ws.ts` → `useNotificationStore.pushNotification`. Отдельной правки в этой сессии не потребовалось.

---

## BF-06-03 — Инвентаризация WS-событий ✅

**Источники (бэкенд → группа `user_{id}` через `NotificationConsumer` на `ws/notifications/`):**

| Событие | Producer | Consumer handler | Frontend | Статус |
|---|---|---|---|---|
| `new_notification` | `apps/notifications/services.py` | `new_notification` | `notification-ws.ts` → `Navbar` (список + badge) | ✅ |
| `onboarding_task_completed` | `apps/onboarding/services.py` | `onboarding_task_completed` | `notification-ws.ts` → `useOnboardingStore` + `useCreditsStore.loadBalance()` + `showAchievementToast` | ✅ |
| `subscription_changed` | `apps/subscriptions/signals.py` (post_save `Subscription`) | `subscription_changed` | `notification-ws.ts` → `authApi.getMe()` + `useAuthStore.setUser()` + toast | ✅ |
| `credits_changed` | `apps/credits/signals.py` (post_save `CreditsTransaction`, добавлено в этой сессии) | `credits_changed` | `notification-ws.ts` → `useCreditsStore.setState({balance})` | ✅ |
| `credits_balance_changed` | `apps/credits/views.py` (legacy, из YooKassa-вебхука) | `credits_balance_changed` → реэмитит как `credits_changed` | см. выше | ✅ |

**Проектный канал (`ws/projects/{id}/`, `apps/projects/consumers.py`)** — вне скоупа этой инвентаризации: `element_status_changed`, `new_comment`, `reaction_updated`, `review_updated`.

**Результат:** таблица выше. Отдельный `docs/systems/infra.md` ещё не создан — таблица будет туда перенесена при написании домена infra (см. `docs/MODULE_MAP.md`).
