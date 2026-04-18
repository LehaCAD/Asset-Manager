## UX Analysis: Grid UX — разделение групп/элементов + DnD
### Размер: L

### 1. Текущее состояние

**Проблемы:**
- Группы и элементы в одном потоке — визуально неразличимы, нет иерархии
- DnD бедный — только `opacity: 0.4`, нет drag overlay, нет elevation
- Нет cross-container DnD — перемещение только через диалог MoveToGroupDialog
- Нет badge «Группа» на GroupCard (задизайнен в pen, не реализован в коде)
- BulkBar расходится с pen (ghost buttons вместо filled) — вне scope этой задачи
- Дублирование SceneCard/GroupCard — два компонента для одной сущности — вне scope
- `<video>` в SceneCard — нарушение CLAUDE.md — вне scope, отдельный тикет

**Pen mockup:** node `QjqXS` в `pen/pencil-new.pen` — "UX: Grid DnD разделение 2026-04-04"

### 2. Impact Map

| Компонент/файл | Как затронут | Критичность |
|---|---|---|
| `ElementGrid.tsx` | Разделение на 2 секции, 2 SortableContext, DragOverlay, accordion headers | HIGH |
| `GroupCard.tsx` | Badge «Группа», drop target state, useDroppable | HIGH |
| `scene-workspace.ts` | collapsedSections, section select all, groups/elements разделение | CRITICAL |
| `ElementCard.tsx` | SortableElementCard — data.groupId для DnD context | MEDIUM |
| `WorkspaceContainer.tsx` | Убрать inline groups render, делегировать в ElementGrid | MEDIUM |
| `elementsApi.ts` | Уже есть `POST /api/elements/move/` — достаточно | LOW |
| `scenes.ts` (store) | reorderScenes уже есть | LOW |
| `types/index.ts` | DragItemType enum, SectionState type | LOW |
| `LightboxModal.tsx` | Navigate должна пропускать элементы из свёрнутых секций | MEDIUM |
| `ElementBulkBar.tsx` | Интеграция с section checkbox (partial state) | MEDIUM |

### 3. Решение

#### 3.1 Accordion секции (Frame.io паттерн)

Каждая секция (Группы / Элементы) имеет collapsible header:

**Header:** `☐ ˅ N Группы · XX,X МБ`
- Checkbox (18x18, `rounded-sm`, border `#475569`) — select all в секции
  - Empty: ничего не выбрано
  - Partial (—): часть выбрана → `bg-primary`, minus icon
  - Full (✓): все выбраны → `bg-primary`, check icon
- Chevron (`chevron-down` / `chevron-right`, 16x16, `#64748B`) — toggle collapse
- Label: count + тип ("3 Группы" / "8 Элементов"), `#94A3B8`, 12px/500
- Dot separator: `·`, `#475569`
- Size: суммарный размер, `#64748B`, 12px/normal

**Collapse behavior:**
- Развёрнуто: chevron-down, контент виден
- Свёрнуто: chevron-right, только header bar
- Transition: height 200ms ease, chevron rotate 200ms
- State в localStorage per project (`grid-sections-${projectId}`)
- По умолчанию: обе секции развёрнуты

#### 3.2 Секция «Группы» — горизонтальный ряд

- Карточки GroupCard в горизонтальном ряду (scroll если не помещаются)
- Размер масштабируется с настройкой «Вид» (sm/md/lg), **AR не влияет**
- Badge «Группа» overlay на preview: bg `#0F172ACC`, cornerRadius 4, Lucide folder 10px + text 9px/600 `#94A3B8`
- Preview: 2x2 мини-grid или placeholder folder icon
- Info bar: folder icon 14px + name 13px/500 `#F8FAFC` + count 11px `#64748B`
- Фильтры (Все/Избранное/Изображения/Видео) **НЕ влияют** на группы
- Секция скрыта если групп нет (header тоже не показываем)

#### 3.3 Секция «Элементы» — основной grid

- Без изменений в логике отображения
- Accordion header сверху с checkbox + chevron + count + size
- Фильтры влияют только на эту секцию

#### 3.4 DnD: элементы → группы (cross-container)

