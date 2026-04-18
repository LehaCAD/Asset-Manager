## UX Analysis: Badge System Unification
### Размер: L

### 1. Текущее состояние

**Проблема:** каждая карточка реализует badges по-своему — разные размеры обёрток, разные radius, разные стили. При переключении view mode badges скачут из-за трёхступенчатого масштабирования.

| Параметр | ProjectCard | GroupCard | ElementCard | SelectionModal |
|----------|------------|-----------|-------------|----------------|
| Menu wrapper | h-7 w-7 (28px) | h-6 w-6 (24px) | нет | нет |
| Menu icon | h-3.5 w-3.5 | h-3.5 w-3.5 | — | — |
| Checkbox | нет | динамический | динамический | нет (ring) |
| Type badge | нет | нет | rounded-md bg-black/60 p-1.5 | rounded-full bg-overlay p-2 |
| Star | нет | нет | rounded-md bg-black/60 p-1.5 | rounded-full bg-overlay p-2 |
| Backdrop-blur | да | да | нет | нет |
| Corner radius | — | rounded + border | rounded-md | rounded-full |

**Незапрошенная проблема:** отсутствует badge для комментариев и review-статуса на превью карточки. Review indicator есть только в metadata footer текстом.

### 2. Impact Map

**Прямо затронутые компоненты:**
- `frontend/components/element/ElementCard.tsx` — все badges (checkbox, star, type, AI, download, delete, play)
- `frontend/components/element/GroupCard.tsx` — checkbox, menu
- `frontend/components/project/ProjectCard.tsx` — menu, размер карточки, typography
- `frontend/components/element/ElementSelectionCard.tsx` — type, star
- `frontend/components/element/DragOverlayContent.tsx` — count badge
- `frontend/components/scene/SceneCard.tsx` — drag handle, type badge

**Косвенно затронутые:**
- `frontend/components/lightbox/` — review indicator
- `frontend/components/sharing/ReviewerLightbox.tsx` — review badges
- `frontend/lib/utils/constants.ts` — CARD_ICON_SIZES (удаление 3-ступенчатой системы)
- `frontend/components/display/DisplaySettingsPopover.tsx` — view mode не влияет на badges

**Props/states зависимости:**
- `size` prop на ElementCard/GroupCard — больше не влияет на badge sizing
- `review_summary` на Element — нужен для review badge на превью
- `comment_count` — нужно добавить в ElementSerializer (backend)

### 3. Решение

**Mockup:** pen/pencil-new.pen, фрейм `UX: Badge System Unification 2026-04-05` (node `WOCbx`)

#### 3.1 Unified Badge Tokens

Два фиксированных размера, НЕ зависят от view mode карточки:

| Токен | Wrapper | Icon | Padding | Применение |
|-------|---------|------|---------|------------|
| badge-sm | 24×24 (h-6 w-6) | 14px (h-3.5 w-3.5) | p-[5px] | Type indicator, AI pill, Play mini, Comment count, Review status |
| badge-md | 28×28 (h-7 w-7) | 16px (h-4 w-4) | p-1.5 | Checkbox, Star, Download, Delete, Menu |

#### 3.2 Стили обёрток

| Контекст | Стиль | CSS |
|----------|-------|-----|
| На превью (overlay) | Полупрозрачный тёмный | `rounded-md bg-black/60 backdrop-blur-sm` |
| На фоне карточки | С бордером | `rounded-md bg-background/80 backdrop-blur-sm border border-border/50` |
| Checkbox | rounded-md, primary fill | `rounded-md` + `bg-primary` при selected, `bg-black/60` при unselected |

#### 3.3 ProjectCard — увеличение ×1.5

