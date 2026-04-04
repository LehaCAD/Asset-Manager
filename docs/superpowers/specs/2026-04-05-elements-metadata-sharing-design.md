# Блок 4 — Элементы, метаданные, статусы и шеринг 2.0

## Спецификация дизайна

**Дата:** 2026-04-05
**Размер:** L
**Mockup:** `pen/pencil-new.pen` → фрейм `UX: ElementCard Redesign 2026-04-05` (node `GVOQ7`)

---

## 1. Обзор изменений

Блок затрагивает три области:
- **Карточка элемента** — badges на thumbnail, подложка с именем и статусом, три точки меню
- **Вкладка "Вид"** — новый toggle "Доп. данные" для показа/скрытия подложки
- **Шеринг 2.0** — reviewer actions (согласовано / на доработку / отклонено), статусы элементов

---

## 2. Модель данных

### 2.1 Удаление IMG2VID

`SOURCE_IMG2VID` удаляется из `backend/apps/elements/models.py`. Миграция: все существующие `IMG2VID` → `GENERATED`. Остаются два source_type: `GENERATED`, `UPLOADED`.

### 2.2 Новые поля Element

```python
# backend/apps/elements/models.py

APPROVAL_STATUS_CHOICES = [
    ('IN_PROGRESS', 'В работе'),
    ('NEEDS_REVIEW', 'На согласовании'),
    ('APPROVED', 'Одобрено'),
    ('CHANGES_REQUESTED', 'На доработку'),
]

approval_status = models.CharField(
    max_length=20,
    choices=APPROVAL_STATUS_CHOICES,
    null=True, blank=True, default=None,
    verbose_name='Статус согласования'
)

original_filename = models.CharField(
    max_length=255, blank=True, default='',
    verbose_name='Оригинальное имя файла'
)
```

**Миграция:** backward-compatible (nullable, default=None/empty).

### 2.3 TypeScript типы

```typescript
// frontend/lib/types/index.ts

type ApprovalStatus = 'IN_PROGRESS' | 'NEEDS_REVIEW' | 'APPROVED' | 'CHANGES_REQUESTED';

interface Element {
  // ... существующие поля
  approval_status: ApprovalStatus | null;
  original_filename: string;
}

interface DisplayPreferences {
  size: DisplayCardSize;
  aspectRatio: DisplayAspectRatio;
  fitMode: DisplayFitMode;
  showMetadata: boolean;  // toggle подложки
}
```

---

## 3. Карточка элемента (workspace)

### 3.1 Структура

```
+------------------------------------------+
|  [☐]                  [★] [📷] [AI]     |  top: checkbox, star, type, source
|                                          |
|              thumbnail                   |
|                                          |
|  [▶ 0:15]                    [💬 3]      |  bottom: video dur, comments
+------------------------------------------+
|  filename.jpeg                    [···]  |  подложка строка 1
|  Статус  [В работе ▼]                    |  подложка строка 2
+------------------------------------------+
```

### 3.2 Badges на thumbnail (всегда видны)

Каждый badge — pill с `bg-black/60 text-white rounded-md`, самодостаточный на любом фоне.

| Badge | Позиция | Условие показа | Размеры |
|-------|---------|---------------|---------|
| Checkbox | top-left | hover или multiselect mode | 24x24 |
| Звезда | top-right (первая) | hover: пустая; `is_favorite=true`: filled amber всегда | 28x28 pill |
| Тип медиа | top-right (вторая) | всегда (`image` или `video` иконка Lucide) | 28x28 pill |
| AI pill | top-right (третья) | только если `source_type === 'GENERATED'` | 28xauto pill, текст "AI" |
| Длительность видео | bottom-left | только VIDEO | auto pill, `▶ 0:15` |
| Комментарии | bottom-right | только если `comment_count > 0` | auto pill, `💬 N` |

**UPLOADED элементы:** только [★] [📷] — без AI pill.

### 3.3 Hover overlay

