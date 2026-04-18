## UX Analysis: Редизайн ProjectCard и GroupCard
### Размер: L

### 1. Текущее состояние
- ProjectCard и GroupCard визуально почти одинаковы (оба 2x2 grid)
- Несогласованный radius (rounded-lg vs rounded-md)
- SceneCard рендерит `<video>` в grid (запрещено CLAUDE.md)
- Нет даты обновления на карточках
- Нет selected state у GroupCard (pen показывает, код нет)
- headliner_thumbnail_url игнорируется

### 2. Решение (завизировано)

**ProjectCard E — мозаика 1+3 с воздухом:**
- Width: 320px в grid (minmax 300px)
- Preview: 1 hero + 0-3 боковых, padding 6px, gap 4px, inner radius 6px
- Footer: status dot (●) + текст, группы + элементы + хранилище (dot-separated), relative date
- Без badge "Проект", без shadcn Badge для статуса
- Radius: 8px (rounded-[8px])

**GroupCard G7 — стопка с одним headliner:**
- Front card: 230px (medium), wrapper: 245px
- 2 слоя за карточкой (стопка) — всегда видны
- Preview: один headliner с padding 6px, inner radius 6px
- Selected: purple border 2px + purple tint на слоях (#1A1530, #1C1835)
- Dragging: opacity 0.4 на всей стопке
- Без badge "Группа"
- Footer: name + image icon + count + storage

**Edge cases:**
- Project 0 эл.: placeholder (Film icon + "Нет элементов")
- Project 1 эл.: полный hero на всю ширину
- Project 2 эл.: hero + 1 боковой
- Project 3 эл.: hero + 2 боковых
- Group 0 эл.: placeholder (Image icon + "Пусто"), стопка видна
- Длинные названия: line-clamp-1 (project), fixed-width перенос (group)
- Статусы: зелёный (Активен), жёлтый (На паузе), синий (Завершён)

### 3. Mockup
- Pen file: `pen/pencil-new.pen`
- Фрейм "UX: FINAL — Project E + Group G7" (node `knsuw`)
- Фрейм "UX: Edge Cases" (node `n03zi`)
- Фрейм "UX: Card Redesign v2" (node `yKWGB`)

### 4. Scope для имплементации
- Plan: `docs/superpowers/plans/2026-04-05-card-redesign.md`
- 8 tasks, ~30 steps
