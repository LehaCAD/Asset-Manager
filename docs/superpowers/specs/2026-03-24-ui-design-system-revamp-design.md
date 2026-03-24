# UI Design System Revamp — Spec

**Дата:** 2026-03-24
**Цель:** Привести все компоненты к единой дизайн-системе на основе pen-макетов, убрать хардкод цветов, сделать всё настраиваемым из одного места (`globals.css`). Ориентир — Leonardo.ai: premium dark, крупные элементы, чистые формы.

---

## Фаза 1 — Design Tokens

### 1.1 Новые CSS-переменные в `globals.css`

Добавить в `:root` (light) и `.dark`:

```
/* Статусы */
--success:              oklch(...)   /* зелёный */
--success-foreground:   oklch(...)
--warning:              oklch(...)   /* янтарный */
--warning-foreground:   oklch(...)
--error:                oklch(...)   /* красный — алиас destructive */
--error-foreground:     oklch(...)

/* Специальные */
--favorite:             oklch(...)   /* жёлтый — звёздочка */
--charge:               oklch(...)   /* янтарный — иконка валюты */

/* Overlay (поверх изображений) */
--overlay:              oklch(0 0 0 / 0.5)
--overlay-heavy:        oklch(0 0 0 / 0.7)
--overlay-light:        oklch(1 0 0 / 0.12)
--overlay-light-hover:  oklch(1 0 0 / 0.2)
--overlay-text:         oklch(1 0 0 / 0.85)
--overlay-text-muted:   oklch(1 0 0 / 0.6)
```

### 1.2 Tailwind mapping в `@theme inline`

```
--color-success:            var(--success);
--color-success-foreground: var(--success-foreground);
--color-warning:            var(--warning);
--color-warning-foreground: var(--warning-foreground);
--color-error:              var(--error);
--color-error-foreground:   var(--error-foreground);
--color-favorite:           var(--favorite);
--color-charge:             var(--charge);
--color-overlay:            var(--overlay);
--color-overlay-heavy:      var(--overlay-heavy);
--color-overlay-light:      var(--overlay-light);
--color-overlay-light-hover:var(--overlay-light-hover);
--color-overlay-text:       var(--overlay-text);
--color-overlay-text-muted: var(--overlay-text-muted);
```

### 1.3 Таблица замен

| Хардкод | Токен | Файлы |
|---------|-------|-------|
| `yellow-400` (favorite star) | `text-favorite` | ElementCard, LightboxModal |
| `red-500`, `red-400` (error) | `text-error`, `bg-error` | ElementCard, Navbar |
| `green-600`, `green-500` (success) | `text-success` | ConfigPanel, Navbar, SceneCard |
| `amber-600`, `amber-500` (warning) | `text-warning` | ConfigPanel, Navbar |
| `amber-400` (charge icon) | `text-charge fill-charge` | ChargeIcon |
| `black/50` (overlay) | `bg-overlay` | ElementCard, GroupCard, LightboxModal |
| `black/70`, `black/80` (heavy overlay) | `bg-overlay-heavy` | ElementCard, GroupCard |
| `black/40` (light overlay) | `bg-overlay` | LightboxModal nav buttons |
| `white/70`, `white/80` (overlay text) | `text-overlay-text` | GroupCard, ElementCard |
| `white/40`, `white/20` (muted overlay text) | `text-overlay-text-muted` | ElementCard |
| `white/[0.15]`, `white/[0.04]` (borders) | `border-overlay-light` | PromptBar |
| `#6C5CE7` | `primary` (already exists) | PromptBar |

---

## Фаза 2 — Workspace компоненты

### 2.1 ConfigPanel

**Целевой макет:** pen node `vhJaR` (340px, compact).

**Текущие проблемы:**
- Aspect ratio карточки слишком крупные (72px высота каждая)
- Много пустого пространства
- "Расширенные" → переименовать в "Другое"

**Изменения:**

1. **Model Section** — оставить как есть (уже компактно: thumbnail + name + chevron)

2. **Параметры** — рендеринг по `parameters_schema` из модели. Не добавлять поля, которых нет в админке. Изменения только визуальные:
   - **Aspect ratio grid:** уменьшить высоту кнопок с 72px → ~52px, иконки пропорционально
   - **Toggle group (resolution, format, num_images):** pill-кнопки inline, `h-8 px-3`, wrap при необходимости
   - **Switch controls:** compact, label слева, toggle справа, одна строка
   - **Select controls:** `h-8`, compact dropdown
   - Overflow кнопка: **"Другое"** вместо "Расширенные"

3. **Стоимость** — одна строка внизу: "Стоимость" слева, ChargeIcon + цена справа
   - Цвет цены: `text-success` (хватает) / `text-error` (не хватает)
   - Ошибка: `text-warning` вместо `text-amber-600`

