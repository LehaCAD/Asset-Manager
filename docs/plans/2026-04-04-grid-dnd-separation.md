# Grid UX: Separation + DnD + Accordion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate groups and elements into collapsible accordion sections with Frame.io-style headers, and add cross-container drag & drop (elements into groups, group reordering).

**Architecture:** Two-section layout inside `ElementGrid` — groups row (horizontal, scrollable) above elements grid. Single `DndContext` wraps both `SortableContext` instances. Prefixed IDs (`group-{id}`, `element-{id}`) prevent DnD ID collisions. Store `selectedIds: Set<number>` remains shared for both groups and elements — ID collisions between group.id and element.id are theoretically possible (different DB tables) but practically rare; `selectAllInSection` operates on known items so selection logic is safe. The DnD layer uses prefixed IDs and never puts raw numeric IDs into the DnD system. No backend changes needed — existing move/reorder APIs are sufficient.

**Tech Stack:** Next.js 14, React 19, Zustand 5, @dnd-kit/core + @dnd-kit/sortable, Tailwind 4, Lucide icons

**UX Spec:** `docs/ux-analyses/2026-04-04-grid-dnd-separation.md`
**Pen Mockup:** node `QjqXS` in `pen/pencil-new.pen`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/lib/types/index.ts` | Modify | Add `DragItemType`, `SectionCollapseState` types |
| `frontend/lib/utils/constants.ts` | Modify | Add `GROUP_CARD_SIZES` (size-only, no AR) |
| `frontend/lib/utils/dnd.ts` | Create | DnD ID helpers: `toDndId`, `parseDndId` |
| `frontend/lib/store/scene-workspace.ts` | Modify | Add `collapsedSections`, `toggleSectionCollapse`, `selectAllInSection`, `getVisibleElementsForLightbox` |
| `frontend/components/element/SectionHeader.tsx` | Create | Reusable accordion header with checkbox + chevron + label + count + size |
| `frontend/components/element/DragOverlayContent.tsx` | Create | Drag overlay: single card or multi-drag stack with badge |
| `frontend/components/element/GroupCard.tsx` | Modify | Add badge «Группа» overlay, `isDropTarget` prop, drop target visual state |
| `frontend/components/element/ElementGrid.tsx` | Modify | Major refactor: 2 accordion sections, 2 SortableContext, DndContext with pointerWithin, DragOverlay, cross-container handlers |
| `frontend/components/element/WorkspaceContainer.tsx` | Modify | Remove inline groups rendering, pass collapse callbacks |
| `frontend/components/lightbox/LightboxModal.tsx` | Modify | Use `getVisibleElementsForLightbox()` for navigation |

---

### Task 1: Types and DnD Utilities

**Files:**
- Modify: `frontend/lib/types/index.ts:204-211`
- Create: `frontend/lib/utils/dnd.ts`

- [ ] **Step 1: Add types to `types/index.ts`**

After the existing `ReorderItem` interface (line ~211), add:

```typescript
// DnD prefixed ID types — prevent collision between group.id and element.id
export type DragItemType = 'element' | 'group';

export interface DragItem {
  type: DragItemType;
  id: number;
}

export interface SectionCollapseState {
  groups: boolean;
  elements: boolean;
}
```

- [ ] **Step 2: Create `frontend/lib/utils/dnd.ts`**

```typescript
import type { DragItem, DragItemType } from '@/lib/types';

/** Convert a typed ID to a prefixed DnD string ID */
export function toDndId(type: DragItemType, id: number): string {
  return `${type}-${id}`;
}

/** Parse a prefixed DnD string ID back to type + numeric ID */
export function parseDndId(dndId: string | number): DragItem | null {
  const str = String(dndId);
  const dashIndex = str.indexOf('-');
  if (dashIndex === -1) return null;
  const type = str.slice(0, dashIndex) as DragItemType;
  if (type !== 'element' && type !== 'group') return null;
  const id = Number(str.slice(dashIndex + 1));
  if (Number.isNaN(id)) return null;
  return { type, id };
}
```

- [ ] **Step 3: Add GROUP_CARD_SIZES to constants**

In `frontend/lib/utils/constants.ts`, after `CARD_SIZES` (line ~102), add:

```typescript
// GroupCard sizes — scales with display size setting, but ignores aspect ratio.
// Always landscape-ish proportions for consistent group row height.
export const GROUP_CARD_SIZES = {
  compact: { width: 180, height: 130 },
  medium:  { width: 220, height: 155 },
  large:   { width: 280, height: 190 },
} as const;
```

- [ ] **Step 4: Verify build**

Run: `docker compose exec frontend npm run build`
Expected: Build succeeds, no type errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/types/index.ts frontend/lib/utils/dnd.ts frontend/lib/utils/constants.ts
git commit -m "feat(grid): add DnD types, ID helpers, group card sizes"
```