При hover на thumbnail — scrim `bg-black/40`, кнопки:
- **Download** (bottom-left, 32x32) — `fetch+blob` скачивание (фикс текущего бага)
- **Delete** (bottom-right, 32x32) — удаление с confirmation

### 3.4 Подложка (metadata footer)

**Фон:** `#151B2B` (чуть темнее карточки). Padding: `10px 12px`. Gap: `6px`.

**Строка 1:** имя файла + три точки меню
- Имя: `original_filename` (или fallback на `file_url` basename). Font: Inter 12px 500, `text-foreground`. Truncate с ellipsis.
- Три точки: иконка `ellipsis` (Lucide), 24x24, `text-muted-foreground`.

**Строка 2:** статус dropdown
- Label "Статус" в `text-muted-foreground` 11px
- Pill с цветным текстом на tinted background + chevron-down
- Клик открывает dropdown для смены статуса

**Toggle "Доп. данные":** скрывает/показывает подложку целиком. Без подложки — чистая сетка thumbnails.

### 3.5 Три точки — контекстное меню

| Действие | Иконка Lucide | Описание |
|----------|--------------|----------|
| Скачать | `download` | fetch+blob скачивание |
| Переименовать | `pencil` | inline rename или dialog |
| Переместить | `folder-input` | выбор группы/сцены |
| Копировать | `copy` | в другую группу |
| Удалить | `trash-2` | confirmation dialog, красный текст |

### 3.6 Статусы — цветовая схема

| Статус | Цвет текста | Цвет фона pill | Код |
|--------|------------|-----------------|-----|
| Нет статуса | `#94A3B8` | `#47556920` | `null` |
| В работе | `#60A5FA` | `#3B82F620` | `IN_PROGRESS` |
| На согласовании | `#FBBF24` | `#F59E0B20` | `NEEDS_REVIEW` |
| Одобрено | `#4ADE80` | `#22C55E20` | `APPROVED` |
| На доработку | `#FB923C` | `#F9731620` | `CHANGES_REQUESTED` |

### 3.7 Размеры карточек

Подложка одинаковая на всех размерах. На compact — имя файла сильнее truncated.

| Размер | Thumbnail | Подложка |
|--------|-----------|----------|
| compact | по CARD_SIZES | ~56px (2 строки, мелкий текст) |
| medium | по CARD_SIZES | ~64px |
| large | по CARD_SIZES | ~68px |

---

## 4. Вкладка "Вид" (DisplaySettingsPopover)

### 4.1 Новый toggle

Добавляется четвёртая секция после "Режим отображения":

```
─────────────────
Доп. данные        [toggle]
─────────────────
```

Switch toggle (shadcn Switch). Default: включен. Сохраняется в `DisplayPreferences.showMetadata`.

### 4.2 Backward compatibility

`readPersistedPreferences()` в `project-display.ts` делает strict validation. При добавлении `showMetadata` — нужен graceful fallback: если поле отсутствует, default = `true`.

### 4.3 Sharing page

На sharing page toggle тоже доступен. `SharedLink.display_preferences` может не содержать `showMetadata` — fallback `true`.

---

## 5. Шеринг 2.0

### 5.1 Reviewer actions

Reviewer на sharing page видит в ReviewerLightbox три кнопки рядом с like/dislike:

| Действие | Иконка | Цвет | Что происходит |
|----------|--------|------|---------------|
| Согласовано | `check` | green | Системный комментарий "✓ Согласовано — [имя]" |
| На доработку | `rotate-ccw` | orange | Системный комментарий "↻ На доработку — [имя]" |
| Отклонено | `x` | gray | Системный комментарий "✕ Отклонено — [имя]" |

**Поведение:** действие reviewer-а создаёт системный комментарий. Creator видит этот сигнал и сам меняет статус элемента. Автоматической смены статуса нет (контроль на стороне создателя).

### 5.2 API

Новый endpoint:
```
POST /api/sharing/public/{token}/review/
Body: { element_id, action: 'approved' | 'changes_requested' | 'rejected', session_id, author_name }
```

Создаёт Comment с `is_system=True` (новое boolean поле на Comment).

