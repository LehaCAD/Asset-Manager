# Онбординг и система заданий — Спецификация

> Дата: 9 апреля 2026  
> Статус: Черновик  
> Контекст: Новые пользователи теряются после регистрации. Нет объяснения что делать, нет подсказок, нет мотивации исследовать фичи. Нужен минимальный онбординг с возможностью расширения до полной системы достижений.

---

## 1. Цель

Провести нового пользователя от регистрации до первой генерации за минимум шагов:
- **Welcome-модалка** — одноразовое приветствие после первого входа
- **Чеклист «Первые шаги»** — попровер в навбаре с заданиями и наградами в кадрах
- **Улучшенные empty states** — на каждом уровне (проекты, группы, элементы) с привязкой к заданиям
- **Admin-driven контент** — все тексты, иконки, награды редактируются в Django admin с live-preview

Система изолирована в отдельное приложение `apps/onboarding/`. Связь с остальным кодом — только через Django signals и `CreditsService`. Удаляется без следа.

---

## 2. Компоненты

### 2.1 Welcome-модалка

**Когда:** Первый вход после регистрации (поле `UserOnboardingState.welcome_seen = False`).

**Содержимое:**
- Заголовок: «Добро пожаловать в Раскадровку»
- Описание сервиса: одно предложение
- Карточка бонуса: «На вашем счёте бонусные кадры» (количество — динамическое, из баланса)
- Три шага-подсказки: Проект → Промпт → Результат (иконки Lucide: `folder-open`, `sparkles`, `image`)
- Gradient-кнопка «Начать»

**Поведение:**
- Показывается поверх `/projects` как модалка
- Закрывается по кнопке «Начать» или клику вне
- POST `/api/onboarding/welcome-seen/` → `UserOnboardingState.welcome_seen = True`
- Больше никогда не показывается

**Стиль:** Попап из брендбука — bg `#1C1C1E`, border `rgba(255,255,255,0.04)`, shadow `0 12px 40px rgba(0,0,0,0.5)` + glow `0 0 80px rgba(108,92,231,0.12)`, radius 16px, accent bar gradient `#6C5CE7 → #8B7CF7 → #A09AF0` сверху.

---

### 2.2 Прогресс-кольцо в навбаре

**Расположение:** Между балансом и уведомлениями. Текущий порядок навбара: `TrialBanner → Balance → Notifications → ThemeToggle → Avatar`. С онбордингом: `TrialBanner → Balance → **OnboardingProgress** → Notifications → ThemeToggle → Avatar`. Кнопка поддержки — отдельная задача, не входит в этот скоуп.

**Визуал:**
- Кольцо: трек `#1E293B`, заполнение `#8B7CF7` (primary accent), stroke-linecap round
- Внутри кольца: счётчик `2/8` — шрифт JetBrains Mono, цвет `#8B7CF7`
- Размер: 32×32px (как остальные кнопки навбара)

**Жизненный цикл:**
1. **В процессе** — кольцо заполняется пропорционально, внутри счётчик `N/M`
2. **Всё выполнено** — кольцо полностью зелёное `#22C55E`, внутри галочка
3. **Постоянное состояние** — превращается в иконку кубка (Lucide `trophy`), клик всё ещё открывает попровер как справочник по фичам

Кольцо **не исчезает** — остаётся навсегда как точка доступа к достижениям.

---

### 2.3 Попровер чеклиста

**Триггер:** Клик по прогресс-кольцу.

**Стиль:** Попап из брендбука — bg `#1C1C1E`, border `rgba(255,255,255,0.04)`, shadow + glow, radius 12px. Ширина 380px, max-height 480px (scroll).

**Структура:**
```
┌─────────────────────────────────────┐
│ Первые шаги           [kadr] +10/45 │
│ ████████░░░░░░░░░░░░░░░░░░░░  2/8  │
├─────────────────────────────────────┤
│ ✓ Создать первый проект      [K]+5 │ ← completed, opacity 0.45
│ ✓ Создать группу             [K]+5 │ ← completed
│ ▸ Сгенерировать изображение [K]+10 │ ← active, highlighted
│   Открыть в просмотрщике     [K]+5 │ ← pending
│   Скачать оригинал           [K]+5 │
│   Загрузить своё изображение [K]+5 │
│   Повторить генерацию        [K]+5 │
│   Поделиться проектом        [K]+5 │
├─────────────────────────────────────┤
│                   Все достижения →  │
└─────────────────────────────────────┘
```