---

### Task 2: Store — Collapsed Sections and Section Select

**Files:**
- Modify: `frontend/lib/store/scene-workspace.ts`

- [ ] **Step 1: Add collapsed sections state and actions to interface**

In the `SceneWorkspaceState` interface (after `lightboxElementId: number | null;` around line ~260), add:

```typescript
  collapsedSections: SectionCollapseState;
```

In the selection actions section (after `toggleSelectAll`), add:

```typescript
  toggleSectionCollapse: (section: 'groups' | 'elements') => void;
  selectAllInSection: (section: 'groups' | 'elements') => void;
  getVisibleElementsForLightbox: () => WorkspaceElement[];
```

Add `SectionCollapseState` to the imports from `@/lib/types`.

- [ ] **Step 2: Add initial state and localStorage hydration**

In the initial state (after `lightboxElementId: null,` around line ~318), add:

```typescript
  collapsedSections: { groups: false, elements: false },
```

- [ ] **Step 3: Implement `toggleSectionCollapse`**

After the `toggleSelectAll` action (around line ~811), add:

```typescript
  toggleSectionCollapse: (section: 'groups' | 'elements') => {
    const { collapsedSections, projectId } = get();
    const next = {
      ...collapsedSections,
      [section]: !collapsedSections[section],
    };
    set({ collapsedSections: next });
    if (projectId) {
      try {
        localStorage.setItem(
          `grid-sections-${projectId}`,
          JSON.stringify(next),
        );
      } catch { /* localStorage unavailable */ }
    }
  },
```

- [ ] **Step 4: Implement `selectAllInSection`**

After `toggleSectionCollapse`, add:

```typescript
  selectAllInSection: (section: 'groups' | 'elements') => {
    const { selectedIds, getFilteredElements, groups } = get();

    if (section === 'groups') {
      const groupIds = groups.map((g) => g.id);
      const allGroupsSelected = groupIds.length > 0 && groupIds.every((id) => selectedIds.has(id));
      const next = new Set(selectedIds);
      if (allGroupsSelected) {
        groupIds.forEach((id) => next.delete(id));
      } else {
        groupIds.forEach((id) => next.add(id));
      }
      set({ selectedIds: next, isMultiSelectMode: next.size > 0 });
    } else {
      const filtered = getFilteredElements();
      const elementIds = filtered.map((e) => e.id);
      const allElementsSelected = elementIds.length > 0 && elementIds.every((id) => selectedIds.has(id));
      const next = new Set(selectedIds);
      if (allElementsSelected) {
        elementIds.forEach((id) => next.delete(id));
      } else {
        elementIds.forEach((id) => next.add(id));
      }
      set({ selectedIds: next, isMultiSelectMode: next.size > 0 });
    }
  },
```

- [ ] **Step 5: Implement `getVisibleElementsForLightbox`**

After `getFilteredElements` (around line ~890), add:

```typescript
  getVisibleElementsForLightbox: () => {
    const { collapsedSections } = get();
    if (collapsedSections.elements) return [];
    return get().getFilteredElements();
  },
```

- [ ] **Step 6: Hydrate collapsed sections from localStorage in `loadWorkspace`**

In the `loadWorkspace` action, after the `set({ ... })` call that sets the loaded data, add hydration:

```typescript
      // Hydrate collapsed sections from localStorage
      try {
        const stored = localStorage.getItem(`grid-sections-${projectId}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && typeof parsed.groups === 'boolean' && typeof parsed.elements === 'boolean') {
            set({ collapsedSections: parsed });
          }
        }
      } catch { /* ignore */ }
