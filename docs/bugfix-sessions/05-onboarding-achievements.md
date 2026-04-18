# Сессия 05 — Онбординг и ачивки

**Цель:** починить страницу ачивок, разобраться с невыдачей наград на некоторых событиях, выровнять уведомления.

**Документация домена:** `docs/systems/onboarding.md`.

---

## BF-05-01 — Страница «Достижения» не открывается в ЛК ✅ (фикс в коде)

**Симптом:**
> «Страница с достижениями не открывается в личном кабинете. Переход на неё не работает. Кстати, не в локалке, ни с телефона, ни с компьютера».

**Корень:** страница лежит в route-group `(cabinet)`, а `OnboardingBootstrap` (единственное место, где вызывается `fetchOnboarding()`) смонтирован только в `(workspace)/layout.tsx`. При прямом заходе на `/cabinet/achievements` (в том числе по клику из навбара с `target=_blank` или по hard-refresh F5) Zustand-стор пустой, `isLoaded=false` → страница вечно висит в скелетоне. Выглядит как «не открывается».

**Фикс:** в `frontend/app/(cabinet)/cabinet/achievements/page.tsx` добавлен `useEffect`, который дёргает `fetchOnboarding()`, если стор не загружен. Это локализованный фикс (не плодим второй `OnboardingBootstrap` в кабинете) и не ломает поведение при переходе из workspace (там `isLoaded` уже true — эффект ничего не делает).

**Смежно проверено:** остальные страницы кабинета (analytics, history, balance, notifications, storage, settings) не зависят от `useOnboardingStore` — не ломаются. Навбар ачивки (`OnboardingProgress`) живёт тоже в workspace layout, к кабинету не имеет отношения.

---

## BF-05-02 — Ачивка не выдана за генерацию ✅ (фикс в коде)

**Симптом:**
> «На телефоне запустил генерацию и мне не дало никакого вознаграждения. Какая-то фигня».

**Корень (подтверждён логами, см. [BF-00-03](00-diagnostics.md)):** в `elements/generation.py:219` и `elements/tasks.py:426` вызывалось `element.scene.project.user`. Если элемент создан в **корне проекта** (без группы), `scene = None` → `AttributeError` → try/except глотает → ачивка не срабатывает. «Мобилка» тут ни при чём — баг лупил для любого корневого элемента, пользователь просто тестировал с телефона именно в корне.

**Фикс:** заменил на `element.project.user` (Element имеет FK на project напрямую). Других мест с тем же антипаттерном в бэкенде нет.

**Проактивно:** проверить фронт на такой же антипаттерн — возможно, и в UI элементы в корне проекта не отображаются именно из-за обращения к `element.scene.something` в условии фильтра. Это жалоба пользователя из `docs/Фиксы и мысли.md` п.1. Разобрать в Сессии 04 ([BF-04-08](04-mobile-responsive.md)).

---

## BF-05-03 — Ачивки не показываются в нотификациях ✅ (фикс в коде)

**Симптом:**
> «Когда админ назначает кадры клиенту — у него в уведомлениях это отображается. А когда приходит вознаграждение за ачивку — в уведомлениях не отображается. Неправильно».

**Корень:** feedback-reward (ручное начисление админом) идёт через `apps/feedback/services.py` и вызывает `create_notification(type='feedback_reward', …)` → в журнале появляется строка. `OnboardingService._notify_task_completed` делал только WS-рассылку + luxury-тост, persist-`Notification` не создавал → журнал уведомлений про ачивки ничего не знает.

**Фикс:**
- `backend/apps/notifications/models.py` — новая опция `ACHIEVEMENT_EARNED = 'achievement_earned'`.
- `backend/apps/notifications/migrations/0006_add_achievement_earned_type.py` — `AlterField` с обновлённым `choices`.
- `backend/apps/onboarding/services.py` → `_notify_task_completed` после WS-рассылки вызывает `create_notification(type=ACHIEVEMENT_EARNED, project=None, title='Достижение: <task>', message='Получено достижение «…», +N кадров')`. Создание завёрнуто в `try/except` — если notifications-модуль упадёт, ачивка и кадры пользователю уже выданы (не регрессим основную логику).
- `frontend/lib/types/index.ts` — `NotificationType` расширен `'achievement_earned'`.
- `frontend/components/ui/notification-icon.tsx` — Trophy + primary-цвет.
- `frontend/components/layout/NotificationDropdown.tsx` и `frontend/app/(cabinet)/cabinet/notifications/page.tsx` — клик по ачивочной нотификации ведёт на `/cabinet/achievements` (обычный роутинг `projects/scene/element` не применим, `project=null`).

**Смежно проверено:**
- Фильтр табов на странице кабинета: `achievement_earned` не входит в `FEEDBACK_TYPES` — показывается в «Все», в «Контент» не попадает. Ожидаемо.
- `NotificationDropdown` (колокольчик): фильтр `FEEDBACK_TYPES` не содержит `achievement_earned` → ачивки попадают в bell, что и надо.
- Backfill-ачивки (выдаются без награды при первом заходе через `backfill_for_user`) — `_notify_task_completed` для них не вызывается (они завершаются через `get_or_create` без `pay_reward`), нотификация не создаётся. Это специально: фоновый backfill не должен спамить журнал.

**Смежно с [BF-06](06-realtime-credits-notifications.md).**

---

## BF-05-04 — Ачивка за открытие детального просмотра ✅ (проверено, оставляем)

**Источник:** [BF-04-04](04-mobile-responsive.md).

**Проверено:** `frontend/components/lightbox/LightboxModal.tsx:337` — `completeTask('open_lightbox')` вызывается один раз при `isOpen=true`. Backend `complete_by_code` идемпотентен (`get_or_create(user, task)`); фронтовый `completeTask` дополнительно коротит: `if task.completed return`. Повторные открытия лайтбокса ни WS-спам, ни повторные начисления не создают. Ачивка семантически = «пользователь хоть раз открыл детальный просмотр», что и заявлено в `onboarding.md`. Оставляем.

---

## BF-05-05 — Бэклог ачивок из памяти ✅ (уже сделано ранее)

Из `onboarding_additions` (memory): добавить ачивки `mass_download` и `support_chat`.

**Статус:** обе уже живут в системе (см. `docs/systems/onboarding.md` → «Текущие задачи»: `first_support_chat` #9 и `first_batch_download` #10). Страница `/cabinet/achievements` рендерит весь список задач из `fetchOnboarding()` → ачивки автоматически отображены, отдельных UI-правок не требуется. Закрываем, актуализирую memory-запись отдельным ходом.