**Состояния строки:**
- **Completed** — чекбокс `#22C55E` r6 с галочкой, текст line-through, opacity 0.45, награда зелёная
- **Active (следующий)** — border-left 3px `#8B7CF7`, bg `rgba(139,124,247,0.06)`, номер в бордерном чекбоксе, текст `#F8FAFC`, награда фиолетовая
- **Pending** — чекбокс border `#334155`, номер `#475569`, текст `#94A3B8`, награда серая

**Каждая строка содержит:**
- Чекбокс/номер (20×20, r6)
- Title (13px, weight 600/500)
- Description (11px, color secondary/muted) — мотивация «зачем»
- Награда справа: иконка кадра (Каркоины.svg) + число

**Header:** «Первые шаги» + иконка кадра + «+N из M» (заработано/всего) + прогресс-бар (gradient `#6C5CE7 → #8B7CF7`).

**Footer:** Ссылка «Все достижения →» — ведёт на `/cabinet/achievements` (будущий раздел).

---

### 2.4 Улучшенные empty states

Три уровня, привязанные к заданиям:

| Уровень | Страница | Задание | Текущая иконка | Новая иконка |
|---------|----------|---------|----------------|-------------|
| Проекты | `/projects` | `create_project` | `FolderOpen` muted | `FolderOpen` accent |
| Группы | Проект → список групп | `create_scene` | `Clapperboard` muted | `LayoutGrid` accent |
| Элементы | Группа → пустой грид | `first_generation` | `ImagePlus` muted | `Wand` accent |

**Изменения при незавершённом задании:**
- Иконка в accent-цвете `#8B7CF7` вместо muted
- Заголовок — из `empty_state_title` задания (из API)
- Описание — из `empty_state_desc` задания (из API)
- Кнопка — gradient `#6C5CE7 → #8B7CF7`, текст из `empty_state_cta`
- Плашка награды под описанием: иконка кадра + `+N кадров за выполнение`

**Когда задание выполнено:** Стандартный empty state без награды (обычная кнопка, иконка muted).

**Источник данных:** Фронтенд-стор `onboarding` хранит задания из API. Компоненты empty state проверяют: есть ли незавершённое задание для этой страницы → если да, рендерят из данных задания.

---

### 2.5 Welcome-модалка — уточнение иконок

В секции «три шага» используются Lucide иконки вместо эмодзи:
- Шаг 1: `folder-plus` — «Создайте проект»
- Шаг 2: `wand-sparkles` — «Напишите промпт»
- Шаг 3: `image` — «Получите результат»

Цвет иконок: `#8B7CF7`. Фон карточки шага: `rgba(139,124,247,0.06)`, border `rgba(139,124,247,0.1)`.

---

## 3. Модель данных

### 3.1 Новое приложение: `backend/apps/onboarding/`

Файлы: `models.py`, `admin.py`, `admin_forms.py`, `serializers.py`, `views.py`, `signals.py`, `services.py`.

#### OnboardingTask (Задание)

| Поле | Тип | Admin | Описание |
|------|-----|-------|----------|
| `code` | CharField, unique | readonly | Идентификатор: `create_project`, `first_generation` |
| `title` | CharField(120) | editable | «Сгенерировать изображение» |
| `description` | CharField(200) | editable | «Напишите промпт и нажмите Создать» |
| `icon` | CharField(50) | **visual picker** | Lucide icon name |
| `reward` | DecimalField | editable | Кадров за выполнение |
| `order` | PositiveIntegerField | editable | Порядок в чеклисте |
| `is_active` | BooleanField | editable | Включено/выключено |
| `category` | CharField | readonly | `onboarding` / `feature` / `milestone` |
| `trigger_type` | CharField | readonly | `backend_signal` / `frontend_action` |
| `trigger_event` | CharField(100), blank | readonly | `element.generation_success` (для backend_signal) или пустое (для frontend_action — код триггера определяется `code` поля) |
| `empty_state_title` | CharField(120), blank | editable | Заголовок empty state |
| `empty_state_desc` | CharField(200), blank | editable | Описание empty state |
| `empty_state_cta` | CharField(60), blank | editable | Текст кнопки empty state |
| `empty_state_page` | CharField, blank | editable (toggle) | `projects` / `scenes` / `elements` |
| `created_at` | DateTimeField, auto | — | — |

**Admin:** Поля `code`, `category`, `trigger_type`, `trigger_event` — readonly в форме (заполняются при создании через код/миграцию, не редактируются через UI).

#### UserTaskCompletion (Факт выполнения)