```

- [ ] **Step 7: Verify build**

Run: `docker compose exec frontend npm run build`
Expected: Build succeeds.

- [ ] **Step 8: Commit**

```bash
git add frontend/lib/store/scene-workspace.ts
git commit -m "feat(grid): add collapsedSections, selectAllInSection, lightbox visibility to store"
```

---

### Task 3: SectionHeader Component

**Files:**
- Create: `frontend/components/element/SectionHeader.tsx`

- [ ] **Step 1: Create the SectionHeader component**

```typescript
'use client';

import { cn } from '@/lib/utils';
import { formatStorage } from '@/lib/utils/format';
import { ChevronDown, ChevronRight, Check, Minus } from 'lucide-react';

type CheckboxState = 'empty' | 'partial' | 'full';

interface SectionHeaderProps {
  label: string;
  count: number;
  totalSize?: number; // bytes
  collapsed: boolean;
  checkboxState: CheckboxState;
  onToggleCollapse: () => void;
  onToggleSelectAll: () => void;
  className?: string;
}

/** Russian pluralization: 1 группа, 2 группы, 5 групп */
function pluralize(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(count) % 100;
  const lastDigit = abs % 10;
  if (abs >= 11 && abs <= 19) return `${count} ${many}`;
  if (lastDigit === 1) return `${count} ${one}`;
  if (lastDigit >= 2 && lastDigit <= 4) return `${count} ${few}`;
  return `${count} ${many}`;
}

const SECTION_LABELS: Record<string, [string, string, string]> = {
  'Группы': ['группа', 'группы', 'групп'],
  'Элементы': ['элемент', 'элемента', 'элементов'],
};