4. **Spacing:** gap между секциями 12px, padding панели 16px, divider между секциями (1px `border-border`)

5. **Цвета:** убрать все хардкоды (`amber-600` → `warning`, `green-600` → `success`)

### 2.2 PromptBar

**Изменения:**
- `border-[#6C5CE7]/40` → `border-primary/40`
- `focus:ring-[#6C5CE7]/40` → `focus:ring-primary/40`
- `border-white/[0.15]` → `border-overlay-light`
- `bg-white/[0.04]` → прозрачный или `bg-muted/10`
- `hover:bg-white/[0.08]` → `hover:bg-overlay-light`

### 2.3 GroupCard (переделка)

**Текущее:** полноблидное изображение + gradient overlay внизу (как in ElementCard).

**Новое:** структура ProjectCard + иконка Folder.

```
┌──────────────────────────┐
│  2x2 preview grid        │
│  (или empty: Folder icon)│
│                          │
├──────────────────────────┤
│  📁 Название группы      │
│  ⬡ 10  ⚡ 35  💾 12MB    │
└──────────────────────────┘
```

**Детали:**
- Thumbnail area: 2x2 grid (как сейчас), но без gradient overlay
- Empty state: gradient `from-primary/5 to-primary/10` + Folder icon (как сейчас, сохраняем)
- Info section снизу (как ProjectCard):
  - Первая строка: `<Folder className="h-3.5 w-3.5 text-primary/60" />` + название (font-medium, 13px)
  - Вторая строка: meta (element_count, total_spent, storage) — `text-muted-foreground text-[11px]`
- Убрать: gradient overlay `from-black/70 via-black/40`
- Убрать: `text-white`, `text-white/70` → семантические классы
- Select/delete кнопки: оставить как overlay на preview area, но с токенами overlay

### 2.4 ElementCard

**Замены хардкодов (без изменения поведения):**
- `bg-black/50` → `bg-overlay`
- `bg-black/70`, `bg-black/80` → `bg-overlay-heavy`
- `text-white` → `text-overlay-text` (на overlay поверх картинки)
- `text-white/70`, `text-white/80` → `text-overlay-text`
- `text-white/50`, `text-white/40`, `text-white/20` → `text-overlay-text-muted`
- `text-yellow-400` → `text-favorite`
- `bg-red-500`, `text-red-400`, `text-red-500/25` → `bg-error`, `text-error`, `text-error/25`
- `bg-red-500/10`, `bg-red-500/20` → `bg-error/10`, `bg-error/20`
- `hover:bg-red-500/50` → `hover:bg-error/50`
- `bg-white/20`, `bg-white/35` → `bg-overlay-light`, `bg-overlay-light-hover`

### 2.5 LightboxModal

**Замены:**
- `bg-black/60` → `bg-overlay`
- `hover:bg-black/80` → `hover:bg-overlay-heavy`
- `text-yellow-400 fill-current` (favorite) → `text-favorite fill-current`
- `text-white/70` → `text-overlay-text-muted`
- `bg-black/40` (nav buttons) → `bg-overlay`

### 2.6 Filmstrip

Проверить на хардкоды, применить те же overlay-токены.

---

## Фаза 3 — Остальные компоненты

### 3.1 ProjectCard

- Проверить — уже в основном на семантических классах
- `opacity-[0.07]` inline style для grid pattern → оставить (это не цвет, а opacity)

### 3.2 Navbar

- `bg-zinc-200 dark:bg-zinc-700` (progress bar bg) → `bg-muted`
- `bg-red-500` (storage critical) → `bg-error`
- `bg-amber-500` (storage warning) → `bg-warning`
- `bg-emerald-500` (storage ok) → `bg-success`

### 3.3 ChargeIcon

- `text-amber-400 fill-amber-400` → `text-charge fill-charge`

### 3.4 SceneCard

- `yellow-500/15`, `yellow-600` → `warning/15`, `text-warning`
- `green-500/15`, `green-600` → `success/15`, `text-success`
- `yellow-400`, `green-400` → `text-warning`, `text-success`

---

## Что НЕ меняем

- Архитектура компонентов (layers, stores, API)
- Schema-driven рендеринг параметров
- Логика генерации, WebSocket, Celery
- Содержимое `parameters_schema` в админке
- Поведение collapsible панели
- DnD, bulk actions, selection logic
- DetailPanel — уже чистый

---

## Порядок реализации

1. **globals.css** — добавить все новые токены (light + dark)
2. **Tailwind theme** — маппинг токенов
3. **ConfigPanel + ParametersForm** — визуальные правки по pen-макету
4. **GroupCard** — переделка структуры
5. **ElementCard** — замена хардкодов
6. **PromptBar** — замена хардкодов
7. **LightboxModal** — замена хардкодов
8. **Navbar, ChargeIcon, SceneCard** — мелкие замены
9. Визуальная верификация через Playwright
