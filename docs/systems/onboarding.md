# Онбординг (достижения)

> Актуальное состояние подсистемы. Обновлять при внесении изменений.
> Последнее обновление: 2026-04-16

---

## Назначение

Система онбординга помогает новому пользователю освоить платформу через систему достижений. За каждое ключевое действие (создание проекта, первая генерация, скачивание и т.д.) пользователь получает кадры — внутреннюю валюту для генераций.

Принципы:
- **Достижения, не задания** — формулировки акцентируют ценность функции, а не факт выполнения.
- **Не прерывать** — уведомления через неблокирующий toast, без модальных окон при выполнении.
- **Динамический баланс** — welcome-модалка не упоминает конкретное количество кадров (оно зависит от способа регистрации).

## Компоненты системы

### Backend

Приложение: `backend/apps/onboarding/`

#### Модели

| Модель | Файл | Назначение |
|--------|------|------------|
| `OnboardingTask` | `models.py` | Задание: код, название, описание, иконка, награда, категория, триггер |
| `UserOnboardingState` | `models.py` | Состояние пользователя: welcome_seen, backfill_done |
| `UserTaskCompletion` | `models.py` | Факт выполнения: user + task, дата, reward_paid |

#### Категории задач

- `onboarding` — первые шаги (текущие 8 задач)
- `feature` — возможности (зарезервировано)
- `milestone` — достижения (зарезервировано)

#### Типы триггеров

- `backend_signal` — выполняется автоматически через Django-сигналы (создание проекта, сцены, генерация, загрузка, шеринг)
- `frontend_action` — выполняется по запросу фронтенда (открытие лайтбокса, скачивание, повтор генерации)

#### Сервис (`services.py`)

| Метод | Назначение |
|-------|------------|
| `try_complete(user, event_name)` | Авто-завершение по событию бэкенда (идемпотентно) |
| `complete_by_code(user, task_code)` | Завершение frontend-действия по коду (идемпотентно) |
| `get_state(user)` | Получение полного состояния + backfill для старых пользователей |
| `backfill_for_user(user, state)` | Маркирует уже выполненные действия без начисления награды |

#### Сигналы (`signals.py`)

| Сигнал | Событие |
|--------|---------|
| `post_save(Project)` | `project.created` |
| `post_save(Scene)` | `scene.created` |
| `post_save(SharedLink)` | `sharing.link_created` |

Генерация и загрузка триггерятся из `elements/orchestration.py` напрямую через `OnboardingService.try_complete()`.

Дополнительные вызовы `try_complete()` из других приложений:
- `apps/feedback/views.py` → `feedback.first_message` (после `Message.objects.create`)
- `apps/elements/views.py` → `element.batch_download` (в `download_meta`, если `elements` не пуст)

#### API

| Эндпоинт | Метод | Назначение |
|----------|-------|------------|
| `/api/onboarding/` | GET | Полное состояние: задачи, прогресс, earned/possible |
| `/api/onboarding/welcome-seen/` | POST | Отметить welcome-модалку как просмотренную |
| `/api/onboarding/complete/` | POST | Завершить frontend_action задачу (body: `{task_code}`) |

#### WebSocket

При выполнении задачи отправляется событие в канал `user_{id}`:

```json
{
  "type": "onboarding_task_completed",
  "task_code": "create_project",
  "task_title": "Первый проект",
  "reward": "5",
  "new_balance": "55",
  "completed_count": 1,
  "total_count": 8
}
```

### Frontend

#### Компоненты (`components/onboarding/`)

| Компонент | Файл | Назначение |
|-----------|------|------------|
| `OnboardingBootstrap` | `OnboardingBootstrap.tsx` | Инициализатор: загружает состояние, рендерит WelcomeModal |
| `WelcomeModal` | `WelcomeModal.tsx` | Модалка первого входа: 3 шага + подсказка про достижения. Без упоминания конкретного баланса |
| `OnboardingProgress` | `OnboardingProgress.tsx` | Круговой индикатор в навбаре (SVG, число выполненных / трофей). На xs скрыт (`hidden sm:block`) — прогресс доступен через `/cabinet/achievements` |
| `OnboardingPopover` | `OnboardingPopover.tsx` | Выпадающий список достижений из навбара |
| `OnboardingTaskRow` | `OnboardingTaskRow.tsx` | Строка задачи в попавере (иконка, название, награда) |
| `OnboardingEmptyState` | `OnboardingEmptyState.tsx` | Контекстный пустой экран с CTA и наградой |
| `AchievementToast` | `AchievementToast.tsx` | Кастомный toast при выполнении достижения (иконка + награда + прогресс), появляется снизу по центру с пружинной анимацией |
| `HintBubble` | `HintBubble.tsx` | Переиспользуемый фиолетовый пузырь с стрелкой + X. Используется в workspace для контекстных подсказок. Анимация входа/качания/выхода в одном стиле. |
| `icon-map` | `icon-map.ts` | Маппинг строковых кодов иконок → Lucide-компоненты |