export function SectionHeader({
  label,
  count,
  totalSize,
  collapsed,
  checkboxState,
  onToggleCollapse,
  onToggleSelectAll,
  className,
}: SectionHeaderProps) {
  const ChevronIcon = collapsed ? ChevronRight : ChevronDown;
  const forms = SECTION_LABELS[label] ?? [label, label, label];
  const countLabel = pluralize(count, forms[0], forms[1], forms[2]);

  return (
    <div className={cn('flex items-center gap-2 py-1', className)}>
      {/* Checkbox */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelectAll();
        }}
        className={cn(
          'flex h-[18px] w-[18px] items-center justify-center rounded-sm border-[1.5px] transition-colors',
          checkboxState === 'empty'
            ? 'border-[#475569] bg-transparent'
            : 'border-primary bg-primary',
        )}
        aria-label={`Выбрать все ${label.toLowerCase()}`}
      >
        {checkboxState === 'full' && <Check className="h-3 w-3 text-primary-foreground" />}
        {checkboxState === 'partial' && <Minus className="h-3 w-3 text-primary-foreground" />}
      </button>

      {/* Chevron + Label (clickable to collapse) */}
      <button
        type="button"
        onClick={onToggleCollapse}
        className="flex items-center gap-1.5 text-[12px] font-medium text-[#94A3B8] hover:text-foreground transition-colors"
      >
        <ChevronIcon className="h-4 w-4 text-[#64748B] transition-transform duration-200" />
        <span>{countLabel}</span>
      </button>

      {/* Size */}
      {totalSize !== undefined && totalSize > 0 && (
        <>
          <span className="text-[12px] text-[#475569]">·</span>
          <span className="text-[12px] text-[#64748B]">{formatStorage(totalSize)}</span>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `docker compose exec frontend npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/element/SectionHeader.tsx
git commit -m "feat(grid): add SectionHeader accordion component"
```

---

### Task 4: DragOverlayContent Component

**Files:**
- Create: `frontend/components/element/DragOverlayContent.tsx`

- [ ] **Step 1: Create the DragOverlayContent component**

```typescript
'use client';

import type { WorkspaceElement, Scene, DisplayCardSize, DisplayAspectRatio, DisplayFitMode } from '@/lib/types';
import { cn } from '@/lib/utils';
import { CARD_SIZES, GROUP_CARD_SIZES, ASPECT_RATIO_CLASSES, FIT_MODE_CLASSES } from '@/lib/utils/constants';
import { Folder } from 'lucide-react';

interface DragOverlayContentProps {
  type: 'element' | 'group';
  /** The dragged element (if type === 'element') */
  element?: WorkspaceElement;
  /** The dragged group (if type === 'group') */
  group?: Scene;
  /** Number of additional selected items being dragged */
  additionalCount: number;
  size: DisplayCardSize;
  aspectRatio: DisplayAspectRatio;
  fitMode: DisplayFitMode;
}

export function DragOverlayContent({
  type,
  element,
  group,
  additionalCount,
  size,
  aspectRatio,
  fitMode,
}: DragOverlayContentProps) {
  if (type === 'element' && element) {
    const cardDims = CARD_SIZES[size][aspectRatio];
    const arClass = ASPECT_RATIO_CLASSES[aspectRatio];
    const fitClass = FIT_MODE_CLASSES[fitMode];

    return (
      <div className="relative">
        {/* Multi-drag background cards */}
        {additionalCount > 0 && (
          <>
            <div
              className="absolute rounded-md bg-muted/40"
              style={{
                width: cardDims.width - 20,
                height: cardDims.height - 20,
                top: 12,
                left: 12,
              }}
            />
            <div
              className="absolute rounded-md bg-muted/60"
              style={{
                width: cardDims.width - 20,
                height: cardDims.height - 20,
                top: 6,
                left: 6,
              }}
            />
          </>
        )}

        {/* Main card */}
        <div
          className={cn('rounded-md bg-muted overflow-hidden', arClass)}
          style={{
            width: cardDims.width,
            opacity: 0.85,
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          }}
        >
          {element.thumbnail_url ? (
            <img
              src={element.thumbnail_url}
              alt=""
              className={cn('h-full w-full', fitClass)}
              draggable={false}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted" />
          )}
        </div>

        {/* Multi-drag badge */}
        {additionalCount > 0 && (
          <div className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
            +{additionalCount}
          </div>
        )}
      </div>
    );
  }

  if (type === 'group' && group) {
    const dims = GROUP_CARD_SIZES[size];

    return (
      <div
        className="relative rounded-lg border border-border bg-card overflow-hidden"
        style={{
          width: dims.width,
          height: dims.height,
          opacity: 0.85,
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        }}
      >
        <div className="flex h-full w-full items-center justify-center bg-muted/50">
          <Folder className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-card/90 px-2.5 py-1.5">
          <span className="text-[13px] font-medium text-foreground truncate block">
            {group.name}
          </span>
        </div>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 2: Verify build**

Run: `docker compose exec frontend npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/element/DragOverlayContent.tsx
git commit -m "feat(grid): add DragOverlayContent for single and multi-drag"
```

---

### Task 5: GroupCard — Badge and Drop Target State

**Files:**
- Modify: `frontend/components/element/GroupCard.tsx`

- [ ] **Step 1: Add `isDropTarget` prop to GroupCardProps interface**

In `GroupCardProps` (around line 10-22), add:

```typescript
  isDropTarget?: boolean;
```

And add to the destructured props (around line 24-35):

```typescript
  isDropTarget = false,
```

- [ ] **Step 2: Add badge «Группа» overlay to the preview section**

Find the preview area in GroupCard (the frame with thumbnails or folder icon placeholder). Add this badge overlay inside the preview container, positioned absolute top-left:

```tsx
{/* Badge «Группа» */}
<div className="absolute left-1.5 top-1.5 z-10 flex items-center gap-1 rounded bg-[#0F172A]/80 px-1.5 py-0.5">
  <Folder className="h-2.5 w-2.5 text-muted-foreground" />
  <span className="text-[9px] font-semibold text-muted-foreground">Группа</span>
</div>
```

- [ ] **Step 3: Add drop target visual state**

Update the card's outer `div` className to include drop target styling:

```typescript
className={cn(
  // ... existing classes ...
  isDropTarget && 'ring-2 ring-primary bg-primary/[0.04] border-primary',
)}
```

Also swap folder icon to FolderOpen when `isDropTarget` is true in the info bar:

```typescript
{isDropTarget ? (
  <FolderOpen className={cn(iconSm, "text-primary")} />
) : (
  <Folder className={cn(iconSm, "text-muted-foreground")} />
)}
```

- [ ] **Step 4: Add group card width based on GROUP_CARD_SIZES**

Import `GROUP_CARD_SIZES` from constants. Replace the existing width/aspect-ratio logic to use `GROUP_CARD_SIZES[size]` — the group card should have fixed width from the size setting, not affected by aspect ratio:

```typescript
import { GROUP_CARD_SIZES, CARD_TEXT_SIZES, CARD_ICON_SIZES } from '@/lib/utils/constants';

// In the component body:
const groupDims = GROUP_CARD_SIZES[size];
```

Use `groupDims.width` and `groupDims.height` for the card sizing instead of the aspect-ratio-based sizing.

- [ ] **Step 5: Verify build**

Run: `docker compose exec frontend npm run build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/element/GroupCard.tsx
git commit -m "feat(grid): add badge, drop target state, size-only scaling to GroupCard"
```

---

### Task 6: ElementGrid — Accordion Sections and DnD Refactor

This is the largest task. Read the current `ElementGrid.tsx` fully before starting.

**Files:**
- Modify: `frontend/components/element/ElementGrid.tsx`

**Reference files to read first:**
- `frontend/lib/utils/dnd.ts` (created in Task 1)
- `frontend/components/element/SectionHeader.tsx` (created in Task 3)
- `frontend/components/element/DragOverlayContent.tsx` (created in Task 4)
- Current `frontend/components/element/ElementGrid.tsx` (234 lines)

- [ ] **Step 1: Update imports**

Replace current @dnd-kit imports and add new ones:

```typescript
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toDndId, parseDndId } from "@/lib/utils/dnd";
import { SectionHeader } from "@/components/element/SectionHeader";
import { DragOverlayContent } from "@/components/element/DragOverlayContent";
import { GROUP_CARD_SIZES } from "@/lib/utils/constants";
import { elementsApi } from "@/lib/api/elements";
import { scenesApi } from "@/lib/api/scenes";
import type { DragItem } from "@/lib/types";
```

- [ ] **Step 2: Add DnD local state**

Inside the `ElementGrid` component function, add after existing hooks:

```typescript
  // DnD state — local, not in store
  const [activeDragItem, setActiveDragItem] = useState<DragItem | null>(null);
  const [overDropTarget, setOverDropTarget] = useState<string | null>(null);

  // Collapsed sections from store
  const {
    collapsedSections,
    toggleSectionCollapse,
    selectAllInSection,
    groups: storeGroups,
  } = useSceneWorkspaceStore();
```

Also add `useState` to the React import at the top.

- [ ] **Step 3: Compute prefixed DnD IDs**

```typescript
  const prefixedGroupIds = useMemo(
    () => groups.map((g) => toDndId('group', g.id)),
    [groups],
  );
  const prefixedElementIds = useMemo(
    () => filteredElements.map((e) => toDndId('element', e.id)),
    [filteredElements],
  );
```

- [ ] **Step 4: Compute section checkbox states and total sizes**

```typescript
  const groupsCheckboxState = useMemo(() => {
    if (groups.length === 0) return 'empty' as const;
    const selectedCount = groups.filter((g) => selectedIds.has(g.id)).length;
    if (selectedCount === 0) return 'empty' as const;
    if (selectedCount === groups.length) return 'full' as const;
    return 'partial' as const;
  }, [groups, selectedIds]);

  const elementsCheckboxState = useMemo(() => {
    if (filteredElements.length === 0) return 'empty' as const;
    const selectedCount = filteredElements.filter((e) => selectedIds.has(e.id)).length;
    if (selectedCount === 0) return 'empty' as const;
    if (selectedCount === filteredElements.length) return 'full' as const;
    return 'partial' as const;
  }, [filteredElements, selectedIds]);

  const groupsTotalSize = useMemo(
    () => groups.reduce((sum, g) => sum + (g.storage_bytes ?? 0), 0),
    [groups],
  );
  const elementsTotalSize = useMemo(
    () => filteredElements.reduce((sum, e) => sum + (e.file_size ?? 0), 0),
    [filteredElements],
  );
```

- [ ] **Step 5: Replace `handleDragEnd` with three handlers**

Replace the existing `handleDragEnd` (lines 113-136) with:

```typescript
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const parsed = parseDndId(event.active.id);
    if (parsed) setActiveDragItem(parsed);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const overId = event.over?.id;
    setOverDropTarget(overId ? String(overId) : null);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDragItem(null);
      setOverDropTarget(null);

      if (!over || active.id === over.id) return;

      const activeParsed = parseDndId(active.id);
      const overParsed = parseDndId(over.id);
      if (!activeParsed || !overParsed) return;

      const { scene, elements, projectId } = useSceneWorkspaceStore.getState();

      // Case 1: Element reorder (element → element, same container)
      if (activeParsed.type === 'element' && overParsed.type === 'element') {
        if (!scene) return;
        const allElements = elements;
        const oldIndex = allElements.findIndex((e) => e.id === activeParsed.id);
        const newIndex = allElements.findIndex((e) => e.id === overParsed.id);
        if (oldIndex === -1 || newIndex === -1) return;
        const ids = allElements.map((e) => e.id);
        const [movedId] = ids.splice(oldIndex, 1);
        ids.splice(newIndex, 0, movedId);
        try {
          await reorderElements(ids);
        } catch {
          toast.error("Не удалось сохранить порядок");
        }
      }

      // Case 2: Element → Group (cross-container move)
      if (activeParsed.type === 'element' && overParsed.type === 'group') {
        const elementIds = selectedIds.has(activeParsed.id)
          ? Array.from(selectedIds).filter((id) => elements.some((e) => e.id === id))
          : [activeParsed.id];
        try {
          await elementsApi.move({
            element_ids: elementIds,
            target_scene: overParsed.id,
          });
          // Remove moved elements from local state + update group element count
          elementIds.forEach((id) => useSceneWorkspaceStore.getState().removeElement(id));
          useSceneWorkspaceStore.getState().clearSelection();
          // Reload workspace to get updated group stats (element_count, storage_bytes)
          if (projectId) {
            const groupId = scene?.id;
            useSceneWorkspaceStore.getState().loadWorkspace(projectId, groupId);
          }
          toast.success(`Перемещено в группу`);
        } catch {
          toast.error("Не удалось переместить");
        }
      }

      // Case 3: Group reorder (group → group, different positions)
      // Distinguish reorder from nesting: if pointer is within a group card,
      // and the active group IS the one being dropped on, it's reorder.
      // For MVP we only do reorder. Group nesting is via MoveToGroupDialog.
      if (activeParsed.type === 'group' && overParsed.type === 'group' && projectId) {
        const oldIndex = groups.findIndex((g) => g.id === activeParsed.id);
        const newIndex = groups.findIndex((g) => g.id === overParsed.id);
        if (oldIndex === -1 || newIndex === -1) return;
        // Optimistic update via store setState
        const prevGroups = groups;
        const reordered = arrayMove(groups, oldIndex, newIndex);
        useSceneWorkspaceStore.setState({ groups: reordered.map((g, i) => ({ ...g, order_index: i })) });
        const reorderedIds = reordered.map((g) => g.id);
        try {
          await scenesApi.reorder(projectId, { scene_ids: reorderedIds });
        } catch {
          useSceneWorkspaceStore.setState({ groups: prevGroups });
          toast.error("Не удалось изменить порядок групп");
        }
      }

      // NOTE: Group-on-group nesting (drop group INTO another group) is deferred
      // from this task. Users can nest groups via MoveToGroupDialog (existing).
      // TODO: Future task — distinguish reorder vs nesting by drop position
      // (edge = reorder, center = nest) with nesting depth validation (max 2).
    },
    [groups, selectedIds, reorderElements],
  );