| Поле | Тип | Описание |
|------|-----|----------|
| `user` | ForeignKey(User) | — |
| `task` | ForeignKey(OnboardingTask) | — |
| `completed_at` | DateTimeField, auto_now_add | Когда выполнено |
| `reward_paid` | BooleanField, default=False | Идемпотентность начисления |

Constraint: `unique_together = ('user', 'task')`.

### 3.2 UserOnboardingState (Состояние онбординга)

Отдельная модель в `apps/onboarding/`, а **не** поле на User. Полная изоляция — удаление приложения удаляет и эту таблицу.

| Поле | Тип | Описание |
|------|-----|----------|
| `user` | OneToOneField(User, related_name='onboarding_state') | — |
| `welcome_seen` | BooleanField, default=False | Показана ли welcome-модалка |
| `backfill_done` | BooleanField, default=False | Ретроактивная проверка уже выполнена |

Создаётся автоматически при первом GET `/api/onboarding/` (get_or_create).

---

## 4. API

### 4.1 Endpoints

Все под префиксом `/api/onboarding/`.

#### GET `/api/onboarding/`

Возвращает состояние онбординга для текущего пользователя.

```json
{
  "welcome_seen": false,
  "tasks": [
    {
      "code": "create_project",
      "title": "Создать первый проект",
      "description": "Проект — папка для ваших генераций",
      "icon": "folder-open",
      "reward": 5,
      "order": 1,
      "completed": true,
      "completed_at": "2026-04-09T12:00:00Z",
      "empty_state": {
        "title": "Создайте первый проект",
        "description": "Папка для генераций и загрузок",
        "cta": "Создать проект",
        "page": "projects"
      }
    }
  ],
  "total_earned": 10,
  "total_possible": 45,
  "completed_count": 2,
  "total_count": 8
}
```

Фильтрация: только `is_active=True`. Сортировка по `order`.

#### POST `/api/onboarding/welcome-seen/`

Отмечает welcome-модалку как просмотренную.

```json
// Response
{ "ok": true }
```

#### POST `/api/onboarding/complete/`

Фронтенд-триггер для заданий с `trigger_type = frontend_action`.

```json
// Request
{ "task_code": "open_lightbox" }

// Response
{ "ok": true, "reward": 5, "new_balance": 65 }
```

Логика (внутри `transaction.atomic()`):
1. Найти задание по `code`
2. Проверить `trigger_type == 'frontend_action'`
3. `UserTaskCompletion.objects.get_or_create(user=user, task=task)`
4. Если `created` → `CreditsService.topup(user, reward, reason='onboarding_task', metadata={'task_code': code})`
5. Установить `reward_paid = True`
6. Вернуть новый баланс

**Атомарность:** Вся операция обёрнута в `transaction.atomic()`. `get_or_create` гарантирует идемпотентность даже при concurrent requests — unique constraint предотвращает дубликат, topup вызывается только при `created=True`.

**Reason constant:** Добавить `REASON_ONBOARDING_TASK = 'onboarding_task'` в `CreditsTransaction` model.

Ошибки:
- `task_code` не найден → 404
- Уже выполнено → 200 `{ "ok": true, "already_completed": true }`
- `trigger_type != 'frontend_action'` → 400

---

## 5. Логика завершения заданий

### 5.1 Backend signals (trigger_type = backend_signal)

Сервис `OnboardingService.try_complete(user, event_name)` — вызывается из signals:

| Event | Signal | Место вызова |
|-------|--------|-------------|
| `project.created` | `post_save` на `Project` | `apps/projects/models.py` |
| `scene.created` | `post_save` на `Scene` | `apps/scenes/models.py` |
| `element.generation_success` | — | `apps/elements/generation.py → finalize_success()` |
| `element.upload_success` | — | `apps/elements/tasks.py → process_upload()` |
| `sharing.link_created` | `post_save` на `SharedLink` | `apps/sharing/models.py` |

`OnboardingService.try_complete()`:
1. `OnboardingTask.objects.filter(trigger_event=event_name, is_active=True).first()`
2. Если нет задания → return
3. `UserTaskCompletion.objects.get_or_create(user=user, task=task)`
4. Если created → `CreditsService.topup(...)`, `reward_paid = True`

### 5.2 Frontend actions (trigger_type = frontend_action)

| Event | Место во фронтенде |
|-------|-------------------|
| `lightbox.opened` | `LightboxModal` при открытии |
| `element.downloaded` | Download-кнопка в `DetailPanel` |
| `generation.retried` | Кнопка «Повторить» в `DetailPanel` / `ElementCard` |

