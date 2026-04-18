# Workspace

> Актуальное состояние подсистемы. Обновлять при внесении изменений.
> Последнее обновление: 2026-04-14

---

## Назначение

Workspace — основной экран работы пользователя. Здесь просматривают, генерируют, загружают, организуют и рецензируют медиа-материалы (изображения и видео). Workspace объединяет все ключевые домены: элементы, группы, генерацию, шеринг, ревью.

## Иерархия данных

```
Project
├── Elements (корень проекта, scene=null)
└── Groups (Scene в коде)
     ├── Elements
     └── Subgroups (вложенные группы)
          └── Elements
```

- **Project** — корневой контейнер. У пользователя может быть несколько проектов.
- **Group (Scene)** — папка внутри проекта. В коде модель называется `Scene`, в UI — «Группа».
- **Element** — единица контента: изображение или видео. Может лежать в группе (`scene=<id>`) или в корне проекта (`scene=null`).

### Вложенность групп

Максимум **2 уровня**: группа → подгруппа. Третий уровень заблокирован валидацией на бэкенде (`parent.parent must be None`).

```
Project root (level 0)
  └─ Group A (level 1, parent=null)
       └─ Subgroup A1 (level 2, parent=A)
            └─ Elements
```

### Ключевые поля

**Scene / Group:**

| Поле | Тип | Назначение |
|------|-----|------------|
| `name` | string | Название группы |
| `parent` | number \| null | Родительская группа (null = корень проекта) |
| `order_index` | number | Порядок сортировки |
| `headliner` | number \| null | ID элемента-обложки |
| `headliner_url` | string | URL обложки (полноразмер) |
| `headliner_thumbnail_url` | string | URL обложки (тумбнейл) |
| `element_count` | number | Количество элементов |
| `children_count` | number | Количество подгрупп |
| `depth` | number | Уровень вложенности |
| `total_spent` | string | Сумма потраченных кадров |
| `storage_bytes` | number | Объём хранилища |
| `preview_thumbnails` | string[] | Массив URL превью (для 2×2 сетки) |
| `status` | enum | DRAFT, IN_PROGRESS, REVIEW, APPROVED |

**Element:**

| Поле | Тип | Назначение |
|------|-----|------------|
| `element_type` | "IMAGE" \| "VIDEO" | Тип медиа |
| `source_type` | "GENERATED" \| "UPLOADED" | Источник |
| `status` | enum | PENDING, PROCESSING, UPLOADING, COMPLETED, FAILED |
| `approval_status` | enum \| null | IN_PROGRESS, APPROVED, null |
| `is_favorite` | boolean | Избранное |
| `prompt_text` | string | Промпт генерации |
| `ai_model_name` | string | Название модели |
| `generation_config` | object | Параметры генерации (seed, width, height...) |
| `generation_cost` | string | Стоимость генерации в кадрах |
| `file_url` | string | Оригинал (S3) |
| `thumbnail_url` | string | Тумбнейл 256px |
| `preview_url` | string | Превью 800px |
| `file_size` | number | Размер файла в байтах |
| `original_filename` | string | Имя файла |
| `comment_count` | number | Количество комментариев (client-side) |
| `review_summary` | object \| null | `{ action, author_name }` — последний отзыв |
| `error_message` | string | Текст ошибки (для FAILED) |

**Client-side расширения (WorkspaceElement):**

| Поле | Тип | Назначение |
|------|-----|------------|
| `client_optimistic_kind` | "upload" \| "generation" | Тип оптимистичного элемента |
| `client_generation_submit_state` | enum | idle, submitting, accepted, rejected |
| `client_upload_phase` | enum | resize, presign, upload_thumb, upload_full, completing |
| `client_upload_progress` | number | 0–100% |

---

## Z-index карта

Единый источник правды по стекингу (снизу вверх):

| Слой | z-index | Комментарий |
|------|---------|-------------|
| Grid content | `auto` | Базовый поток |
| PromptBar (floating bottom) | `z-40` | Над контентом, но ниже sticky-хедеров |
| Navbar | `z-50` | sticky top |
| Workspace toolbar | `z-30` | Внутренний, sticky НЕ ставим |
| Radix popover / dropdown (портал) | `z-50` | По умолчанию из shadcn |
| LightboxModal | `z-[55]` | Перекрывает Navbar и Toolbar |
| ReviewsOverlay | `z-[60]` | Fullscreen поверх lightbox |
| Mobile ConfigPanel top-sheet | `z-[60]` | Overlay над workspace |
| ModelSelector (мобила fullscreen) | `z-[70]` | Поверх ConfigPanel sheet |
| ReviewsOverlay delete dialog | `z-[70]` | Поверх overlay |
| ReviewerLightbox (шеринг) | `z-[80]` | Максимум |
| Sonner Toaster | managed | Отдельный root |

Эти значения согласованы — менять поштучно опасно.

## Роутинг

```
/projects                                 → ProjectGrid (список проектов)
/projects/[id]                           → WorkspaceContainer (корень проекта)
/projects/[id]/groups/[groupId]          → WorkspaceContainer (внутри группы)
/projects/[id]/scenes/[sceneId]          → редирект на /groups/[sceneId]
```

`WorkspaceContainer` — главный контейнер. Принимает `projectId` и опциональный `groupId`. Если `groupId` не указан — показывает корень проекта.

---

## Зоны Workspace