#### Стор (`lib/store/onboarding.ts`)

| Поле/метод | Тип | Назначение |
|------------|-----|------------|
| `tasks` | `OnboardingTaskDTO[]` | Все задачи с completion status |
| `welcomeSeen` | `boolean` | Видел ли пользователь welcome-модалку |
| `totalEarned` | `number` | Сумма наград за выполненные |
| `totalPossible` | `number` | Сумма всех возможных наград |
| `completedCount` / `totalCount` | `number` | Счётчики прогресса |
| `fetchOnboarding()` | action | Загрузка из API |
| `markWelcomeSeen()` | action | Отметка просмотра welcome |
| `completeTask(code)` | action | Отправка frontend-завершения |
| `handleTaskCompleted(event)` | action | Обработка WebSocket-события |
| `getTaskForPage(page)` | getter | Первая незавершённая задача для страницы |
| `getAnyTaskForPage(page)` | getter | Задача для страницы (даже если выполнена) — для красивого empty-state, который не пропадает после выполнения |

#### Страница достижений в кабинете

Путь: `/cabinet/achievements`
Файл: `frontend/app/(cabinet)/cabinet/achievements/page.tsx`

Содержит:
- Общий прогресс (прогресс-бар + процент + earned/possible)
- Список всех задач как карточки (иконка, название, описание, награда, дата выполнения)
- Выполненные — с зелёной рамкой и галочкой
- Невыполненные — с иконкой задачи и primary-акцентом

Навигация: секция «Обзор» в sidebar кабинета, иконка Trophy.

## Текущие задачи (10 штук, 60 кадров суммарно)

| # | Код | Название | Награда | Триггер |
|---|-----|----------|---------|---------|
| 1 | `create_project` | Первый проект | 5 | backend: `project.created` |
| 2 | `create_scene` | Первая группа | 5 | backend: `scene.created` |
| 3 | `first_generation` | Первая генерация | 10 | backend: `element.generation_success` |
| 4 | `open_lightbox` | Детальный просмотр | 5 | frontend |
| 5 | `download_original` | Первое скачивание | 5 | frontend |
| 6 | `first_upload` | Свой материал | 5 | backend: `element.upload_success` |
| 7 | `retry_generation` | Повторная генерация | 5 | frontend |
| 8 | `share_project` | Общий доступ | 5 | backend: `sharing.link_created` |
| 9 | `first_support_chat` | Связаться с поддержкой | 5 | backend: `feedback.first_message` |
| 10 | `first_batch_download` | Массовое скачивание | 5 | backend: `element.batch_download` |

## Контекстные подсказки

Помимо самой системы достижений, в онбординг встроены визуальные подсказки, которые направляют пользователя в правильную часть интерфейса в нужный момент.

### Дизайн-система подсказок

Все подсказки разделяют единый визуальный язык:
- **Фон** — линейный фиолетовый градиент `#8B7CF7 → #6B5CE7`
- **Текст** — белый
- **Стрелочка** — сплошной треугольник цвета `#6B5CE7`
- **Крестик закрытия** — белый полупрозрачный, внутри `rgba(255, 255, 255, 0.15)` при hover
- **Тень** — мягкая фиолетовая `rgba(107, 92, 231, 0.22)`, не крикливая
- **Вход** — fade-in 320ms
- **Живое состояние** — мягкое покачивание в сторону объекта (3px, 2.8s цикл), запускается после fade-in
- **Выход** — fade-out 260ms + лёгкий slide вниз + scale 0.96

Анимации используют `translate3d()` и `will-change: transform` → GPU-слой, без дрожания текста.

### Подсказка на карточке созданного проекта

**Компонент:** `ProjectCard.tsx` (inline, не через HintBubble — бейдж-лейбл проще)
**Когда:** `create_project` выполнен И `create_scene` не выполнен И есть ≥1 проект
**Где:** самая свежая карточка по `created_at` в `/projects`
**Что:** пульсирующая фиолетовая рамка вокруг карточки + лейбл «Откройте проект» снизу с стрелочкой вверх
**Скрытие:** автоматически, когда юзер входит в проект и создаёт группу (таск `create_scene` выполнен)

### Workspace-хинты (внутри проекта)

**Компонент:** `HintBubble.tsx`, состояние хранится через `useHintDismissal(key)` в localStorage

