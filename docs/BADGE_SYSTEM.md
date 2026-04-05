# Badge System — Единый стандарт

> Все badges/icons на карточках проекта следуют этому документу.
> При добавлении новых карточек или экранов — сверяйся с этим стандартом.
> **Компоновка (расположение элементов) зафиксирована. Этот документ про размеры и формы, не про layout.**

## Токены размеров

Два фиксированных размера. **НЕ масштабируются** при смене view mode (compact/medium/large).

### badge-sm (24×24)
- Wrapper: `h-6 w-6` (24px)
- Icon: `h-3.5 w-3.5` (14px)
- Padding: `p-[5px]`
- Ratio: 58%

**Применяется для:** type indicator (Image/Video), AI pill, Play mini, Comment count.

### badge-md (28×28)
- Wrapper: `h-7 w-7` (28px)
- Icon: `h-4 w-4` (16px)
- Padding: `p-1.5`
- Ratio: 57%

**Применяется для:** Checkbox (select), Star (favourite), Download, Delete, Menu (⋯), Drag handle.

## Стили обёрток

### На превью изображения (overlay)
```
rounded-md bg-black/60 backdrop-blur-sm
```
Полупрозрачный тёмный фон поверх контента. Для всех badges на thumbnail.

### На фоне карточки
```
rounded-md bg-background/80 backdrop-blur-sm border border-border/50
```
С бордером, для menu (⋯) на ProjectCard, GroupCard.

### Checkbox
```
rounded-md
```
- Unselected: `bg-black/60 backdrop-blur-sm`
- Selected: `bg-primary` (#8B7CF7) с `Check` иконкой белого цвета

**Все badges без исключений — `rounded-md`.** Никаких `rounded-full`.

## Позиционирование на ElementCard

Компоновка зафиксирована. Не менять расположение элементов.

```
┌──────────────────────────────┐
│ [☐]              [★] [🎬] [AI]│  top: 8px от краёв
│                               │
│                    [↓]  [🗑]  │  bottom-right: hover actions
│                               │
│ [💬3]                         │  bottom-left: always visible
└──────────────────────────────┘
  [подложка: название, review status, approval]
```

### Top row (8px от края)
| Позиция | Badge | Size | Visibility |
|---------|-------|------|------------|
| Top-left | Checkbox (select) | badge-md | Hover-only; persistent в multi-select mode |
| Top-right | Star (favourite) | badge-md | Только если is_favorite = true (всегда видна, не hover) |
| Top-right | Type (Image/Video) | badge-sm | Always visible |
| Top-right | AI pill | badge-sm | Always visible (только GENERATED elements) |

Top-right badges идут справа налево: Type → AI → Star. Gap: 4px.

### Bottom-right (hover actions)
| Badge | Size | Visibility |
|-------|------|------------|
| Download | badge-md | Hover-only (если есть file_url) |
| Delete | badge-md | Hover-only |

### Bottom-left (status, always visible)
| Badge | Size | Visibility |
|-------|------|------------|
| Comment count | badge-sm | Always visible (если comment_count > 0) |

### Подложка (metadata footer)
Review status и approval status отображаются **в подложке**, не на превью. Это уже реализовано — не менять.

## Comment Badge

- 1 комментарий: только иконка `MessageCircle` (badge-sm, bg-black/60)
- 2+ комментариев: иконка + число (`gap-1`, число `text-[11px] font-semibold text-white`)
- 99+ комментариев: показывать "99+"
- Wrapper растягивается по ширине: `h-6 rounded-md bg-black/60 px-1.5`
- **Always visible** — комментарии всегда видны, не прячутся на hover

## Применение по компонентам

| Компонент | Badges | Токены | Что унифицировать |
|-----------|--------|--------|-------------------|
| ElementCard | ☐ ★ 🎬 AI ↓ 🗑 💬 | badge-sm + badge-md | Размеры и форму обёрток |
| GroupCard | ☐ ⋯ | badge-md | Размеры checkbox и menu |
| ProjectCard | ⋯ | badge-md | Только размеры карточки ×1.5, menu badge-md |
| SceneCard | Drag handle, «Группа» | badge-md (handle) | Размер drag handle |
| ElementSelectionCard | 🎬 ★ | badge-sm | Форму (rounded-full → rounded-md) |
| DragOverlayContent | +N count | badge-sm | Стиль count badge |

**ProjectCard и GroupCard:** меняются ТОЛЬКО размеры. Компоновка, расположение элементов — не трогать.

## Footer — единые пропорции

Соотношение иконок к тексту, отступы — переносим из ProjectCard в GroupCard как эталон.

| Параметр | ProjectCard (эталон) | GroupCard (было) | GroupCard (стало) |
|----------|---------------------|------------------|-------------------|
| Padding | `p-3` → `px-3.5 py-3` | `px-2.5 pb-2.5 pt-1` | `p-3` |
| Title→Meta spacing | `space-y-1.5` | `space-y-0.5` | `space-y-1.5` |
| Title font | `text-sm` → `text-base` (×1.5) | динамический (CARD_TEXT_SIZES) | `text-sm font-medium` |
| Meta font | `text-[11px]` → `text-xs` (×1.5) | динамический (CARD_TEXT_SIZES) | `text-[11px]` |
| Meta icons | `h-2.5` → `h-3` (×1.5) | `h-2.5 w-2.5` | `h-2.5 w-2.5` |
| Meta gap | `gap-x-1.5 gap-y-0.5 flex-wrap` | `gap-1.5` | `gap-x-1.5 gap-y-0.5 flex-wrap` |
| Icon-text gap | `gap-0.5` | `gap-0.5` | `gap-0.5` (без изменений) |
| Separator | `·` muted-foreground/40 | `·` muted-foreground/40 | без изменений |

**Примечание:** ProjectCard увеличивается ×1.5 и получает бОльшие шрифты (`text-base`, `text-xs`, `h-3`). GroupCard наследует **до-увеличенные** пропорции ProjectCard (`text-sm`, `text-[11px]`, `h-2.5`), т.к. GroupCard меньше по размеру.

**Содержание footer'ов не меняется** — у ProjectCard свои метрики (status, scene_count, date), у GroupCard свои (element_count, spent, storage). Меняются только отступы и размеры текста.

## Правила

1. **Фиксированные размеры.** Badges НЕ масштабируются при переключении view mode (compact/medium/large). Карточка меняет размер — badges остаются.
2. **Единый стиль.** Все badges на превью используют `bg-black/60 backdrop-blur-sm`. Не `bg-overlay`, не `bg-background/80` — только `bg-black/60`.
3. **Rounded-md для ВСЕХ.** Без исключений. Никаких `rounded-full`.
4. **Icon-to-wrapper ratio ~57%.** Не ставить иконку 20px в wrapper 24px и наоборот.
5. **Comment badge always visible.** Комментарии всегда видны на превью.
6. **Star — только активная.** Показывается только если элемент в избранном (is_favorite = true).
7. **Review/Approval — в подложке.** Не на превью, а в metadata footer.
8. **Action badges hover-only.** Download, Delete, Checkbox (в обычном режиме) — только на hover.
9. **Не добавлять новые размеры.** Если нужен badge — используй badge-sm или badge-md.
10. **Не менять компоновку.** Этот документ фиксирует размеры и формы. Расположение элементов определено в коде и pen-дизайне.