```
┌─────────────────────────────────────────────────────────────┐
│  Navbar (h-12, sticky top)                                  │
├──────────┬──────────────────────────────────────────────────┤
│          │  Breadcrumbs + [+ Группа] + Filters + Reviews + │
│          │  Display Settings                                │
│  Config  ├──────────────────────────────────────────────────┤
│  Panel   │                                                  │
│  (left)  │  ElementGrid                                     │
│          │  ┌─ Groups section (collapsible) ──────────────┐ │
│  48px    │  │  GroupCard  GroupCard  GroupCard             │ │
│  collapsed│  └────────────────────────────────────────────┘ │
│          │  ┌─ Elements section (collapsible) ────────────┐ │
│  ~280px  │  │  ElementCard  ElementCard  ElementCard      │ │
│  expanded│  │  ElementCard  ElementCard  ElementCard      │ │
│          │  └────────────────────────────────────────────┘ │
│          │                                                  │
│          ├──────────────────────────────────────────────────┤
│          │  PromptBar (floating, absolute bottom)           │
├──────────┴──────────────────────────────────────────────────┤
│  ElementBulkBar (floating, center bottom, над PromptBar)    │
└─────────────────────────────────────────────────────────────┘
```

### Зона 1: Navbar

Файл: `frontend/components/layout/Navbar.tsx`

Глобальная навигация, видимая на всех страницах workspace. Логотип слева, остальное — правая группа с `gap-2`, единая высота `h-9`. Центр — текст статуса подписки.

| Элемент | Позиция | Видимость | Описание |
|---------|---------|-----------|----------|
| Логотип (Clapperboard) | left | all | Иконка всегда; текст «Раскадровка» — только sm+ |
| Подписка-статус | center | md+ | Текст + CTA «Выбрать тариф» (target=_blank). Показывается для free / trial / expired / cancelled; скрыт на pricing и для активных платных тарифов. См. `subscriptions.md` → «Статус в навбаре» |
| Баланс кадров | right | all | h-9 пилюля с KadrIcon + formatCurrency |
| OnboardingProgress | right | sm+ | Progress ring с completedCount (на мобиле заменён пунктом «Достижения» в avatar-popover) |
| FeedbackButton | right | all | h-9 pill «Чат поддержки» (текст). Зелёная точка = непрочитанный ответ. Popover на мобиле — fullscreen ширина, половина высоты |
| Bell (уведомления) | right | all | h-9 w-9 icon + бейдж непрочитанных (WebSocket + polling 30s) |
| Avatar (user menu) | right | all | h-9 w-9 rounded-full (цвет primary, инициалы). В попапе: имя + `<PlanBadge>`, email, квота хранилища, «Личный кабинет» (target=_blank), «Достижения» — **только на xs**, сегментированный переключатель темы, «Выйти» |

**PlanBadge** (`components/subscription/PlanBadge.tsx`) — инлайн-пилюля с тирой: FREE (teal→emerald), PLUS/PRO/TEAM/ENT (indigo→violet), TRIAL (amber→pink).

**Тема**: сегментированный свитч `[Sun][Moon]` в аватар-попапе. Читает `resolvedTheme` из `next-themes` (поддерживает `system`).

**Logout:** `handleLogout()` делает `logout()` (очистка стора + кук) и затем **hard reload** через `window.location.href = "/login"`. Это гарантирует, что все React-эффекты, WebSocket-соединения и кеши сбрасываются до монтирования `/login`. Дополнительно `AuthGuard` не делает redirect на auth-роутах (login, register, forgot-password, reset-password, verify-email) — предотвращает гонку.

### Мобильная адаптация

- Navbar центральный текст скрыт на <md (места нет), остаётся только правая группа
- Grid плотность — условная (см. «ElementGrid mobile»), `DisplaySettingsPopover` на мобиле не показывает блок «Размер»
- Toolbar — 2 ряда: (Row 1) навигационный dropdown + title; (Row 2) «Группа» + «Отзывы» слева, иконки «Фильтры» + «Вид» справа
- ConfigPanel — top-sheet (раскрывается сверху) по клику на кнопку «⚙ Выбрать модель и параметры» над PromptBar
- ModelSelector — fullscreen overlay z-[70], click-outside отключён (закрытие только по ✕ или выбору)
- PromptBar: `mb-2 mx-2 mt-0`, rounded-b-xl (верхние углы square — стыкуются с кнопкой «Выбрать модель» rounded-t-xl)
- Кнопка «Создать»: компакт — иконка ↑ + цена, без слова «Создать»
- Lightbox — touch-swipe prev/next

### Зона 2: ConfigPanel (левая панель генерации)

Файл: `frontend/components/generation/ConfigPanel.tsx`

Сворачиваемая панель настроек AI-генерации. В свёрнутом состоянии — 48px, кнопка раскрытия. В развёрнутом — полная панель.

**Содержимое (сверху вниз):**

1. **Заголовок:** «Модель» + кнопка сворачивания
2. **Выбор модели:** Кнопка с превью и названием текущей модели → открывает ModelSelector
3. **Переключатель вариантов** (если в семействе ≥ 2 модели): pills или select, зависит от `family.variant_ui_control`
4. **ParametersForm:** Динамические параметры из `parameters_schema` модели (см. «Параметры генерации»)
5. **Стоимость:** Расчётная цена в кадрах, предупреждение при недостатке средств

### Зона 3: Toolbar (верхняя панель над гридом)