```

- [ ] **Step 6: Replace collision detection**

Change `closestCenter` to `pointerWithin` in the `DndContext`:

```tsx
<DndContext
  sensors={sensors}
  collisionDetection={pointerWithin}
  onDragStart={handleDragStart}
  onDragOver={handleDragOver}
  onDragEnd={handleDragEnd}
>
```

- [ ] **Step 7: Restructure JSX — two accordion sections**

Replace the grid rendering JSX with two sections. The groups section renders as a horizontal scrollable row above, elements section below:

```tsx
{/* === Groups Section === */}
{groups.length > 0 && (
  <div className="flex flex-col">
    <SectionHeader
      label="Группы"
      count={groups.length}
      totalSize={groupsTotalSize}
      collapsed={collapsedSections.groups}
      checkboxState={groupsCheckboxState}
      onToggleCollapse={() => toggleSectionCollapse('groups')}
      onToggleSelectAll={() => selectAllInSection('groups')}
    />
    {!collapsedSections.groups && (
      <div className="overflow-x-auto overflow-y-hidden pb-2">
        <SortableContext items={prefixedGroupIds} strategy={rectSortingStrategy}>
          <div className="flex gap-3 pt-2">
            {sortedGroups.map((group) => (
              <SortableGroupCard
                key={toDndId('group', group.id)}
                group={group}
                dndId={toDndId('group', group.id)}
                isSelected={selectedIds.has(group.id)}
                isMultiSelectMode={isMultiSelectMode}
                isDropTarget={overDropTarget === toDndId('group', group.id)}
                onSelect={(id, add) => selectElement(id, add)}
                onClick={onGroupClick ?? (() => {})}
                onDelete={onGroupDelete ?? (() => {})}
                size={preferences.size}
              />
            ))}
          </div>
        </SortableContext>
      </div>
    )}
  </div>
)}