### 5.3 Sharing page card (минимальная подложка)

Share page card показывает:
- Thumbnail с badges (тип медиа, AI, комменты)
- Reactions bar (like/dislike) — как сейчас
- Подложка: только имя файла. Без статуса, без три-точки.

### 5.4 ElementSelectionCard

Без изменений подложки. Только tooltip с именем файла при hover.

---

## 6. Баги — чиним в рамках блока

### 6.1 Download button

**Проблема:** workspace ElementCard использует `anchor.click()` с `target="_blank"` — открывает файл в табе вместо скачивания.
**Решение:** заменить на `fetch+blob` (как уже сделано на share page).

### 6.2 Mobile comments

**Проблема:** ReviewerLightbox имеет `hidden md:flex` на comment panel — на мобильных комменты недоступны.
**Решение:** добавить Sheet/Drawer для комментов на мобильных (кнопка "Комменты" в action bar).

---

## 7. Impact Map

### Файлы с изменениями

**Backend:**
| Файл | Изменение |
|------|----------|
| `backend/apps/elements/models.py` | Удалить IMG2VID, добавить approval_status, original_filename |
| `backend/apps/elements/serializers.py` | Добавить новые поля в fields |
| `backend/apps/sharing/models.py` | Добавить is_system на Comment |
| `backend/apps/sharing/views.py` | Новый endpoint review, расширить el_data dict |
| `backend/apps/sharing/serializers.py` | Расширить PublicElementSerializer |
| `backend/apps/sharing/urls.py` | Добавить review URL |
| Миграции | 2 миграции: elements + sharing |

**Frontend:**
| Файл | Изменение |
|------|----------|
| `frontend/lib/types/index.ts` | ApprovalStatus, Element fields, DisplayPreferences.showMetadata |
| `frontend/components/element/ElementCard.tsx` | Полная переработка badges + подложка |
| `frontend/components/display/DisplaySettingsPopover.tsx` | Toggle "Доп. данные" |
| `frontend/lib/store/project-display.ts` | showMetadata в preferences, backward compat |
| `frontend/lib/utils/constants.ts` | DEFAULT_DISPLAY_PREFERENCES обновить |
| `frontend/components/element/ElementGrid.tsx` | Прокинуть showMetadata |
| `frontend/app/share/[token]/page.tsx` | Минимальная подложка, reviewer actions |
| `frontend/components/sharing/ReviewerLightbox.tsx` | Кнопки согласования, mobile comments |
| `frontend/lib/api/sharing.ts` | Новый метод submitReview() |
| `frontend/components/element/ElementSelectionCard.tsx` | Tooltip с именем файла |

### Edge cases

| Сценарий | Поведение |
|---------|----------|
| Element без original_filename | Fallback на basename из file_url |
| Element без approval_status | Pill "Нет статуса" (серый) |
| Element UPLOADED | Нет AI badge, только [★] [📷/🎬] |
| Compact size | Имя truncated сильнее, подложка компактнее |
| showMetadata = false | Подложка скрыта, чистые thumbnails |
| Старый SharedLink без showMetadata | Fallback true |
| Reviewer без identity | Toast "Введите имя" при попытке review action |
| 0 комментариев | Badge комментариев не показывается |
| Видео без duration | Только иконка Play без текста |
| Long filename | Truncate с ellipsis в одну строку |

---

## 8. Порядок реализации

1. **Backend: модель + миграции** — удалить IMG2VID, добавить поля, миграции
2. **Backend: API** — serializers, review endpoint, is_system comment
3. **Frontend: типы** — обновить types/index.ts
4. **Frontend: store** — DisplayPreferences.showMetadata
5. **Frontend: ElementCard** — badges + подложка + три точки
6. **Frontend: DisplaySettingsPopover** — toggle
7. **Frontend: ElementGrid** — прокинуть showMetadata
8. **Frontend: Share page** — минимальная подложка + reviewer actions
9. **Frontend: ReviewerLightbox** — кнопки согласования + mobile comments
10. **Frontend: Bugfixes** — download button, ElementSelectionCard tooltip