Встроена в `WorkspaceContainer`, не отдельный компонент.

| Элемент | Описание |
|---------|----------|
| **Breadcrumbs** | Проекты → Проект «...» → Группа «...» (кликабельные) |
| **Кнопка «+ Группа»** | Создать новую группу в текущем контексте |
| **ElementFilters** | Попап с фильтрами: Все, Избранное, Изображения, Видео |
| **Кнопка «Отзывы»** | Открывает ReviewsOverlay, бейдж с количеством непрочитанных |
| **DisplaySettingsPopover** | Настройки вида: размер, пропорции, заполнение, метаданные |

### Зона 4: ElementGrid (основная рабочая область)

Файл: `frontend/components/element/ElementGrid.tsx`

Рендерит две секции с возможностью сворачивания:

1. **Секция групп** — SectionHeader + GroupCard'ы
2. **Секция элементов** — SectionHeader + ElementCard'ы

Между секциями — разделительная линия. Каждая секция имеет заголовок с чекбоксом «выделить все» и кнопкой сворачивания.

**DnD (Drag & Drop):**
- Элемент → Элемент: реордеринг внутри секции
- Элемент → Группа: перемещение в группу
- Группа → Группа: реордеринг групп
- Заблокирован для элементов в статусах UPLOADING, PROCESSING, PENDING
- Мульти-выделение: при перетаскивании показывает стопку карточек с счётчиком

**Конфигурация грида элементов по размеру и соотношению сторон:**

Разный `minWidth` для разных AR обеспечивает примерно равную площадь карточек.
Portrait получает меньший minWidth → больше колонок → каждая карточка уже → площадь не раздувается.
Пропорция: landscape : square : portrait ≈ 1.0 : 0.75 : 0.65 (из формулы `width ∝ sqrt(aspectRatio)`).

| Размер | Gap | landscape | square | portrait |
|--------|-----|-----------|--------|----------|
| compact | gap-2.5 | 260px | 195px | 170px |
| medium | gap-3 | 320px | 240px | 210px |
| large | gap-4 | 400px | 300px | 260px |

**Конфигурация грида групп:** зависит только от размера (не от aspect ratio). Группы всегда имеют фиксированное соотношение сторон (~5:4).

| Размер | Min column width |
|--------|------------------|
| compact | 260px |
| medium | 320px |
| large | 400px |

### Зона 5: PromptBar (плавающий промптбар)

Файл: `frontend/components/generation/PromptBar.tsx`

Зафиксирован внизу экрана поверх грида. Основной инструмент запуска генерации.

**Структура (сверху вниз):**

1. **Футер PromptBar:** PromptEnhanceToggle (встроен в нижний ряд карточки PromptBar, гейтится подпиской)
2. **Основная карточка:**
   - **Кнопка ввода изображений** (left): ImagePlus → открывает ModeSelector или ElementSelectionModal
   - **Textarea** (center): промпт, авто-рост 1–6 строк, Ctrl+Enter = генерация
   - **Тумбнейлы** (под textarea): выбранные изображения как PromptThumbnailPopup (замена/удаление)
   - **Кнопка «Создать»** (right): градиентная, иконка + текст, disabled если не canGenerate()

### Зона 6: ElementBulkBar (плавающая панель массовых действий)

Файл: `frontend/components/element/ElementBulkBar.tsx`

Появляется при выделении элементов. Зафиксирована по центру внизу, над PromptBar.

| Секция | Содержимое |
|--------|------------|
| Left | Чекбокс (полный/частичный/пустой) + счётчик «X из Y» |
| Center | Кнопки: Поделиться (гейт), Переместить, Удалить |
| Right | Кнопка закрыть (×) |

---

## Карточки

### ElementCard

Файл: `frontend/components/element/ElementCard.tsx`

Основная единица контента в гриде.

**Структура:**

```
┌──────────────────────────────┐
│ [☐]              [★] [🎬] [AI]│  top-2: бейджи
│                               │
│         Thumbnail / Media     │  Превью элемента
│         (aspect-ratio)        │
│                               │
│ [💬 3]             [↓]  [🗑]  │  bottom-2: бейджи
├───────────────────────────────┤
│ filename.jpg                ⋮ │  Metadata footer
│ Статус: ● В работе            │  (опционально)
└───────────────────────────────┘
```

**Состояния элемента (оверлеи):**

| Статус | Оверлей | Индикатор |
|--------|---------|-----------|
| PENDING | Полупрозрачный | Спиннер + «Ожидание...» + таймер |
| PROCESSING | Полупрозрачный | Спиннер + «Генерация: {model}» + таймер |
| UPLOADING | Полупрозрачный | Спиннер + фаза + прогресс-бар 0–100% |
| SUBMITTING | Тёмный оверлей | Спиннер + «Отправка...» (до ответа API) |
| FAILED | Двухчастный (единственный слой) | Верх: иконка ошибки + текст. Низ: сообщение + кнопки «Повторить» и «Удалить». Top-right бейджи (Star/Type/AI) **скрыты**, hover-оверлей **не показывается** — чтобы не конфликтовать с info-полосой |
| COMPLETED | Нет оверлея | Обычное превью с hover-действиями |

**Фазы загрузки (русские подписи):**
- resize → «Подготовка...»
- presign → «Подготовка...»
- upload_thumb → «Загружаем...»
- upload_full → «Загружаем...»
- completing → «Почти готово...»

