"use client";

import { useCallback, useMemo, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useSceneWorkspaceStore } from "@/lib/store/scene-workspace";
import { useDisplayStore } from "@/lib/store/project-display";
import { ElementCard } from "@/components/element/ElementCard";
import { ElementCardSkeleton } from "@/components/element/ElementCardSkeleton";
import { cn } from "@/lib/utils";
import { DISPLAY_GRID_CONFIG, ASPECT_RATIO_CLASSES, CARD_SIZES } from "@/lib/utils/constants";
import type { DisplayCardSize, DisplayAspectRatio } from "@/lib/types";

// Helper для получения минимальной ширины карточки
function getMinCardWidth(size: DisplayCardSize, aspectRatio: DisplayAspectRatio): number {
  return CARD_SIZES[size][aspectRatio].width;
}
import type { Element } from "@/lib/types";

interface ElementGridProps {
  className?: string;
  onRequestDelete: (ids: number[]) => void;
}

interface SortableElementCardProps {
  element: Element;
  index: number;
  isSelected: boolean;
  isMultiSelectMode: boolean;
  size: import("@/lib/types").DisplayCardSize;
  onSelect: (id: number, addToSelection: boolean) => void;
  onOpenLightbox: (id: number) => void;
  onToggleFavorite: (id: number) => void;
  onDelete: (id: number) => void;
}

function SortableElementCard({
  element,
  index,
  size,
  ...cardProps
}: SortableElementCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: element.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const { preferences } = useDisplayStore();

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <ElementCard 
        element={element} 
        index={index} 
        size={size}
        aspectRatio={preferences.aspectRatio}
        fitMode={preferences.fitMode}
        {...cardProps} 
      />
    </div>
  );
}

export function ElementGrid({ className, onRequestDelete }: ElementGridProps) {
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

  // Hydrate display preferences on mount
  useEffect(() => {
    hydratePreferences();
  }, [hydratePreferences]);

  const filteredElements = getFilteredElements();

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  // Handle drag end
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = filteredElements.findIndex((e) => e.id === active.id);
      const newIndex = filteredElements.findIndex((e) => e.id === over.id);

      if (oldIndex === -1 || newIndex === -1) return;

      // Build new order
      const newElements = [...filteredElements];
      const [moved] = newElements.splice(oldIndex, 1);
      newElements.splice(newIndex, 0, moved);

      reorderElements(newElements.map((e) => e.id));
    },
    [filteredElements, reorderElements]
  );

  // Get display configuration в зависимости от size И aspect ratio
  const gridConfig = DISPLAY_GRID_CONFIG[preferences.size][preferences.aspectRatio];
  const aspectClass = ASPECT_RATIO_CLASSES[preferences.aspectRatio];
  const cardSize = preferences.size;

  // Card callbacks
  const cardCallbacks = useMemo(
    () => ({
      onSelect: selectElement,
      onOpenLightbox: openLightbox,
      onToggleFavorite: toggleFavorite,
      onDelete: (id: number) => onRequestDelete([id]),
    }),
    [selectElement, openLightbox, toggleFavorite, onRequestDelete]
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

  // Empty state is now handled by SceneWorkspace
  if (filteredElements.length === 0) {
    return (
      <div className={cn("element-grid", className)}>
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <p>Нет элементов, соответствующих фильтру</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("element-grid", className)}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={filteredElements.map((e) => e.id)}
          strategy={rectSortingStrategy}
          disabled={isMultiSelectMode}
        >
          <div 
            className={cn("grid", gridConfig.gap)}
            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${getMinCardWidth(preferences.size, preferences.aspectRatio)}px, 1fr))` }}
          >
            {filteredElements.map((element, index) => (
              <SortableElementCard
                key={element.id}
                element={element}
                index={index}
                isSelected={selectedIds.has(element.id)}
                isMultiSelectMode={isMultiSelectMode}
                size={cardSize}
                {...cardCallbacks}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
