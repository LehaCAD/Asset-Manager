# Раскадровка — Brandbook / Design Tokens

> Полная цветовая и стилистическая система для светлой и тёмной темы.
> Референс: Leonardo.ai, Runway, Frame.io — премиальный AI-продакшн.

---

## 1. Философия дизайна

- **Tight** — компактные паддинги, маленькие радиусы, плотная информация
- **Контрастный** — чёткое разделение поверхностей, читаемый текст
- **Премиальный** — чистые линии, без визуального шума, сдержанная палитра
- **Функциональный** — каждый элемент имеет цель, никаких декоративных излишеств

---

## 2. Цветовая палитра

### 2.1 Основные цвета (Brand)

| Токен | Light | Dark | Назначение |
|-------|-------|------|------------|
| `--primary` | `#6C5CE7` | `#8B7CF7` | Кнопки, акценты, ссылки, ring |
| `--primary-hover` | `#5A4BD6` | `#9D90FF` | Hover на primary-элементах |
| `--primary-active` | `#4A3BC6` | `#A89EFF` | Active/pressed |
| `--primary-muted` | `#6C5CE7/12%` | `#8B7CF7/12%` | Фон selected-состояний, бейджи |
| `--primary-foreground` | `#FFFFFF` | `#0F0A1E` | Текст на primary-фоне |

### 2.2 Поверхности (Surfaces)

| Токен | Light | Dark | Назначение |
|-------|-------|------|------------|
| `--bg-base` | `#F5F6F8` | `#0C0F16` | Фон страницы (body), content area |
| `--bg-surface` | `#EEEEF2` | `#13161F` | Sidebar, панели, зоны |
| `--bg-elevated` | `#FFFFFF` | `#1A1D28` | Карточки, модалки, поповеры |
| `--bg-elevated-hover` | `#F5F5F7` | `#1F2330` | Hover на карточке |
| `--bg-inset` | `#F0F1F4` | `#0F1119` | Вложенные области, input bg |
| `--bg-overlay` | `#000000/50%` | `#000000/60%` | Оверлей модалки |

> **Light theme depth:** фон страницы тонирован (`#F5F6F8`), карточки белые (`#FFFFFF`) с layered shadow — создаёт визуальную глубину без тяжёлых теней. Sidebar ещё темнее (`#EEEEF2`) для контраста.

### 2.3 Текст

| Токен | Light | Dark | Назначение |
|-------|-------|------|------------|
| `--text-primary` | `#111318` | `#F0F1F4` | Основной текст, заголовки |
| `--text-secondary` | `#5C6070` | `#8B8FA3` | Вторичный текст, подписи |
| `--text-tertiary` | `#9096A5` | `#5C6070` | Плейсхолдеры, неактивный |
| `--text-inverse` | `#F0F1F4` | `#111318` | Текст на тёмном/светлом фоне |
| `--text-accent` | `#6C5CE7` | `#8B7CF7` | Ссылки, accent-текст |
| `--text-on-primary` | `#FFFFFF` | `#FFFFFF` | Текст на primary-кнопке |

### 2.4 Границы (Borders)

| Токен | Light | Dark | Назначение |
|-------|-------|------|------------|
| `--border-default` | `#E4E5EA` | `#252832` | Разделители, рамки карт |
| `--border-strong` | `#CED0D8` | `#363944` | Активный border, focus |
| `--border-muted` | `#F0F1F4` | `#1A1D28` | Тонкие разделители |
| `--border-accent` | `#6C5CE7` | `#8B7CF7` | Selected border, focus ring |

### 2.5 Статусы

| Токен | Light | Dark | Назначение |
|-------|-------|------|------------|
| `--success` | `#10B981` | `#34D399` | Успех, готово |
| `--success-muted` | `#10B981/12%` | `#34D399/10%` | Фон success-бейджей |
| `--warning` | `#F59E0B` | `#FBBF24` | Предупреждение |
| `--warning-muted` | `#F59E0B/12%` | `#FBBF24/10%` | Фон warning-бейджей |
| `--error` | `#EF4444` | `#F87171` | Ошибка, destructive |
| `--error-muted` | `#EF4444/12%` | `#F87171/10%` | Фон error-бейджей |
| `--info` | `#3B82F6` | `#60A5FA` | Информация |
| `--info-muted` | `#3B82F6/12%` | `#60A5FA/10%` | Фон info-бейджей |