**Metadata footer** (показывается если `showMetadata=true` И `status=COMPLETED`):**
- Строка 1: Имя файла (truncate) + дропдаун-меню (Скачать, Переименовать, Переместить, Удалить)
- Строка 2: Статус согласования (дропдаун с цветными пиллами)

**Review indicator** — цветная полоска 3px сверху превью:
- `approved` → зелёная (`bg-emerald-500`)
- `changes_requested` → оранжевая (`bg-orange-500`)
- `rejected` → красная (`bg-red-500/70`)

### GroupCard

Файл: `frontend/components/element/GroupCard.tsx`

Карточка группы в гриде. Визуально — стопка из 3 слоёв (стэк-эффект).

**Структура:**

```
   ┌── задний слой (dark) ─────────┐  +stackStep
  ┌── средний слой (mid) ──────────┐  +stackStep
 ┌── передний слой (bright) ────────┐
 │                                  │
 │    Headliner thumbnail           │  Обложка или иконка папки
 │    или пустое состояние          │
 │                                  │
 ├──────────────────────────────────┤
 │ Название группы              ⋮  │  Footer
 │ 📄 12 элементов  💰 50  💾 2MB   │  Метаданные
 └──────────────────────────────────┘
```

**Stack offset по размеру:**
- compact: 5px (ширина стэка 310px, карточка 300×240)
- medium: 6px (ширина стэка 392px, карточка 380×304)
- large: 7px (ширина стэка 494px, карточка 480×384)

**Footer:**
- Название группы (кликабельное)
- Layers icon + количество элементов
- KadrIcon + потрачено кадров (если есть)
- HardDrive icon + размер хранилища (если есть)

**Дропдаун-меню:** Переименовать, Поделиться (с гейтом подписки), Удалить

### SceneCard

Файл: `frontend/components/scene/SceneCard.tsx`

Используется на уровне проекта для списка сцен (отличается от GroupCard — проще, с drag-handle).

- Превью: сетка 2×2 из `preview_thumbnails` или headliner
- Бейдж «Группа» (top-left)
- GripVertical (top-right, hover) — для drag-and-drop
- Footer: название + меню + метаданные

---

## Бейдж-система

Документ: `docs/ux-analyses/2026-04-05-badge-system-unification.md`

Два фиксированных размера, **не зависят от размера карточки:**

| Токен | Размер | Иконка | Padding | Применение |
|-------|--------|--------|---------|------------|
| **badge-sm** | 24×24 (h-6 w-6) | 14px (h-3.5 w-3.5) | p-[5px] | Type, AI, Play mini, Comment count, Review status |
| **badge-md** | 28×28 (h-7 w-7) | 16px (h-4 w-4) | p-1.5 | Checkbox, Star, Download, Delete, Menu |

**Стиль оверлейных бейджей:** `rounded-md bg-black/60 backdrop-blur-sm`

### Бейджи на ElementCard

| Бейдж | Позиция | Видимость | Условие |
|-------|---------|-----------|---------|
| **Checkbox** (badge-md) | top-2 left-2 | Hover или multi-select mode | Всегда (кроме FAILED) |
| **Star** (badge-md) | top-2 right-2 | Заполненная = всегда; пустая = hover. Скрыт при UPLOADING и FAILED | `is_favorite` |
| **Media type** (badge-sm) | top-2 right-2 | Только при `status === "COMPLETED"` — бессмысленно показывать тип для карточек без медиа | Image или Video иконка |
| **AI** (badge-sm) | top-2 right-2 | Только при `status === "COMPLETED"` И `source_type === "GENERATED"` | — |
| **Cancel** (badge-sm) | top-2 right-2 | Во время загрузки | Заменяет бейджи при UPLOADING |
| **Comment count** (badge-sm) | bottom-2 left-2 | Always (если > 0) | `comment_count > 0` И `COMPLETED` |
| **Download** (badge-md) | bottom-2 left-2 | Hover | `file_url` существует |
| **Delete** (badge-md) | bottom-2 right-2 | Hover | Всегда |
| **Play** (badge-md) | Center | Hover | Только для VIDEO |

**Логика comment count:**
- 1 комментарий → только иконка
- 2–99 → иконка + число
- 100+ → иконка + «99+»

### Статусы согласования

| Значение | Подпись | Цвет точки | Цвет текста | Цвет фона |
|----------|---------|------------|-------------|------------|
| `null` | «Нет статуса» | `#94A3B8` | `#94A3B8` | `#475569/12.5%` |
| `IN_PROGRESS` | «В работе» | `#60A5FA` | `#60A5FA` | `#3B82F6/12.5%` |
| `APPROVED` | «Согласовано» | `#4ADE80` | `#4ADE80` | `#22C55E/12.5%` |

---

## Настройки отображения

Файл: `frontend/components/display/DisplaySettingsPopover.tsx`

```typescript
interface DisplayPreferences {
  size: "compact" | "medium" | "large";
  aspectRatio: "landscape" | "square" | "portrait";
  fitMode: "fill" | "fit";
  showMetadata: boolean;
}
```

### Размер карточек

| Размер | Подпись | Иконка | Грид gap |
|--------|---------|--------|----------|
| compact | Компактный | Grid3x3 | gap-2.5 |
| medium | Средний | LayoutGrid | gap-3 |
| large | Крупный | Square | gap-4 |

**Размеры элементных карточек (px, справочные — используются в DnD overlay):**

