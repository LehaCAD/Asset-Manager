"use client";

import { useMemo, useEffect, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useSceneWorkspaceStore } from "@/lib/store/scene-workspace";
import { useDisplayStore } from "@/lib/store/project-display";
import { useGenerationStore } from "@/lib/store/generation";
import { ElementCard, type ElementCardProps } from "@/components/element/ElementCard";
import { ElementCardSkeleton } from "@/components/element/ElementCardSkeleton";
import { GroupCard } from "@/components/element/GroupCard";
import { cn } from "@/lib/utils";
import { DISPLAY_GRID_CONFIG, CARD_SIZES } from "@/lib/utils/constants";
import type { DisplayCardSize, DisplayAspectRatio, Scene } from "@/lib/types";
import { toast } from "sonner";

// Helper для получения минимальной ширины карточки
function getMinCardWidth(size: DisplayCardSize, aspectRatio: DisplayAspectRatio): number {
  return CARD_SIZES[size][aspectRatio].width;
}

// Sortable wrapper for ElementCard
function SortableElementCard(props: ElementCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.element.id });

  const style: React.CSSProperties = {
    ...props.style,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} {...attributes} {...listeners}>
      <ElementCard {...props} style={style} />
    </div>
  );
}

interface ElementGridProps {
  className?: string;
  onRequestDelete: (ids: number[]) => void;
  groups?: Scene[];
  onGroupClick?: (id: number) => void;
  onGroupDelete?: (id: number) => void;
}

export function ElementGrid({ className, onRequestDelete, groups = [], onGroupClick, onGroupDelete }: ElementGridProps) {
  const {
    getFilteredElements,
    selectedIds,
    isMultiSelectMode,
    isLoading,
    // actions
    selectElement,
    openLightbox,
    toggleFavorite,
    reorderElements,
  } = useSceneWorkspaceStore();

  const { preferences, hydratePreferences } = useDisplayStore();

  const retryFromElement = useGenerationStore((s) => s.retryFromElement);

  // Hydrate display preferences on mount
  useEffect(() => {
    hydratePreferences();
  }, [hydratePreferences]);

  const filteredElements = getFilteredElements();

  // Get display configuration в зависимости от size И aspect ratio
  const gridConfig = DISPLAY_GRID_CONFIG[preferences.size][preferences.aspectRatio];
  const cardSize = preferences.size;

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Element IDs for sortable context
  const elementIds = useMemo(
    () => filteredElements.map((e) => e.id),
    [filteredElements],
  );

  // Handle drag end — reorder elements
  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const allElements = useSceneWorkspaceStore.getState().elements;
      const oldIndex = allElements.findIndex((e) => e.id === active.id);
      const newIndex = allElements.findIndex((e) => e.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      // Build new order: move active element to new position
      const ids = allElements.map((e) => e.id);
      const [movedId] = ids.splice(oldIndex, 1);
      ids.splice(newIndex, 0, movedId);

      try {
        await reorderElements(ids);
      } catch {
        toast.error("Не удалось сохранить порядок");
      }
    },
    [reorderElements],
  );

  // Card callbacks
  const cardCallbacks = useMemo(
    () => ({
      onSelect: selectElement,
      onOpenLightbox: openLightbox,
      onToggleFavorite: toggleFavorite,
      onDelete: (id: number) => onRequestDelete([id]),
      onRetry: (id: number) => {
        const element = getFilteredElements().find((e) => e.id === id);
        if (element) retryFromElement(element);
      },
    }),
    [selectElement, openLightbox, toggleFavorite, onRequestDelete, retryFromElement, getFilteredElements]
  );

  // Sorted groups
  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.order_index - b.order_index),
    [groups]
  );

  // Loading state
  if (isLoading) {
    return (
      <div className={cn("element-grid", className)}>
        <div
          className={cn("grid", gridConfig.gap)}
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${getMinCardWidth(preferences.size, preferences.aspectRatio)}px, 1fr))` }}
        >
          {Array.from({ length: 12 }).map((_, i) => (
            <ElementCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  // Empty state is now handled by WorkspaceContainer
  if (filteredElements.length === 0 && sortedGroups.length === 0) {
    return (
      <div className={cn("element-grid", className)}>
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <p>Нет элементов, соответствующих фильтру</p>
        </div>
      </div>
    );
  }

  const gridStyle = { gridTemplateColumns: `repeat(auto-fill, minmax(${getMinCardWidth(preferences.size, preferences.aspectRatio)}px, 1fr))` };

  return (
    <div className={cn("element-grid", className)}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className={cn("grid", gridConfig.gap)} style={gridStyle}>
          {/* Groups rendered inline, before elements — NOT sortable */}
          {sortedGroups.map((group) => (
            <GroupCard
              key={`group-${group.id}`}
              group={group}
              isSelected={selectedIds.has(group.id)}
              isMultiSelectMode={isMultiSelectMode}
              onSelect={(id, add) => {
                useSceneWorkspaceStore.getState().selectElement(id, add);
              }}
              onClick={onGroupClick ?? (() => {})}
              onDelete={onGroupDelete ?? (() => {})}
              size={preferences.size}
              aspectRatio={preferences.aspectRatio}
              fitMode={preferences.fitMode}
            />
          ))}
          {/* Element cards — sortable */}
          <SortableContext items={elementIds} strategy={rectSortingStrategy}>
            {filteredElements.map((element, index) => (
              <SortableElementCard
                key={element.id}
                element={element}
                index={index}
                size={cardSize}
                aspectRatio={preferences.aspectRatio}
                fitMode={preferences.fitMode}
                isSelected={selectedIds.has(element.id)}
                isMultiSelectMode={isMultiSelectMode}
                {...cardCallbacks}
              />
            ))}
          </SortableContext>
        </div>
      </DndContext>
    </div>
  );
}