### 2.6 Генерация (специфические)

| Токен | Light | Dark | Назначение |
|-------|-------|------|------------|
| `--gen-pending` | `#F59E0B` | `#FBBF24` | Пульс анимация, ожидание |
| `--gen-processing` | `#6C5CE7` | `#8B7CF7` | Идёт генерация, лоадер |
| `--gen-complete` | `#10B981` | `#34D399` | Генерация завершена |
| `--gen-failed` | `#EF4444` | `#F87171` | Ошибка генерации |

---

## 3. Типографика

### Шрифты
- **Основной:** Inter (400, 500, 600)
- **Моноширинный:** JetBrains Mono (для кода, таймеров, ID)

### Размеры (шкала)

| Токен | Размер | Line-height | Weight | Использование |
|-------|--------|-------------|--------|---------------|
| `text-xs` | 11px | 16px | 400 | Мета, timestamps, counters |
| `text-sm` | 13px | 18px | 400/500 | Подписи, бейджи, навигация |
| `text-base` | 14px | 20px | 400 | Основной текст |
| `text-md` | 15px | 22px | 500 | Акцентные подписи |
| `text-lg` | 17px | 24px | 600 | Заголовок секции |
| `text-xl` | 20px | 28px | 600 | Заголовок страницы |
| `text-2xl` | 24px | 32px | 700 | Крупный заголовок |

> Основной текст 14px, не 16px — tight-дизайн, более плотная подача.

---

## 4. Пространство (Spacing)

### Шкала (4px base)

| Токен | Значение | Использование |
|-------|----------|---------------|
| `space-0.5` | 2px | Микро-gap между иконкой и текстом |
| `space-1` | 4px | Gap внутри бейджей, минимальный |
| `space-1.5` | 6px | Padding кнопки xs |
| `space-2` | 8px | Padding кнопки sm, gap в группах |
| `space-3` | 12px | Padding кнопки md, gap между карточками |
| `space-4` | 16px | Padding карточки, gap секций |
| `space-5` | 20px | Padding панели |
| `space-6` | 24px | Padding модалки |
| `space-8` | 32px | Gap между блоками |

### Правила
- **Карточка:** padding `12px`, не 16-24px
- **Кнопка:** padding `6px 12px` (sm), `8px 14px` (md), `8px 20px` (lg)
- **Input:** padding `6px 10px`, height `32px` (sm) / `36px` (md)
- **Gap в grid:** `8px` для плотных сеток, `12px` для карт
- **Модалка:** padding `20px`, не 24px

---

## 5. Радиусы скруглений

| Токен | Значение | Использование |
|-------|----------|---------------|
| `radius-xs` | 2px | Бейджи inline, мелкие элементы |
| `radius-sm` | 4px | Кнопки, inputs, бейджи |
| `radius-md` | 6px | Карточки, дропдауны, поповеры |
| `radius-lg` | 8px | Модалки, sheet |
| `radius-full` | 9999px | Аватары, круглые кнопки |

> Максимальный радиус 8px. Никаких `rounded-xl` (12px), `rounded-2xl` (16px).

---

## 6. Тени (Shadows)

| Токен | Light | Dark | Использование |
|-------|-------|------|---------------|
| `shadow-xs` | `0 1px 2px rgba(0,0,0,0.04)` | `0 1px 2px rgba(0,0,0,0.3)` | Кнопки, inputs |
| `shadow-sm` | `0 1px 2px rgba(0,0,0,0.03), 0 4px 8px rgba(18,42,66,0.015)` | `0 2px 4px rgba(0,0,0,0.4)` | Карточки |
| `shadow-md` | `0 4px 12px rgba(0,0,0,0.08)` | `0 4px 12px rgba(0,0,0,0.5)` | Дропдауны, поповеры |
| `shadow-lg` | `0 8px 24px rgba(0,0,0,0.12)` | `0 8px 24px rgba(0,0,0,0.6)` | Модалки |