| | landscape (16:9) | square (1:1) | portrait (3:4) |
|-|------------------|--------------|----------------|
| compact | 360×202 ~73k | 270×270 ~73k | 235×313 ~74k |
| medium | 440×248 ~109k | 330×330 ~109k | 290×387 ~112k |
| large | 560×315 ~176k | 420×420 ~176k | 365×487 ~178k |

**Размеры групповых карточек (px):**

| | width×height | stackStep | stackWidth |
|-|-------------|-----------|------------|
| compact | 300×240 | 5px | 310 |
| medium | 380×304 | 6px | 392 |
| large | 480×384 | 7px | 494 |

### Пропорции

| Значение | Подпись | CSS класс |
|----------|---------|-----------|
| landscape | Горизонтальный | aspect-video (16:9) |
| square | Квадрат | aspect-square (1:1) |
| portrait | Вертикальный | aspect-[3/4] (3:4) |

### Режим заполнения

| Значение | Подпись | CSS | Иконка |
|----------|---------|-----|--------|
| fill | Заполнить | object-cover | Maximize |
| fit | Целиком | object-contain | Shrink |

### Метаданные

Toggle показа/скрытия footer-секции под карточкой (имя файла, статус согласования, меню).

---

## Фильтры

Файл: `frontend/components/element/ElementFilters.tsx`

| Фильтр | Подпись | Что показывает |
|--------|---------|----------------|
| `all` | Все | Все элементы |
| `favorites` | Избранное | `is_favorite === true` |
| `images` | Изображения | `element_type === "IMAGE"` |
| `videos` | Видео | `element_type === "VIDEO"` |

- Фильтры применяются **только к элементам**, не к группам
- При смене фильтра выделение сбрасывается
- Кнопка показывает счётчик по текущему фильтру или «Фильтры» когда выбран «Все»
- Навигация лайтбокса использует отфильтрованный список

---

## Панель отзывов (ReviewsOverlay)

Файл: `frontend/components/sharing/ReviewsOverlay.tsx`

Полноэкранный оверлей (z-50), открывается кнопкой «Отзывы» в toolbar.

**Структура:**
- Заголовок: «Ссылки и отзывы» + бейдж непрочитанных + кнопка закрытия (Esc)
- Аккордеон-список ссылок:
  - **Заголовок ссылки:** иконка, имя, дата, кол-во элементов, статистика согласований, статус (Истёк / Бессрочный / N дней), непрочитанные, кнопки копирования URL и удаления
  - **Раскрытое содержимое:**
    - Элементы с обратной связью: тумбнейл, имя файла, ревью-статус, лайки/дизлайки, последние 3 комментария, поле ответа
    - Общие комментарии к ссылке (не привязанные к элементу)
- Раскрытие ссылки отмечает комментарии как прочитанные (оптимистично)
- Клик по тумбнейлу элемента → открывает лайтбокс

---

## Лайтбокс

Файл: `frontend/components/lightbox/LightboxModal.tsx`

Полноэкранный просмотр элемента. Открывается кликом по ElementCard или через URL `?lightbox=<id>`.

**Структура:**

```
┌───────────────────────────────────────────┬──────────────┐
│  ElementFilters (top-left)                │              │
│                                           │  DetailPanel │
│                                           │  (320px)     │
│  ◄  [media: image or video player]  ►    │              │
│                                           │  Информация  │
│  [★] [🎬] [AI]  (badges on media bounds)  │  Параметры   │
│                                           │  Промпт      │
│  [Delete] [Download] [Open original]      │  Реакции     │
│                                           │  Ревью       │
├───────────────────────────────────────────┤  Комментарии │
│  ◄ [filmstrip: scrollable thumbnails] ►  │              │
└───────────────────────────────────────────┴──────────────┘
```

**Горячие клавиши:**
- ← → : навигация между элементами
- Esc : закрыть
- F : избранное
- Delete : удалить

**Touch (мобила):** horizontal swipe влево/вправо — навигация prev/next. Реализовано через `onTouchStart`/`onTouchEnd`, порог `|dx|>50` и `|dx|>1.5·|dy|`. Тот же паттерн в `ReviewerLightbox`.

**Z-index:** LightboxModal — `z-[55]` (выше Navbar `z-50`, выше Workspace Toolbar `z-30`, но ниже ReviewsOverlay `z-[60]` и ReviewerLightbox `z-[80]`).

**Видео-плеер:**
- Play/Pause overlay (auto-hide через 2.5s)
- Прогресс-бар с перемоткой
- Время: текущее / длительность
- Mute/Volume toggle

**Filmstrip:** горизонтальная лента тумбнейлов (16×16) внизу. Активный элемент подсвечен primary border. Автоскролл к активному.

### DetailPanel

Файл: `frontend/components/lightbox/DetailPanel.tsx`

Правая боковая панель лайтбокса (320px, скрыта на мобильных).

**Секции сверху вниз:**

1. **Информация:** модель, стоимость, стоимость усиления промпта, размер файла, seed, дата, источник, тип
2. **Параметры генерации:** динамические из `generation_config` с подписями из `parameters_schema`
3. **Входные изображения:** тумбнейлы из generation_config (URLs)
4. **Промпт:** textarea (редактируемый), бейдж «✦ Усилен» если был AI-enhanced, кнопки копирования и сохранения
5. **Кнопка «Повторить»:** повторная генерация с теми же параметрами
6. **Реакции:** лайки/дизлайки от рецензентов, сводка + индивидуальные бейджи
7. **Решения ревью:** Согласовано (зелёный), На доработку (оранжевый), Отклонено (красный)
8. **Комментарии:** CommentThread — вложенность 1 уровень, анонимные комментарии, Enter для отправки