Фронтенд: `useOnboardingStore.completeTask(taskCode)` — **сначала проверяет локальный стор** (`if task.completed → return`), затем POST `/api/onboarding/complete/`. Это предотвращает лишние HTTP-запросы (lightbox открывается сотни раз за сессию).

### 5.3 Изоляция

Signals для бэкенд-триггеров подключаются в `apps/onboarding/signals.py` и регистрируются в `apps/onboarding/apps.py → ready()`. Если приложение удалено из `INSTALLED_APPS` — signals не регистрируются, остальной код не затронут.

Фронтенд-вызовы обёрнуты в try/catch — если API вернул ошибку, UI продолжает работать.

---

## 6. Начальные задания (seed data)

Миграция `0002_seed_onboarding_tasks.py` создаёт 8 заданий:

| # | code | title | description | icon | reward | trigger_type | trigger_event | empty_state_page |
|---|------|-------|-------------|------|--------|-------------|---------------|-----------------|
| 1 | `create_project` | Создать первый проект | Проект — папка для ваших генераций | `folder-open` | 5 | backend_signal | `project.created` | `projects` |
| 2 | `create_scene` | Создать группу в проекте | Группы помогают организовать сцены по смыслу | `layout-grid` | 5 | backend_signal | `scene.created` | `scenes` |
| 3 | `first_generation` | Сгенерировать изображение | Напишите промпт и нажмите «Создать» — нейросеть создаст картинку за секунды | `wand-sparkles` | 10 | backend_signal | `element.generation_success` | `elements` |
| 4 | `open_lightbox` | Открыть в просмотрщике | Нажмите на карточку — полноэкранный просмотр с деталями генерации | `maximize` | 5 | frontend_action | — | — |
| 5 | `download_original` | Скачать оригинал | Кнопка «Скачать» сохранит в полном качестве — через контекстное меню получите только сжатое превью | `download` | 5 | frontend_action | — | — |
| 6 | `first_upload` | Загрузить своё изображение | Добавьте фото или референс — используйте как основу для генерации | `upload` | 5 | backend_signal | `element.upload_success` | — |
| 7 | `retry_generation` | Повторить генерацию | Не устроил результат? Кнопка «Повторить» — тот же промпт, свежий результат | `refresh-cw` | 5 | frontend_action | — | — |
| 8 | `share_project` | Поделиться проектом | Отправьте ссылку коллеге — он увидит проект и сможет оставить комментарий | `share-2` | 5 | backend_signal | `sharing.link_created` | — |

Итого: **45 кадров** бонусом за полное прохождение.

---

## 7. Django Admin

### 7.1 Форма OnboardingTask

**Секции формы:**
1. **Основное** — title, description, reward, order, is_active
2. **Иконка** — visual picker (сетка Lucide иконок с поиском и фильтрацией по категориям)
3. **Текст пустого экрана** — empty_state_title, empty_state_desc, empty_state_cta, empty_state_page (toggle buttons)
4. **Предпросмотр** — live-preview (обновляется при вводе, client-side JS)

**Readonly поля:** code, category, trigger_type, trigger_event — отображаются, но не редактируются.

### 7.2 Иконка — визуальный picker

**MVP-версия:** Визуальная сетка из ~30 предзагруженных иконок (наиболее релевантные для заданий). Выбранная подсвечена фиолетовым бордером `#8B7CF7`. Имя иконки отображается под сеткой.

Иконки в пикере: `folder-open`, `layout-grid`, `wand-sparkles`, `image`, `maximize`, `download`, `upload`, `refresh-cw`, `share-2`, `trophy`, `star`, `zap`, `sparkles`, `palette`, `video`, `film`, `camera`, `layers`, `grid-3x3`, `copy`, `scissors`, `type`, `pen-tool`, `eye`, `heart`, `bookmark`, `bell`, `settings`, `user`, `lock`.

Сетка: 8 колонок, каждая иконка 36×36px. Иконки отрисовываются как inline SVG в шаблоне (статический набор, не динамическая загрузка).

**Будущее (система C):** Полный поиск по всем 1500+ Lucide иконкам с фильтрацией по категориям и тегам. Добавить при необходимости.

### 7.3 Live Preview

Два превью обновляются в реальном времени при вводе:
1. **Строка чеклиста** — как задание будет выглядеть в попровере (active state)
2. **Empty state** — как будет выглядеть пустой экран (если `empty_state_page` заполнен)

