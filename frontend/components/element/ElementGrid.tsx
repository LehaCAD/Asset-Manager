"use client";

import { useCallback, useMemo } from "react";
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
import { ElementCard } from "@/components/element/ElementCard";
import { ElementCardSkeleton } from "@/components/element/ElementCardSkeleton";
import { cn } from "@/lib/utils";
import { GRID_DENSITY_CONFIG } from "@/lib/utils/constants";
import type { Element, GridDensity } from "@/lib/types";

interface ElementGridProps {
  className?: string;
  onRequestDelete: (ids: number[]) => void;
}

interface SortableElementCardProps {
  element: Element;
  index: number;
  density: GridDensity;
  isSelected: boolean;
  isMultiSelectMode: boolean;
  onSelect: (id: number, addToSelection: boolean) => void;
  onOpenLightbox: (id: number) => void;
  onToggleFavorite: (id: number) => void;
  onDelete: (id: number) => void;
}

function SortableElementCard({
  element,
  index,
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

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <ElementCard element={element} index={index} {...cardProps} />
    </div>
  );
}

export function ElementGrid({ className, onRequestDelete }: ElementGridProps) {
  const {
    getFilteredElements,
    selectedIds,
    isMultiSelectMode,
    isLoading,
    density,
    // actions
    selectElement,
    openLightbox,
    toggleFavorite,
    reorderElements,
  } = useSceneWorkspaceStore();

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
      <div
        className={cn("element-grid", className)}
        style={{
          "--card-min-size": GRID_DENSITY_CONFIG[density].minSize,
          "--grid-gap": GRID_DENSITY_CONFIG[density].gap,
        } as React.CSSProperties}
      >
        <div
          className="grid"
          style={{
            gridTemplateColumns:
              "repeat(auto-fill, minmax(var(--card-min-size), 1fr))",
            gap: "var(--grid-gap)",
          }}
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
    <div
      className={cn("element-grid", className)}
      style={{
        "--card-min-size": GRID_DENSITY_CONFIG[density].minSize,
        "--grid-gap": GRID_DENSITY_CONFIG[density].gap,
      } as React.CSSProperties}
    >
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
            className="grid"
            style={{
              gridTemplateColumns:
                "repeat(auto-fill, minmax(var(--card-min-size), 1fr))",
              gap: "var(--grid-gap)",
            }}
          >
            {filteredElements.map((element, index) => (
              <SortableElementCard
                key={element.id}
                element={element}
                index={index}
                density={density}
                isSelected={selectedIds.has(element.id)}
                isMultiSelectMode={isMultiSelectMode}
                {...cardCallbacks}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