---

## Генерация

### ModelSelector

Файл: `frontend/components/generation/ModelSelector.tsx`

Выдвижная панель выбора модели (440px, справа от ConfigPanel).

- **Табы:** IMAGE (Изображения) и VIDEO (Видео)
- **Карточки моделей:** превью 94×94, название, теги (пиллы), описание (2 строки)
- Модели одного семейства (family) объединяются в одну карточку
- Выбранная модель подсвечена `ring-1 ring-primary/30`

### VariantSwitcher

Файл: `frontend/components/generation/VariantSwitcher.tsx`

Показывается в ConfigPanel если у модели есть семейство (family) с ≥ 2 вариантами.

- **Pills:** горизонтальные кнопки с `variant_label`
- **Select:** дропдаун
- Режим определяется `family.variant_ui_control`

### ParametersForm

Файл: `frontend/components/generation/ParametersForm.tsx`

Рендерит параметры из `parameters_schema` модели. Показывает только параметры с `visible !== false`.

**Типы контролов (по `ui_semantic`):**

| Семантика | Контрол | Описание |
|-----------|---------|----------|
| `toggle_group` | Пиллы (кнопки) | Горизонтальный ряд кнопок |
| `aspect_ratio` | Пиллы + AspectRatioIcon | Сетка 4 колонки, кнопки h-14 с иконкой пропорции |
| `resolution` | Пиллы | Flex wrap, h-8 |
| `select`, `quality`, `output_format`, `duration` | Select dropdown | Нативный дропдаун |
| `switch`, `checkbox` | Toggle | Переключатель boolean |
| `number` | Number input | С min/max/step |
| default | Text input | Обычное текстовое поле |

**Overflow-параметры:**
- Если `show_other_button=true` и есть `overflow_options` → кнопка «Другое» → OptionSelectorPanel
- OptionSelectorPanel — портал к body, позиционирован справа от ConfigPanel
- Для aspect_ratio: разделение на «Популярные» и «Расширенные»

### PromptEnhanceToggle

Файл: `frontend/components/generation/PromptEnhanceToggle.tsx`

Чекбокс «Усилить промпт» в **футере PromptBar** (отдельный ряд с `border-t` ниже текстареи и thumbnail-зоны). Гейтится подпиской (`useFeatureGate("ai_prompt")`).

- Props: `variant?: "standalone" | "inline"` — inline-режим используется внутри PromptBar (без рамки и фона), standalone — старая пилюля (на случай переиспользования).
- **Заблокирован:** disabled чекбокс + TierBadge + клик открывает UpgradeModal
- **Разблокирован:** рабочий чекбокс, состояние в localStorage как `enhance_prompt`

### Image Inputs

**Простая схема** (`ImageInputSchemaItem[]`):
- 1 вход → кнопка ImagePlus сразу открывает ElementSelectionModal
- 2+ входов → дропдаун с выбором слота

**Групповая схема** (`mode: "groups"`):
- Кнопка ImagePlus открывает **ModeSelector** (попап сверху)
- Слоты сгруппированы, с зависимостями и эксклюзивностью

### ModeSelector

Файл: `frontend/components/generation/ModeSelector.tsx`

Попап для выбора режима/слота при групповой схеме image inputs.

**Состояния слотов:**
- `available` — доступен для выбора
- `active` — заполнен файлами (зелёный бейдж «АКТИВНО»)
- `depends_locked` — заблокирован, нужно сначала заполнить зависимость
- `exclusive_locked` — заблокирован, несовместим с активной группой

**Карточка слота:** тумбнейл 80×80 (illustration или иконка), название, описание, счётчик файлов.

---

## Загрузка файлов

Workspace поддерживает drag-and-drop загрузку:

- **Принимаемые форматы:** JPG, PNG, WebP, GIF (изображения), MP4, WebM, MOV (видео)
- **Лимит размера:** `MAX_FILE_SIZE_MB` (из констант)
- **Очередь:** до 10 одновременных загрузок
- **Оптимистичные элементы:** отрицательные ID (e.g., `-1712345000`)
- **Каждая загрузка:** AbortController, прогресс по фазам, pre-load S3 URL после завершения

---

## Мульти-выделение и массовые действия

- **Ctrl/Cmd+Click** — добавить/убрать из выделения
- **Чекбокс** — то же самое
- **Select All** — в секции или полностью
- При выделении появляется **ElementBulkBar:**
  - Поделиться (гейт подписки)
  - Переместить в группу
  - Удалить
- **Share mode:** отдельный режим выбора элементов для шеринга, сохраняется в sessionStorage

---

## Диалоги в WorkspaceContainer

| Диалог | Когда |
|--------|-------|
| Подтверждение удаления | Удаление элемента/группы, одиночное и массовое |
| Перемещение в группу | Перемещение элементов между группами |
| Переименование | Элемент или группа |
| Создание группы | Кнопка «+ Группа» |
| Удаление группы | С информацией о каскадном удалении |
| Шеринг группы | Создание ссылки для просмотра |

---

## WebSocket и realtime

Подключение: `wsManager.connect(projectId)` при монтировании WorkspaceContainer.