**ID-конвенция (КРИТИЧНО):** во избежание коллизий (group.id=42 и element.id=42 — разные таблицы БД), все DnD item IDs **обязательно** префиксуются:
- Группы: `group-{id}` (e.g. `group-42`)
- Элементы: `element-{id}` (e.g. `element-42`)
- Парсинг в drag handlers: `const [type, rawId] = active.id.split('-'); const id = Number(rawId);`

**Collision detection:** меняем `closestCenter` → `pointerWithin`. Причина: `pointerWithin` предотвращает случайный drop в группу при drag между соседними элементами (pointer должен быть внутри target, а не просто ближе всего к центру).

Архитектура @dnd-kit:
```
<DndContext
  sensors={[PointerSensor(distance:8), KeyboardSensor]}
  collisionDetection={pointerWithin}
  onDragStart={handleDragStart}
  onDragOver={handleDragOver}
  onDragEnd={handleDragEnd}
>
  <SortableContext items={prefixedGroupIds}>  ← "group-1", "group-2", ...
    <GroupsRow />  ← каждая GroupCard = useSortable + useDroppable
  </SortableContext>

  <SortableContext items={prefixedElementIds}>  ← "element-1", "element-2", ...
    <ElementGrid />
  </SortableContext>

  <DragOverlay>
    {activeDragItem?.type === 'element' && <ElementCardPreview count={selectedCount} />}
    {activeDragItem?.type === 'group' && <GroupCardPreview />}
  </DragOverlay>
</DndContext>
```

**Состояние DnD (локальное в ElementGrid):**
```typescript
// useState внутри компонента, не в store
const [activeDragItem, setActiveDragItem] = useState<{ id: number; type: 'element' | 'group' } | null>(null);
const [overDropTarget, setOverDropTarget] = useState<string | null>(null); // prefixed ID

// onDragStart: захватить тип и ID, запомнить selected для multi-drag
// onDragOver: подсветить drop target (setOverDropTarget)
// onDragEnd: определить действие по типам active/over:
//   element → element (same container) = reorder → elementsApi.reorder()
//   element → group = move → elementsApi.move({ element_ids, target_scene })
//   group → group (reorder) = scenesApi.reorder()
//   group → group (drop on) = elementsApi.move({ group_ids, target_scene })
```

**Горизонтальный scroll в секции групп:**
- Контейнер: `overflow-x: auto`, `overflow-y: hidden`, `scroll-behavior: smooth`
- SortableContext внутри scroll container — @dnd-kit корректно работает с overflow
- PointerSensor distance=8 отличает scroll от drag

**Drag Overlay:**
- Clone карточки, `opacity: 0.85`
- Shadow: `0 8px 24px rgba(0,0,0,0.3)`
- Multi-drag: stack (3 карточки со смещением 6px) + badge `+N` (circle 24px, `#8B7CF7`, white text)

**Drop Target (группа):**
- Border: `2px solid #8B7CF7`
- Background: `#8B7CF710`
- Folder icon переключается на `folder-open`, цвет `#8B7CF7`
- Badge text цвет `#8B7CF7`
- Transition: 150ms

**Ghost (источник):**
- `opacity: 0.3`, dashed border `#8B7CF740`
- Остаётся на месте пока drag не завершён

**Success feedback:**
- Target группа: flash `#8B7CF715` → normal, 300ms
- Source grid: элементы fade out 200ms
- Layout animation: `transition: transform 200ms ease`

**Порядок при drop:** элементы добавляются **в конец** целевой группы.

#### 3.5 DnD: группы (reorder + в другие группы)

- GroupCard sortable в секции групп
- Drag handle: вся карточка (distance: 8px предотвращает click)
- **Reorder групп** → `scenesApi.reorder(projectId, { scene_ids })` (НЕ elementsApi)
- Drop группы на другую группу = move → `elementsApi.move({ group_ids, target_scene })`
- Запрет: drop в саму себя, drop если target уже имеет parent (nesting > 2)
- Visual feedback запрета: cursor `not-allowed`, no highlight
- Drag overlay для групп: GroupCard clone с shadow (аналогично элементам)