{/* Divider */}
{groups.length > 0 && filteredElements.length > 0 && (
  <div className="h-px bg-border" />
)}

{/* === Elements Section === */}
<div className="flex flex-col">
  <SectionHeader
    label="Элементы"
    count={filteredElements.length}
    totalSize={elementsTotalSize}
    collapsed={collapsedSections.elements}
    checkboxState={elementsCheckboxState}
    onToggleCollapse={() => toggleSectionCollapse('elements')}
    onToggleSelectAll={() => selectAllInSection('elements')}
  />
  {!collapsedSections.elements && (
    <SortableContext items={prefixedElementIds} strategy={rectSortingStrategy}>
      <div className={cn("grid pt-2", gridConfig.gap)} style={gridStyle}>
        {filteredElements.map((element, index) => (
          <SortableElementCard
            key={toDndId('element', element.id)}
            dndId={toDndId('element', element.id)}
            element={element}
            index={index}
            isSelected={effectiveSelectedIds.has(element.id)}
            /* ... rest of existing props ... */
          />
        ))}
      </div>
    </SortableContext>
  )}
</div>

{/* DragOverlay */}
<DragOverlay>
  {activeDragItem && (
    <DragOverlayContent
      type={activeDragItem.type}
      element={activeDragItem.type === 'element'
        ? filteredElements.find((e) => e.id === activeDragItem.id)
        : undefined}
      group={activeDragItem.type === 'group'
        ? groups.find((g) => g.id === activeDragItem.id)
        : undefined}
      additionalCount={
        activeDragItem.type === 'element' && selectedIds.has(activeDragItem.id)
          ? selectedIds.size - 1
          : 0
      }
      size={preferences.size}
      aspectRatio={preferences.aspectRatio}
      fitMode={preferences.fitMode}
    />
  )}