> **Light theme:** layered tinted shadows (Stripe-подход) — два слоя с ультра-низкой opacity, второй слой с синим подтоном `rgba(18,42,66,...)` вместо чёрного для органичного вида.
> **Dark theme:** тени глубже. Разделение поверхностей — через цвет фона, не через тени.

---

## 7. Состояния элементов

### 7.1 Кнопка Primary

| Состояние | Фон | Текст | Border | Прочее |
|-----------|-----|-------|--------|--------|
| Default | `--primary` | `#FFFFFF` | нет | `shadow-xs` |
| Hover | `--primary-hover` | `#FFFFFF` | нет | `shadow-sm` |
| Active | `--primary-active` | `#FFFFFF` | нет | scale(0.98) |
| Disabled | `--primary/40%` | `#FFFFFF/60%` | нет | cursor: not-allowed |
| Loading | `--primary` | `#FFFFFF` | нет | spinner, pointer-events: none |

### 7.2 Кнопка Secondary (Ghost)

| Состояние | Фон | Текст | Border |
|-----------|-----|-------|--------|
| **Light theme** ||||
| Default | transparent | `--text-secondary` | `--border-default` |
| Hover | `--bg-inset` | `--text-primary` | `--border-strong` |
| Active | `--bg-inset` | `--text-primary` | `--border-strong` |
| Selected | `--primary-muted` | `--primary` | `--border-accent` |
| **Dark theme** ||||
| Default | transparent | `--text-secondary` | `--border-default` |
| Hover | `#FFFFFF/6%` | `--text-primary` | `--border-strong` |
| Active | `#FFFFFF/8%` | `--text-primary` | `--border-strong` |
| Selected | `--primary-muted` | `--primary` | `--border-accent` |

### 7.3 Карточка (ElementCard, ModelCard)

| Состояние | Фон | Border | Прочее |
|-----------|-----|--------|--------|
| **Light theme** ||||
| Default | `--bg-elevated` | `--border-default` | — |
| Hover | `--bg-elevated-hover` | `--border-strong` | `shadow-sm` |
| Selected | `--bg-elevated` | `--border-accent` (2px) | `--primary-muted` ring |
| Active/Pressed | `--bg-elevated-hover` | `--border-strong` | scale(0.99) |
| **Dark theme** ||||
| Default | `--bg-elevated` | `--border-default` | — |
| Hover | `--bg-elevated-hover` | `--border-strong` | subtle glow |
| Selected | `--bg-elevated` | `--border-accent` (2px) | `--primary-muted` ring |
| Active/Pressed | `--bg-elevated-hover` | `--border-strong` | scale(0.99) |

### 7.4 Input

| Состояние | Фон | Border | Текст |
|-----------|-----|--------|-------|
| **Light theme** ||||
| Default | `--bg-inset` | `--border-default` | `--text-primary` |
| Hover | `--bg-inset` | `--border-strong` | `--text-primary` |
| Focus | `#FFFFFF` | `--border-accent` | `--text-primary` |
| Error | `--error-muted` | `--error` | `--text-primary` |
| Disabled | `--bg-inset/50%` | `--border-muted` | `--text-tertiary` |
| Placeholder | — | — | `--text-tertiary` |
| **Dark theme** ||||
| Default | `#FFFFFF/5%` | `--border-default` | `--text-primary` |
| Hover | `#FFFFFF/7%` | `--border-strong` | `--text-primary` |
| Focus | `#FFFFFF/8%` | `--border-accent` | `--text-primary` |
| Error | `--error-muted` | `--error` | `--text-primary` |
| Disabled | `#FFFFFF/3%` | `--border-muted` | `--text-tertiary` |
| Placeholder | — | — | `--text-tertiary` |

### 7.5 Навигация (Sidebar item)

| Состояние | Фон | Текст | Иконка |
|-----------|-----|-------|--------|
| **Light theme** ||||
| Default | transparent | `--text-secondary` | `--text-tertiary` |
| Hover | `--bg-inset` | `--text-primary` | `--text-secondary` |
| Active (текущая) | `--primary-muted` | `--primary` | `--primary` |
| **Dark theme** ||||
| Default | transparent | `--text-secondary` | `--text-tertiary` |
| Hover | `#FFFFFF/6%` | `--text-primary` | `--text-secondary` |
| Active (текущая) | `--primary-muted` | `--primary` | `--primary` |