**Keyboard accessibility (ограничение):** cross-container DnD (element → group) через клавиатуру не поддерживается в MVP. Reorder внутри секций через KeyboardSensor работает. Перемещение между контейнерами — через MoveToGroupDialog (существующий).

### 4. Развилки (решены)

| Вопрос | Решение | Обоснование |
|---|---|---|
| Секция групп: горизонтальная строка или grid? | Горизонтальная строка | Чёткое визуальное разделение, не крадёт vertical space |
| Размер GroupCard | Масштабируется с «Вид» (sm/md/lg), AR не влияет | Пользователь просил: при больших элементах не должно быть микропапок |
| Multi-drag: куда вставлять? | В конец целевой группы | Простейшая логика, предсказуемо. Потом можно reorder внутри |
| Scope | Полный: A+B+C (разделение + DnD элементов + DnD групп) | Пользователь решил |
| Accordion | Обе секции collapsible с checkbox + chevron | Frame.io референс, пользователь подтвердил |

### 5. Scope для имплементации

**Backend:**
- Уже есть `POST /api/elements/move/` с `element_ids`, `group_ids`, `target_scene` — достаточно
- Уже есть `POST /api/scenes/reorder/` — достаточно
- Уже есть `POST /api/elements/reorder/` — достаточно
- Новый endpoint не нужен

**Frontend — Store (`scene-workspace.ts`):**
- Добавить `collapsedSections: { groups: boolean, elements: boolean }` — persist в localStorage
- Добавить `toggleSectionCollapse(section)` action
- Добавить `selectAllInSection(section: 'groups' | 'elements')` action:
  - `'groups'` → toggle все group IDs в `selectedIds`
  - `'elements'` → toggle все **отфильтрованные** element IDs (учитывает текущий фильтр)
  - Section-level select работает **только внутри своей секции**, не трогает другую
- Разделить rendering groups vs elements (уже раздельно в state: `groups[]` + `elements[]`)
- **НЕ менять `getFilteredElements()`** для collapse — эта функция используется в grid rendering, selection, bulk bar. Для lightbox navigation: отдельная функция `getVisibleElementsForLightbox()` которая пропускает элементы из свёрнутой секции

**Frontend — Components:**

| Файл | Изменение |
|---|---|
| `ElementGrid.tsx` | Рефакторинг: 2 секции с accordion headers, 2 SortableContext, DndContext с pointerWithin, DragOverlay component |
| `GroupCard.tsx` | Badge «Группа» overlay, drop target state (useDroppable), visual feedback |
| `ElementCard.tsx` / `SortableElementCard` | DnD data с type='element' для различения |
| `WorkspaceContainer.tsx` | Убрать inline groups render (делегировать в ElementGrid) |
| `ElementBulkBar.tsx` | Интеграция с section checkbox partial state |
| Новый: `SectionHeader.tsx` | Reusable accordion header: checkbox + chevron + label + count + size |
| Новый: `DragOverlayContent.tsx` | Render drag overlay: single card или multi-drag stack с badge |

**Frontend — Types (`types/index.ts`):**
- `DragItemType = 'element' | 'group'`
- `SectionCollapseState = { groups: boolean, elements: boolean }`

**Edge cases:**
- 0 групп → секция «Группы» полностью скрыта (нет header)
- 1 группа → секция видна, 1 карточка
- 0 элементов → header «0 Элементов», пустой grid (EmptyState)
- 100+ элементов → работает (нет виртуализации, уже ок)
- Drop группы в саму себя → запрет, no visual feedback
- Drop в группу с children при nesting=2 → запрет, cursor not-allowed
- Свёрнутая секция + lightbox → navigate пропускает невидимые
- Свёрнутая секция + DnD → drop на свёрнутую группу работает (header виден, можно drop на него)
- Select all через header checkbox → только visible элементы (учитывает фильтр)

**Порядок работы:**
1. `SectionHeader` component (accordion, checkbox, chevron)
2. `ElementGrid` рефакторинг — 2 секции
3. `GroupCard` — badge + drop target
4. DnD setup — DndContext, SortableContext, collision, DragOverlay
5. Store — collapsedSections, selectAllInSection
6. Multi-drag overlay
7. Integration + edge cases