</DragOverlay>
```

- [ ] **Step 8: Create `SortableGroupCard` wrapper**

Add near the existing `SortableElementCard` wrapper:

```typescript
function SortableGroupCard({
  dndId,
  group,
  isSelected,
  isMultiSelectMode,
  isDropTarget,
  onSelect,
  onClick,
  onDelete,
  size,
}: {
  dndId: string;
  group: Scene;
  isSelected: boolean;
  isMultiSelectMode: boolean;
  isDropTarget: boolean;
  onSelect: (id: number, add: boolean) => void;
  onClick: (id: number) => void;
  onDelete: (id: number) => void;
  size: DisplayCardSize;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: dndId });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : undefined,
    flexShrink: 0,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <GroupCard
        group={group}
        isSelected={isSelected}
        isMultiSelectMode={isMultiSelectMode}
        isDropTarget={isDropTarget}
        onSelect={onSelect}
        onClick={onClick}
        onDelete={onDelete}
        size={size}
      />
    </div>
  );
}
```

- [ ] **Step 9: Update `SortableElementCard` to use prefixed ID**

Change the existing `SortableElementCard` to accept and use a `dndId` prop:

```typescript
// Add dndId prop
interface SortableElementCardWrapperProps extends ElementCardProps {
  dndId: string;
}

// Inside the wrapper, use dndId for useSortable:
const { ... } = useSortable({ id: dndId });

// Ghost style when dragging:
opacity: isDragging ? 0.3 : undefined,
```

- [ ] **Step 10: Verify build**

Run: `docker compose exec frontend npm run build`
Expected: Build succeeds.

- [ ] **Step 11: Commit**

```bash
git add frontend/components/element/ElementGrid.tsx
git commit -m "feat(grid): refactor ElementGrid with accordion sections and cross-container DnD"
```

---

### Task 7: WorkspaceContainer — Remove Inline Groups

**Files:**
- Modify: `frontend/components/element/WorkspaceContainer.tsx:740-748`

- [ ] **Step 1: Verify groups are already passed as prop**

The current code (line ~740) already passes `groups` to `ElementGrid`:

```tsx
<ElementGrid
  onRequestDelete={openDeleteDialog}
  groups={groups}
  onGroupClick={handleGroupClick}
  onGroupDelete={handleRequestGroupDelete}
  ...