| Параметр | Было | Стало |
|----------|------|-------|
| Ширина | ~230px | ~350px |
| Thumbnail height | ~130px | ~197px |
| Title | text-xs (12px) | text-base (16px) |
| Meta text | text-[10px] | text-xs (12px) |
| Meta icons | h-2.5 w-2.5 (10px) | h-3 w-3 (12px) |
| Body padding | 10px | 12-14px |
| Menu (⋯) | badge-md 28px | badge-md 28px (БЕЗ ИЗМЕНЕНИЙ) |
| Grid | 4 колонки | 3 колонки (авто) |

#### 3.4 Comment Badge на ElementCard

Позиция: bottom-left на превью. **Always visible** (не hover).

| Индикатор | Условие | Размер | Стиль |
|-----------|---------|--------|-------|
| Comment count | comment_count > 0 | badge-sm | bg-black/60, MessageCircle icon. 1 шт = только иконка, 2+ = иконка + число |

Review/approval status — **в подложке** (metadata footer), не на превью. Уже реализовано, не менять.

#### 3.5 Карта позиций badges на ElementCard

**Компоновка зафиксирована — не менять расположение. Только размеры и формы.**

```
┌──────────────────────────────┐
│ [☐]              [★] [🎬] [AI]│  top: 8px от краёв
│                               │  ☐: hover-only (persistent в multi-select)
│                               │  ★: только если is_favorite (не hover)
│                               │  🎬 AI: always visible
│                               │
│                    [↓]  [🗑]  │  bottom-right: hover actions
│                               │
│ [💬3]                         │  bottom-left: always visible
└──────────────────────────────┘
  [подложка: название, review, approval]
```

### 4. Развилки (решены)

1. **Масштабирование badges** → A: Фиксированные (не масштабируются с view mode).
2. **Форма обёрток** → rounded-md для ВСЕХ, включая checkbox. Без исключений.
3. **Star** → показывается только если is_favorite = true (не как hover-action).
4. **Review/Approval** → в подложке (metadata footer), не на превью.
5. **Comment** → always visible на превью, bottom-left.
6. **Компоновка** → НЕ МЕНЯТЬ. Только размеры и формы badges.

### 5. Scope для имплементации

**Backend (1 файл):**
- `backend/apps/elements/serializers.py` — добавить `comment_count` в ElementSerializer

**Frontend — по порядку:**

1. `frontend/lib/utils/constants.ts` — заменить `CARD_ICON_SIZES` (3 ступени) на `BADGE_SIZES` (2 фиксированных токена)
2. `frontend/components/element/ElementCard.tsx` — все badges на unified tokens + comment badge bottom-left (always visible)
3. `frontend/components/element/GroupCard.tsx` — checkbox + menu на badge-md + footer пропорции из ProjectCard (p-3, space-y-1.5, text-sm title, text-[11px] meta, gap-x-1.5 flex-wrap). Содержание footer не менять, только отступы и размеры текста
4. `frontend/components/project/ProjectCard.tsx` — увеличение ×1.5 (только размеры, не компоновку), menu на badge-md
5. `frontend/components/scene/SceneCard.tsx` — drag handle на badge-md стиль
6. `frontend/components/element/ElementSelectionCard.tsx` — type + star на badge-sm
7. `frontend/components/element/DragOverlayContent.tsx` — count badge на badge-sm
8. `frontend/components/lightbox/` — review indicator в том же стиле

**Edge cases:**
- Empty: нет комментариев / нет review — badges не показываются
- Error/Failed: status overlay перекрывает всё, badges скрыты
- Loading/Processing: badges скрыты под loader overlay
- 0 items: нет badges
- 1 comment: только иконка MessageCircle без числа
- 100+ comments: число обрезается до "99+"
- Множественные reviews: worst-wins (уже реализовано на backend)

**Референсы:**
- Leonardo.ai: фиксированные badge sizes, hover-only actions
- Google Photos: checkbox круглый с primary fill, фиксированный размер
- Material Design 3: icon-to-wrapper ratio 50-60%
- Adobe Spectrum: badge height 20-28px для desktop