**События:**

| Событие | Действие |
|---------|----------|
| `element_status_changed` | Обновление статуса элемента (PENDING → PROCESSING → COMPLETED / FAILED) |
| `new_comment` | Инкремент счётчика комментариев, нотификация |
| `reaction_updated` | Обновление реакций |
| `review_updated` | Обновление ревью |

**Fallback:** если WS отключён — рефетч каждые 8 секунд.

---

## Zustand-сторы

### useSceneWorkspaceStore

Файл: `frontend/lib/store/scene-workspace.ts`

Центральный стор workspace. Содержит:

| Группа | Поля |
|--------|------|
| Данные | `scene`, `elements`, `groups`, `projectId` |
| UI | `selectedIds`, `isMultiSelectMode`, `filter`, `density`, `lightboxOpen`, `lightboxElementId`, `collapsedSections` |
| Загрузка | `isLoading`, `error` |

**Ключевые действия:**
- `loadWorkspace(projectId, groupId?)` — основная загрузка
- `addElement()`, `updateElement()`, `removeElement()` — CRUD
- `createOptimisticGeneration()` → `resolveOptimisticGeneration()` — оптимистичные элементы
- `enqueueUploads()` — очередь загрузки файлов
- `getFilteredElements()` — возвращает отфильтрованные + сортированные элементы
- `selectElement()`, `selectRange()`, `toggleSelectAll()`, `clearSelection()` — выделение
- `openLightbox()`, `closeLightbox()`, `navigateLightbox()` — лайтбокс
- `reorderElements()` — реордеринг

### useGenerationStore

Файл: `frontend/lib/store/generation.ts`

Стор генерации. Содержит:

| Группа | Поля |
|--------|------|
| Модели | `availableModels`, `selectedModel` |
| Параметры | `parameters`, `prompt`, `imageInputs`, `selectedGroup`, `enhancePrompt` |
| Процесс | `isGenerating`, `submitState`, `lastSubmitResult` |
| UI | `configPanelOpen`, `modelSelectorOpen` |

**Ключевые действия:**
- `loadModels()` — загрузка списка моделей
- `selectModel(model)` — выбор модели, сброс параметров к defaults
- `selectGroup(key)` — выбор группы в grouped schema
- `generate(projectId, groupId?)` — запуск генерации (оптимистичный элемент + API)
- `canGenerate()` — валидация: модель, промпт, изображения (≥ min), не генерируется, хватает кредитов
- `retryFromElement(element)` — повторная генерация из элемента (восстановление модели, промпта, конфига)
- `familyVariants()` — варианты текущего семейства моделей

---

## Пустые состояния

### ElementEmptyState

Файл: `frontend/components/element/EmptyState.tsx`

Dashed-border контейнер с анимацией:
- Иконка ImagePlus (увеличивается при drag-over)
- «Перетащите файлы сюда» / «Отпустите файлы здесь»
- Инструкция + кнопка загрузки
- Hint онбординга (если задание `first_generation` не выполнено)

### OnboardingEmptyState

Файл: `frontend/components/onboarding/OnboardingEmptyState.tsx`

Фиолетовый фон, иконка, заголовок + описание, бейдж награды (кадры), CTA-кнопка.

---

## Файловая карта

| Файл | Назначение |
|------|------------|
| `frontend/app/(workspace)/projects/[id]/page.tsx` | Страница проекта |
| `frontend/app/(workspace)/projects/[id]/groups/[groupId]/page.tsx` | Страница группы |
| `frontend/components/element/WorkspaceContainer.tsx` | Главный контейнер workspace |
| `frontend/components/element/ElementGrid.tsx` | Грид элементов и групп + DnD |
| `frontend/components/element/ElementCard.tsx` | Карточка элемента |
| `frontend/components/element/GroupCard.tsx` | Карточка группы (стэк-эффект) |
| `frontend/components/element/ElementFilters.tsx` | Фильтры |
| `frontend/components/element/ElementBulkBar.tsx` | Панель массовых действий |
| `frontend/components/element/EmptyState.tsx` | Пустое состояние |
| `frontend/components/element/SectionHeader.tsx` | Заголовки секций грида |
| `frontend/components/display/DisplaySettingsPopover.tsx` | Настройки вида |
| `frontend/components/generation/ConfigPanel.tsx` | Панель конфигурации генерации |
| `frontend/components/generation/PromptBar.tsx` | Промптбар |
| `frontend/components/generation/ModelSelector.tsx` | Выбор модели |
| `frontend/components/generation/ParametersForm.tsx` | Форма параметров |
| `frontend/components/generation/VariantSwitcher.tsx` | Переключатель вариантов |
| `frontend/components/generation/ModeSelector.tsx` | Выбор режима image inputs |
| `frontend/components/generation/PromptEnhanceToggle.tsx` | Усиление промпта |
| `frontend/components/generation/OptionSelectorPanel.tsx` | Панель overflow-параметров |
| `frontend/components/generation/PromptThumbnailPopup.tsx` | Тумбнейл в промптбаре |
| `frontend/components/lightbox/LightboxModal.tsx` | Лайтбокс |
| `frontend/components/lightbox/DetailPanel.tsx` | Детальная панель лайтбокса |
| `frontend/components/lightbox/Filmstrip.tsx` | Лента тумбнейлов |
| `frontend/components/lightbox/LightboxNavigation.tsx` | Кнопки навигации |
| `frontend/components/sharing/ReviewsOverlay.tsx` | Панель отзывов |
| `frontend/components/sharing/CommentThread.tsx` | Тред комментариев |
| `frontend/components/layout/Navbar.tsx` | Навигационная панель |
| `frontend/components/scene/SceneCard.tsx` | Карточка сцены (проектный уровень) |
| `frontend/lib/store/scene-workspace.ts` | Zustand стор workspace |
| `frontend/lib/store/generation.ts` | Zustand стор генерации |
| `frontend/lib/types/index.ts` | TypeScript типы |
| `frontend/lib/utils/constants.ts` | Константы (размеры, бейджи) |
| `docs/ux-analyses/2026-04-05-badge-system-unification.md` | Спецификация бейдж-системы |