/>
```

No changes needed here if groups rendering was fully moved to ElementGrid in Task 6. Verify by checking that `ElementGrid` handles all group rendering internally.

- [ ] **Step 2: Verify build**

Run: `docker compose exec frontend npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit (only if changes were needed)**

```bash
git add frontend/components/element/WorkspaceContainer.tsx
git commit -m "refactor(grid): clean up WorkspaceContainer groups delegation"
```

---

### Task 8: LightboxModal — Visible Elements Navigation

**Files:**
- Modify: `frontend/components/lightbox/LightboxModal.tsx`

- [ ] **Step 1: Check how elements are passed to LightboxModal**

Read where `LightboxModal` is used in `WorkspaceContainer.tsx` — it receives `elements` as a prop. The change should be at the call site, not inside LightboxModal.

- [ ] **Step 2: Update the elements prop at the call site**

In `WorkspaceContainer.tsx`, where `LightboxModal` receives elements, change to use `getVisibleElementsForLightbox()`:

```typescript
// Where lightbox elements are computed:
const lightboxElements = useSceneWorkspaceStore((s) => s.getVisibleElementsForLightbox());
```

Pass `lightboxElements` instead of `getFilteredElements()` to `LightboxModal`.

- [ ] **Step 3: Verify build**

Run: `docker compose exec frontend npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/element/WorkspaceContainer.tsx frontend/components/lightbox/LightboxModal.tsx
git commit -m "feat(grid): lightbox skips elements in collapsed sections"
```

---

### Task 9: Integration Testing and Edge Cases

**Files:** All modified files

- [ ] **Step 1: Full build verification**

Run: `docker compose exec frontend npm run build`
Expected: Build succeeds with no errors or warnings.

- [ ] **Step 2: Manual verification checklist**

Start the dev environment: `docker compose up`

Test in browser at `http://localhost:3000`:

1. Navigate to a project with groups and elements
2. **Accordion collapse**: Click chevron on "Группы" header — groups should hide, chevron rotates right
3. **Accordion collapse**: Click chevron on "Элементы" header — elements should hide
4. **Section checkbox**: Click checkbox on "Группы" header — all groups selected
5. **Section checkbox**: Click checkbox on "Элементы" header — all filtered elements selected
6. **Partial checkbox**: Select 1 element manually, verify elements header shows "—" (partial)
7. **Drag element to group**: Drag an element card onto a group card — should show purple border highlight, then move element
8. **Multi-drag**: Select 3 elements, drag one — all 3 should move, overlay shows "+2" badge
9. **Group reorder**: Drag a group card to a different position in the groups row
10. **Ghost state**: While dragging, source card shows opacity 0.3
11. **0 groups**: Navigate to a project with no groups — groups section should be hidden entirely
12. **Filter + select**: Set filter to "Изображения", click elements header checkbox — only images selected
13. **Collapsed + lightbox**: Collapse elements, open lightbox from somewhere — should be empty / not navigate to hidden elements
14. **Refresh persistence**: Collapse a section, refresh page — section should remain collapsed

- [ ] **Step 3: Fix any issues found**

Address any visual or functional issues discovered during manual testing.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix(grid): address integration issues from manual testing"
```

---

## Summary

| Task | Description | Files | Depends On |
|------|-------------|-------|-----------|
| 1 | Types and DnD utilities | types, utils/dnd, constants | — |
| 2 | Store: collapsed sections, section select | scene-workspace.ts | 1 |
| 3 | SectionHeader component | SectionHeader.tsx | — |
| 4 | DragOverlayContent component | DragOverlayContent.tsx | 1 |
| 5 | GroupCard: badge + drop target | GroupCard.tsx | 1 |
| 6 | ElementGrid: accordion + DnD refactor | ElementGrid.tsx | 1,2,3,4,5 |
| 7 | WorkspaceContainer cleanup | WorkspaceContainer.tsx | 6 |
| 8 | Lightbox: visible elements nav | LightboxModal.tsx | 2 |
| 9 | Integration testing | All | 6,7,8 |

**Parallelizable:** Tasks 1, 3, 4 can run in parallel. Tasks 2, 5 depend only on 1. Task 6 is the critical path — it depends on 1-5.
