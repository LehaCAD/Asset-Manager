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

`SOURCE_IMG2VID` удаляется. Миграция: все существующие `IMG2VID` → `GENERATED`. Остаются два source_type: `GENERATED`, `UPLOADED`.

**Затронутые файлы:**
- `backend/apps/elements/models.py` — убрать `SOURCE_IMG2VID` из `SOURCE_TYPE_CHOICES`
- `backend/apps/elements/orchestration.py` (line 50) — заменить `Element.SOURCE_IMG2VID` на `Element.SOURCE_GENERATED`
- `frontend/lib/types/index.ts` (line 122) — убрать `'IMG2VID'` из `ElementSource` union
- `frontend/components/lightbox/DetailPanel.tsx` (line 27, 97) — убрать `IMG2VID` из маппинга source_type
- `frontend/app/(cabinet)/cabinet/history/page.tsx` (line 59) — убрать `IMG2VID` из `IS_GENERATED` set

### 2.2 Новые поля Element

```python
# backend/apps/elements/models.py

APPROVAL_STATUS_CHOICES = [
    ('IN_PROGRESS', 'В работе'),
    ('NEEDS_REVIEW', 'На согласовании'),
    ('APPROVED', 'Одобрено'),
    ('CHANGES_REQUESTED', 'На доработку'),
    ('REJECTED', 'Отклонено'),
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

type ApprovalStatus = 'IN_PROGRESS' | 'NEEDS_REVIEW' | 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED';

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
|  [▶]                         [💬 3]      |  bottom: video play, comments
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
| Play (видео) | bottom-left | только VIDEO | 28x28 pill, иконка Play (без длительности — нет поля duration в модели) |
| Комментарии | bottom-right | только если `comment_count > 0` (только sharing page — workspace не имеет comment_count в модели) | auto pill, `💬 N` |

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

| Действие | Иконка Lucide | Описание | Статус |
|----------|--------------|----------|--------|
| Скачать | `download` | fetch+blob скачивание | Реализуем |
| Переименовать | `pencil` | PATCH original_filename | Реализуем |
| Переместить | `folder-input` | PATCH scene (существующий endpoint) | Реализуем |
| Копировать | `copy` | POST duplicate element | **Будущее** (placeholder в меню, disabled) |
| Удалить | `trash-2` | confirmation dialog, красный текст | Реализуем |

**Rename API:** `PATCH /api/elements/{id}/` с `{ original_filename }` — добавить в writable fields ElementSerializer.
**Move API:** `PATCH /api/elements/{id}/` с `{ scene }` — уже работает через existing endpoint.
**Copy:** требует нового backend endpoint (clone element + S3 copy). Вне scope блока 4 — в меню показываем disabled с tooltip "Скоро".

### 3.6 Статусы — цветовая схема

| Статус | Цвет текста | Цвет фона pill | Код |
|--------|------------|-----------------|-----|
| Нет статуса | `#94A3B8` | `#47556920` | `null` |
| В работе | `#60A5FA` | `#3B82F620` | `IN_PROGRESS` |
| На согласовании | `#FBBF24` | `#F59E0B20` | `NEEDS_REVIEW` |
| Одобрено | `#4ADE80` | `#22C55E20` | `APPROVED` |
| На доработку | `#FB923C` | `#F9731620` | `CHANGES_REQUESTED` |
| Отклонено | `#94A3B8` | `#47556920` | `REJECTED` |

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

`readPersistedPreferences()` в `project-display.ts` делает strict validation. При добавлении `showMetadata`:

```typescript
// После существующей валидации size/aspectRatio/fitMode:
prefs.showMetadata = prefs.showMetadata ?? true;
```

Старые localStorage записи без `showMetadata` получат default `true`. Аналогично `DEFAULT_DISPLAY_PREFERENCES` в `constants.ts` обновляется с `showMetadata: true`.

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

**Поле `is_system` на Comment:**
- `models.BooleanField(default=False)` — backward-compatible
- Добавить в `CommentSerializer.fields` и TypeScript `Comment` type
- Системные комментарии визуально отличаются: иконка вместо аватара, без кнопки "Ответить", non-editable
- Constraint: системный комментарий всегда привязан к `element` (не `scene`)

### 5.2.1 PATCH endpoint для approval_status

```
PATCH /api/elements/{id}/
Body: { approval_status: 'IN_PROGRESS' | 'NEEDS_REVIEW' | 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED' | null }
```

Добавить `approval_status` в `ElementSerializer` writable fields. Frontend: расширить `UpdateElementPayload` в types/index.ts. API call через existing `updateElement()` в `frontend/lib/api/elements.ts`.

### 5.3 Sharing page card (минимальная подложка)

Share page card показывает:
- Thumbnail с badges (тип медиа, AI, комменты)
- Reactions bar (like/dislike) — как сейчас
- Подложка: только имя файла. Без статуса, без три-точки.

**Поля для PublicElement (расширить):**
- Backend `el_data` dict в `sharing/views.py` → добавить: `source_type`, `original_filename`
- `PublicElementSerializer` → добавить те же поля
- Frontend `PublicElement` type → добавить `source_type?: ElementSource`, `original_filename?: string`

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
| `backend/apps/elements/serializers.py` | Добавить approval_status, original_filename в fields (read+write) |
| `backend/apps/elements/orchestration.py` | Заменить SOURCE_IMG2VID → SOURCE_GENERATED |
| `backend/apps/sharing/models.py` | Добавить is_system на Comment |
| `backend/apps/sharing/views.py` | Новый endpoint review, расширить el_data dict |
| `backend/apps/sharing/serializers.py` | Расширить PublicElementSerializer |
| `backend/apps/sharing/urls.py` | Добавить review URL |
| Миграции | 2 миграции: elements + sharing |

**Frontend:**
| Файл | Изменение |
|------|----------|
| `frontend/lib/types/index.ts` | ApprovalStatus, Element fields, DisplayPreferences.showMetadata, убрать IMG2VID из ElementSource, PublicElement расширить |
| `frontend/components/lightbox/DetailPanel.tsx` | Убрать IMG2VID из source_type маппинга |
| `frontend/app/(cabinet)/cabinet/history/page.tsx` | Убрать IMG2VID из IS_GENERATED set |
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
| Approval status change | Без WebSocket — обновление только при refresh. WS для approval — будущее. |
| Видео | Иконка Play в bottom-left (duration не хранится в модели) |
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
