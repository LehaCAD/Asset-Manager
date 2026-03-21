"use client";

import { useMemo, useEffect } from "react";
import { useSceneWorkspaceStore } from "@/lib/store/scene-workspace";
import { useDisplayStore } from "@/lib/store/project-display";
import { ElementCard } from "@/components/element/ElementCard";
import { ElementCardSkeleton } from "@/components/element/ElementCardSkeleton";
import { GroupCard } from "@/components/element/GroupCard";
import { cn } from "@/lib/utils";
import { DISPLAY_GRID_CONFIG, CARD_SIZES } from "@/lib/utils/constants";
import type { DisplayCardSize, DisplayAspectRatio, Scene } from "@/lib/types";

// Helper для получения минимальной ширины карточки
function getMinCardWidth(size: DisplayCardSize, aspectRatio: DisplayAspectRatio): number {
  return CARD_SIZES[size][aspectRatio].width;
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
  } = useSceneWorkspaceStore();

  const { preferences, hydratePreferences } = useDisplayStore();

  // Hydrate display preferences on mount
  useEffect(() => {
    hydratePreferences();
  }, [hydratePreferences]);

  const filteredElements = getFilteredElements();

  // Get display configuration в зависимости от size И aspect ratio
  const gridConfig = DISPLAY_GRID_CONFIG[preferences.size][preferences.aspectRatio];
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

  return (
    <div className={cn("element-grid", className)}>
      <div
        className={cn("grid", gridConfig.gap)}
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${getMinCardWidth(preferences.size, preferences.aspectRatio)}px, 1fr))` }}
      >
        {/* Groups rendered inline, before elements */}
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
        {/* Element cards */}
        {filteredElements.map((element, index) => (
          <ElementCard
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
      </div>
    </div>
  );
}