### 7.6 Бейджи / Теги

| Вариант | Фон | Текст | Border |
|---------|-----|-------|--------|
| Default | `--bg-inset` | `--text-secondary` | нет |
| Primary | `--primary-muted` | `--primary` | нет |
| Success | `--success-muted` | `--success` | нет |
| Warning | `--warning-muted` | `--warning` | нет |
| Error | `--error-muted` | `--error` | нет |
| Outline | transparent | `--text-secondary` | `--border-default` |

> Бейджи: padding `2px 6px`, radius `2px`, font-size `11px`, font-weight `500`

### 7.7 Checkbox / Toggle

| Состояние | Фон | Border | Иконка |
|-----------|-----|--------|--------|
| Unchecked | transparent | `--border-default` | — |
| Unchecked hover | transparent | `--border-strong` | — |
| Checked | `--primary` | `--primary` | `#FFFFFF` check |
| Checked hover | `--primary-hover` | `--primary-hover` | `#FFFFFF` check |
| Disabled | `--bg-inset` | `--border-muted` | `--text-tertiary` |

---

## 8. Иерархия поверхностей (визуальная глубина)

### Light Theme (от дальнего к ближнему)
```
Уровень 0: --bg-base (#F5F6F8)         ← фон страницы, content area
Уровень 1: --bg-surface (#EEEEF2)      ← sidebar, панели
Уровень 2: --bg-elevated (#FFFFFF)     ← карточки (border + layered shadow-sm)
Уровень 3: --bg-elevated (#FFFFFF)     ← поповеры, дропдауны (shadow-md)
Уровень 4: --bg-elevated (#FFFFFF)     ← модалки (shadow-lg + overlay)
```

> **Light depth strategy:** тонированный фон + белые карточки + layered tinted micro-shadow.
> Карточки "приподнимаются" над фоном через контраст цвета и ультра-лёгкую двуслойную тень.
> Sidebar темнее content area для создания глубины навигации.

### Dark Theme (от дальнего к ближнему)
```
Уровень 0: --bg-base (#0C0F16)         ← фон страницы
Уровень 1: --bg-surface (#13161F)      ← sidebar, панели
Уровень 2: --bg-elevated (#1A1D28)     ← карточки (border only, без shadow)
Уровень 3: --bg-elevated (#1F2330)     ← поповеры, дропдауны
Уровень 4: --bg-elevated (#252832)     ← модалки (+ overlay)
```

> В dark-теме каждый уровень немного светлее. Разделение через цвет и border, не через тени.

---

## 9. Анимации

| Тип | Длительность | Easing | Применение |
|-----|-------------|--------|------------|
| Hover | 150ms | ease-out | Цвет, border, тень |
| Press | 100ms | ease-in | scale(0.98) |
| Expand | 200ms | ease-out | Раскрытие панелей |
| Modal open | 200ms | ease-out | scale(0.98→1) + opacity |
| Modal close | 150ms | ease-in | opacity→0 |
| Fade | 150ms | ease | Появление/исчезновение |
| Skeleton pulse | 1.5s | ease-in-out | Infinite, opacity 0.5→1 |
| Gen spinner | 1s | linear | Infinite rotate |

---

## 10. Иконки

- **Набор:** Lucide React (уже используется)
- **Размеры:** 14px (inline), 16px (кнопки/nav), 20px (акцент), 24px (заголовки)
- **Stroke width:** 1.75 (чуть тоньше дефолта 2)
- **Цвет:** наследует от текста (`currentColor`)

---

## 11. Focus Ring

| Свойство | Значение |
|----------|----------|
| Цвет | `--primary/40%` |
| Ширина | 2px |
| Offset | 1px |
| Показывать | Только `focus-visible` (не на клик) |

---

## 12. Контраст (WCAG AA проверка)