---

## Архитектура грид-лейаута: принципы и решения

> Обновлено: 2026-04-15

### Принцип равной площади

Все карточки элементов в одном size-тире имеют **примерно одинаковую площадь** независимо от выбранного соотношения сторон. Это обеспечивает визуальную однородность: переключение landscape → portrait не делает карточки гигантскими.

Реализация через **разный `minWidth` в CSS-гриде для разных AR**:

```
repeat(auto-fill, minmax(<minWidth>px, 1fr))
```

- Portrait получает меньший minWidth → auto-fill создаёт больше колонок → каждая колонка уже → площадь карточки не раздувается
- Пропорция: landscape : square : portrait ≈ 1.0 : 0.75 : 0.65 (из формулы `width ∝ sqrt(aspectRatio)`)
- Источник правды: `DISPLAY_GRID_CONFIG` в `constants.ts`

### Группы — отдельный грид

Грид групп **не зависит** от aspect ratio — только от size. Группы всегда имеют фиксированное соотношение сторон (~5:4), меняется только масштаб.

- Источник правды: `GROUP_GRID_MIN_WIDTH` в `constants.ts`
- Группы и элементы в ElementGrid рендерятся в **отдельных** CSS-гридах, каждый со своим minWidth

### Мобильная плотность (<sm)

На мобиле выбор «Размер» не имеет смысла (плотность определяется нехваткой ширины), поэтому в `DisplaySettingsPopover` блок «Размер» скрыт на `<sm`. Плотность грида задаётся через CSS-классы `.grid-mobile-1` / `.grid-mobile-2` с `!important`, которые перебивают inline `gridTemplateColumns` только внутри `@media (max-width: 639px)`.

| Грид | Мобильная плотность | Почему |
|------|--------------------|--------|
| ProjectCard | 1 кол (`.grid-mobile-1`) | Подписи/метаданные под превью читаются полноценно |
| GroupCard | 1 кол | Аналогично |
| ElementCard — landscape/square | 1 кол | Widescreen карточки получают максимум ширины экрана |
| ElementCard — portrait | 2 кол (`.grid-mobile-2`) | Вертикальные карточки при этом узкие, 2 помещаются в 430px без H-скролла |

Класс выбирается инлайн в `ElementGrid` и в share-page:
```ts
const elementMobileGridClass =
  preferences.aspectRatio === 'portrait' ? 'grid-mobile-2' : 'grid-mobile-1';
```

Desktop не затронут: медиа-query не срабатывает, inline `minmax()` работает как было.

### Где используется грид

Все 4 грида берут параметры из одних и тех же констант:

| Файл | Грид для | minWidth из |
|------|----------|-------------|
| `ElementGrid.tsx` — секция элементов | Элементы | `DISPLAY_GRID_CONFIG[size][ar].minWidth` |
| `ElementGrid.tsx` — секция групп | Группы | `GROUP_GRID_MIN_WIDTH[size]` |
| `ElementSelectionGrid.tsx` | Элементы (модалка выбора) | `DISPLAY_GRID_CONFIG[size][ar].minWidth` |
| `ScenarioTableClient.tsx` | Группы (уровень проекта) | `GROUP_GRID_MIN_WIDTH[size]` |
| `share/[token]/page.tsx` | Элементы (шеринг) | `DISPLAY_GRID_CONFIG[size][ar].minWidth` |

### Скелетоны и оптимистичные элементы

| Компонент | Как определяется размер | Корректно? |
|-----------|------------------------|------------|
| ElementCardSkeleton | `ASPECT_RATIO_CLASSES[aspectRatio]` (проп) | Да |
| Оптимистичный элемент (генерация) | Тот же ElementCard с `aspectClass` | Да |
| Оптимистичный элемент (загрузка) | Тот же ElementCard с `aspectClass` | Да |
| DnD overlay (элемент) | `CARD_SIZES[size][ar].width` — явный инлайн | Да |
| DnD overlay (группа) | `GROUP_CARD_SIZES[size].width/height` — явный инлайн | Да |
| SceneCard | Фиксированный `aspect-video` (группы всегда 16:9 превью) | Да |

### CARD_SIZES vs DISPLAY_GRID_CONFIG

Две разные константы с разным назначением:

- **`CARD_SIZES`** — справочные pixel-размеры для DnD overlay и расчётов площади. Не используются в CSS-гриде напрямую.
- **`DISPLAY_GRID_CONFIG`** — minWidth для CSS `auto-fill`, определяет сколько колонок и какой ширины. Это единственная константа, влияющая на лейаут.
- **`GROUP_GRID_MIN_WIDTH`** — то же для гридов групп, зависит только от size.