Реализация: `admin/onboarding/task_preview.js` — слушает input/change на полях, обновляет DOM превью. По паттерну `aimodel_workflow.js`.

### 7.4 Кастомный шаблон

`backend/templates/admin/onboarding/onboardingtask/change_form.html` — расширяет стандартную Django admin форму, добавляет секции icon picker и preview.

---

## 8. Frontend

### 8.1 Новый стор: `lib/store/onboarding.ts`

```typescript
interface OnboardingState {
  tasks: OnboardingTaskDTO[];
  welcomeSeen: boolean;
  totalEarned: number;
  totalPossible: number;
  completedCount: number;
  totalCount: number;
  isLoaded: boolean;
}

interface OnboardingActions {
  fetchOnboarding: () => Promise<void>;
  markWelcomeSeen: () => Promise<void>;
  completeTask: (taskCode: string) => Promise<void>;
  getTaskForPage: (page: string) => OnboardingTaskDTO | null;
  isAllCompleted: () => boolean;
}
```

Загрузка: один раз при инициализации workspace layout (рядом с `fetchBalance`, `fetchNotifications`).

### 8.2 Новые компоненты

| Компонент | Расположение | Описание |
|-----------|-------------|----------|
| `WelcomeModal` | `components/onboarding/WelcomeModal.tsx` | Модалка первого входа |
| `OnboardingProgress` | `components/onboarding/OnboardingProgress.tsx` | Прогресс-кольцо для навбара |
| `OnboardingPopover` | `components/onboarding/OnboardingPopover.tsx` | Попровер чеклиста |
| `OnboardingTaskRow` | `components/onboarding/OnboardingTaskRow.tsx` | Строка задания в чеклисте |
| `OnboardingEmptyState` | `components/onboarding/OnboardingEmptyState.tsx` | Enhanced empty state с наградой |

### 8.3 Интеграция

**Navbar** (`components/layout/Navbar.tsx`):
- Добавить `<OnboardingProgress />` между балансом и кнопкой поддержки
- Компонент рендерит прогресс-кольцо + Popover (shadcn)

**Workspace Layout** (`app/(workspace)/layout.tsx`):
- Добавить `<WelcomeModal />` — показывается если `!welcomeSeen`
- Вызвать `fetchOnboarding()` при маунте

**ProjectGrid** (`components/project/ProjectGrid.tsx`):
- EmptyState проверяет `onboardingStore.getTaskForPage('projects')`
- Если задание есть и не выполнено → `<OnboardingEmptyState task={task} />`
- Иначе → текущий EmptyState

**ScenarioTableClient** (`components/scene/ScenarioTableClient.tsx`):
- Аналогично, `getTaskForPage('scenes')`

**EmptyState** (`components/element/EmptyState.tsx`):
- Существующий EmptyState — это зона drag-and-drop для загрузки файлов. Она остаётся.
- Онбординг-блок добавляется **над** существующим EmptyState как отдельная секция: «Или сгенерируйте первое изображение — напишите промпт выше ↑»
- После выполнения задания — онбординг-блок исчезает, остаётся стандартный upload EmptyState

### 8.4 Lucide иконки по имени

Фронтенд получает имя иконки как строку (`"wand-sparkles"`). Для рендера используем **статический маппинг** (не `import { icons }` — это тянет все 1500+ иконок в бандл):

```typescript
// components/onboarding/icon-map.ts
import { FolderOpen, LayoutGrid, WandSparkles, Maximize, Download, Upload, RefreshCw, Share2, CircleDot } from 'lucide-react';

const ONBOARDING_ICONS: Record<string, LucideIcon> = {
  'folder-open': FolderOpen,
  'layout-grid': LayoutGrid,
  'wand-sparkles': WandSparkles,
  'maximize': Maximize,
  'download': Download,
  'upload': Upload,
  'refresh-cw': RefreshCw,
  'share-2': Share2,
};

export function getOnboardingIcon(name: string): LucideIcon {
  return ONBOARDING_ICONS[name] ?? CircleDot;
}
```

При добавлении новых заданий с новыми иконками — добавить import в маппинг. Это сохраняет tree-shaking.

### 8.5 Тост при выполнении задания

При завершении задания (бэкенд-сигнал через WebSocket или фронтенд-триггер):
- Тост (sonner): «Задание выполнено: {title} — +{reward} кадров»
- Обновление баланса в навбаре
- Обновление прогресс-кольца