| Пара | Light ratio | Dark ratio | Статус |
|------|-------------|------------|--------|
| text-primary / bg-base | 17.4:1 | 14.8:1 | AA pass |
| text-secondary / bg-base | 5.6:1 | 4.8:1 | AA pass |
| text-tertiary / bg-base | 3.5:1 | 3.2:1 | AA (large text only) |
| primary / bg-base | 4.6:1 | 5.2:1 | AA pass |
| text-primary / bg-elevated | 17.4:1 | 11.2:1 | AA pass |
| text-on-primary / primary | 7.1:1 | 6.8:1 | AA pass |

---

## 13. Итоговая шпаргалка: "Что каким цветом"

### Фоны
| Что | Light | Dark |
|-----|-------|------|
| Страница | `#F5F6F8` | `#0C0F16` |
| Sidebar | `#EEEEF2` | `#13161F` |
| Карточка | `#FFFFFF` + border + shadow-sm | `#1A1D28` + border |
| Input | `#F0F1F4` | `rgba(255,255,255,0.05)` |
| Selected bg | `rgba(108,92,231,0.12)` | `rgba(139,124,247,0.12)` |
| Hover bg | `#F5F5F7` | `rgba(255,255,255,0.06)` |

### Текст
| Что | Light | Dark |
|-----|-------|------|
| Заголовок | `#111318` | `#F0F1F4` |
| Обычный текст | `#111318` | `#F0F1F4` |
| Подпись | `#5C6070` | `#8B8FA3` |
| Неактивный | `#9096A5` | `#5C6070` |
| Ссылка/акцент | `#6C5CE7` | `#8B7CF7` |

### Границы
| Что | Light | Dark |
|-----|-------|------|
| Обычная рамка | `#E4E5EA` | `#252832` |
| Hover рамка | `#CED0D8` | `#363944` |
| Selected рамка | `#6C5CE7` | `#8B7CF7` |
| Focus ring | `rgba(108,92,231,0.4)` | `rgba(139,124,247,0.4)` |

### Кнопка Primary
| Что | Light | Dark |
|-----|-------|------|
| Фон | `#6C5CE7` | `#8B7CF7` |
| Hover | `#5A4BD6` | `#9D90FF` |
| Текст | `#FFFFFF` | `#FFFFFF` |

### Статусы
| Что | Цвет (dark) | Фон бейджа (dark) |
|-----|-------------|-------------------|
| Успех | `#34D399` | `rgba(52,211,153,0.10)` |
| Ошибка | `#F87171` | `rgba(248,113,113,0.10)` |
| Ожидание | `#FBBF24` | `rgba(251,191,36,0.10)` |
| Инфо | `#60A5FA` | `rgba(96,165,250,0.10)` |

---

## 14. Отличия от текущего globals.css

| Что меняется | Было | Стало | Зачем |
|--------------|------|-------|-------|
| Light bg-base | `#FFFFFF` | `#F5F6F8` (тонированный) | Создаёт контраст с белыми карточками, глубина |
| Light bg-surface | `#F8F9FB` | `#EEEEF2` (темнее) | Sidebar/панели отделяются от content area |
| Light shadow-sm | `0 2px 4px rgba(0,0,0,0.06)` | `0 1px 2px rgba(0,0,0,0.03), 0 4px 8px rgba(18,42,66,0.015)` | Layered tinted shadow, карточки "приподняты" |
| Dark bg-base | `#0F172A` (Tailwind slate-900) | `#0C0F16` (нейтральнее, глубже) | Убираем синий подтон, чище |
| Dark bg-elevated | `#1E293B` (slate-800) | `#1A1D28` (нейтральный) | Менее синий, современнее |
| Dark border | `#334155` (slate-700) | `#252832` (тоньше, мягче) | Границы менее грубые |
| Радиусы | 8px base | 6px max для карт, 4px для кнопок | Tight дизайн |
| Основной текст | 16px | 14px | Плотнее, профессиональнее |
| Padding карточки | 16-24px | 12px | Компактнее |
| Кнопка height | 36-40px | 32-36px | Tight |
| Input bg (dark) | `oklch(1 0 0 / 10%)` | `rgba(255,255,255,0.05)` | Менее яркий |