#### ConfigPanel hint
- **Где:** справа от панели, выше середины (`top: calc(50% - 160px)`)
- **Стрелочка:** влево
- **Текст:** «Выберите модель» + «Здесь настраивается модель генерации и её параметры»
- **Условия показа:** `first_generation` не выполнен И `configPanelOpen` И не скрыт вручную
- **Автоскрытие:** клик по любой кнопке/input/select внутри панели (модель, соотношение сторон, разрешение, формат, etc.) → fade-out
- **Ручное скрытие:** X в правом верхнем углу

#### PromptBar hint
- **Где:** над баром, прижат вплотную (`bottom: calc(100% + 6px)`)
- **Стрелочка:** вниз
- **Текст:** «Опишите идею» + пример-чип `кот-космонавт в неоновом лесу` с иконкой копирования
- **Условия показа:** `first_generation` не выполнен И не скрыт вручную
- **Автоскрытие:** клик по примеру (текст подставляется в textarea, фокус) ИЛИ первая успешная генерация
- **Ручное скрытие:** X в правом верхнем углу

### Хранение скрытия подсказок (localStorage)

Хук `useHintDismissal(key)` — `frontend/lib/hooks/useHintDismissal.ts`.

- Ключ в localStorage: `hint-dismissed:{key}`
- Значение: `"1"` если скрыто, иначе отсутствует
- SSR-safe: hydrated флаг, подсказка не моргает на mount
- **Dev-утилита:** `?reset-hints=1` в URL → хук очищает все `hint-dismissed:*` ключи и убирает параметр из адресной строки

### Единый welcome-поток

Фазы показа подсказок после регистрации:

1. **Welcome-модалка** — один раз, `welcomeSeen` в БД
2. **Empty state на `/projects`** — красивая большая папка, пока `create_project` не выполнен (и после, ghost-карточки остаются)
3. **Подсказка на карточке** — «Откройте проект», пока `create_scene` не выполнен
4. **Workspace hints** — ConfigPanel + PromptBar, пока `first_generation` не выполнен

## Полный flow нового пользователя

1. **Регистрация** → сигнал `create_user_subscription` создаёт подписку trial + начисляет trial_bonus_credits (количество из админки, по умолчанию 50).
2. **Первый вход** → `OnboardingBootstrap` загружает состояние → `WelcomeModal` показывает 3 шага + подсказку про достижения. Модалка **не упоминает** конкретный баланс.
3. **Навбар** → `OnboardingProgress` показывает круговой прогресс (0 из 8).
4. **Действие пользователя** (например, создание проекта) → backend-сигнал → `OnboardingService.try_complete()` → начисление кадров → WebSocket → `AchievementToast` (кастомный toast с иконкой и наградой, не блокирует UI).
5. **Попавер** (клик по прогрессу) → список достижений с прогресс-баром.
6. **Кабинет → Достижения** → полная страница с карточками всех достижений.
7. **Все выполнены** → трофей вместо числа в навбаре.

## Flow уведомления о достижении

```
Backend: task completed + credits awarded
  → WebSocket: onboarding_task_completed
  → Frontend: notification-ws.ts обработчик
    → useOnboardingStore.handleTaskCompleted() — обновляет стор
    → useCreditsStore.loadBalance() — обновляет баланс
    → showAchievementToast() — кастомный toast:
       [Icon] Первый проект     +5 🎬
              1 из 8
       Автоудаляется через 5 секунд, не блокирует UI
```

## Администрирование

Админка Django → Онбординг:
- **OnboardingTask**: CRUD задач с выбором иконки (30+ Lucide-иконок), категории, типа триггера.
- **UserOnboardingState**: просмотр состояний пользователей.
- **UserTaskCompletion**: просмотр выполнений.

Начальные задачи определены в миграции `0002_seed_onboarding_tasks.py`, тексты обновлены в `0003_update_task_texts.py`.

## Интеграции

- **Credits** (`credits`): начисление наград через `CreditsService.topup()` с `reason='onboarding_task'`.
- **Subscriptions** (`subscriptions`): trial_bonus_credits определяет стартовый баланс (отдельно от онбординг-наград).
- **WebSocket** (`notifications`): уведомления через тот же канал `user_{id}`.
- **Cabinet** (`cabinet`): страница `/cabinet/achievements` в секции «Обзор».
- **Elements** (`elements`): триггеры `element.generation_success` и `element.upload_success`.
- **Sharing** (`sharing`): триггер `sharing.link_created`.

## Feature gating

Онбординг **не гейтится** — доступен на всех тарифах, включая бесплатный. Это осознанное решение: система мотивирует пользователя изучить платформу и получить кадры для первых генераций.