Для бэкенд-триггеров: WebSocket event `onboarding_task_completed` через канал `user_{user_id}` (notification consumer), **не** через `project_{project_id}`. На странице `/projects` нет project-scoped WebSocket — поэтому используем пользовательский канал.

Payload:
```typescript
interface WSOnboardingTaskCompletedEvent {
  type: "onboarding_task_completed";
  task_code: string;
  task_title: string;
  reward: number;
  new_balance: string;
  completed_count: number;
  total_count: number;
}
```

Фронтенд: добавить обработчик в notification WebSocket handler → обновить `onboardingStore` + показать тост.

---

## 9. Edge cases

| Кейс | Решение |
|------|---------|
| Пользователь зарегистрировался до внедрения онбординга | При первом GET `/api/onboarding/` (если `backfill_done=False`): проверить `Project.objects.filter(user=user).exists()` → complete `create_project`; `Scene.objects.filter(project__user=user).exists()` → complete `create_scene`; `Element.objects.filter(scene__project__user=user, status='completed').exists()` → complete `first_generation`, `first_upload` (по типу). Все без reward. Установить `backfill_done=True`. Выполняется один раз. |
| Задание деактивировано (`is_active=False`) | Не возвращается в API, не учитывается в счётчике |
| Повторный POST complete для того же задания | 200 OK, `already_completed: true`, без повторного начисления |
| Пользователь удалил проект после выполнения задания | Completion остаётся, reward не отзывается |
| Новое задание добавлено позже (категория `feature`) | Появляется в чеклисте автоматически, кольцо обновляется |
| Все задания выполнены | Кольцо → кубок, попровер работает как справочник |
| WebSocket недоступен | Фронтенд polling при возврате фокуса на вкладку (как уведомления) |
| Триал истёк, фичи заблокированы | Задания, требующие заблокированных фич (шеринг на бесплатном тарифе), показываются с пометкой «Доступно на тарифе X» |

---

## 10. Расширение до системы C (будущее)

Архитектура готова к расширению:

- **Категория `feature`** — задания для новых фич: «Попробуйте усиление промпта», «Используйте image input»
- **Категория `milestone`** — достижения за объём: «100 генераций», «10 проектов»
- **Страница `/cabinet/achievements`** — полный вид достижений с фильтрами по категориям
- **Ежедневные/еженедельные задания** — добавить поля `starts_at`, `expires_at`, `repeatable`
- **Бейджи/награды** — отдельная модель `Badge` с привязкой к milestone-заданиям

Для MVP это **не нужно**. Модель данных не блокирует эти расширения.

---

## 11. Что не входит в MVP

- Страница `/cabinet/achievements` (только ссылка в попровере)
- Ежедневные/еженедельные задания
- Бейджи и профиль достижений
- Анимации при выполнении заданий (кроме тоста)
- Персонализация по use-case при регистрации
- Шаблоны/примеры контента в empty states

---

## 12. Файловая структура

```
backend/
├── apps/onboarding/
│   ├── __init__.py
│   ├── apps.py              → ready() регистрирует signals
│   ├── models.py            → OnboardingTask, UserTaskCompletion, UserOnboardingState
│   ├── admin.py             → OnboardingTaskAdmin с custom template
│   ├── admin_forms.py       → OnboardingTaskAdminForm
│   ├── serializers.py       → OnboardingTaskSerializer
│   ├── views.py             → OnboardingViewSet (list, welcome-seen, complete)
│   ├── services.py          → OnboardingService.try_complete()
│   ├── signals.py           → Подписки на post_save Project, Scene, SharedLink + прямые вызовы
│   ├── urls.py
│   └── migrations/
│       ├── 0001_initial.py
│       └── 0002_seed_onboarding_tasks.py

backend/
├── templates/admin/onboarding/onboardingtask/
│   └── change_form.html     → Кастомный шаблон с icon picker + preview
├── static/admin/onboarding/
│   ├── task_preview.js       → Live preview JS
│   ├── icon_picker.js        → Lucide icon picker
│   ├── lucide_icons.json     → Статический JSON с именами/тегами/SVG
│   └── onboarding_admin.css  → Стили для кастомной формы

frontend/
├── lib/
│   ├── api/onboarding.ts     → API client
│   ├── store/onboarding.ts   → Zustand store
│   └── types/index.ts        → OnboardingTaskDTO, OnboardingState
├── components/onboarding/
│   ├── WelcomeModal.tsx
│   ├── OnboardingProgress.tsx
│   ├── OnboardingPopover.tsx
│   ├── OnboardingTaskRow.tsx
│   └── OnboardingEmptyState.tsx
```
