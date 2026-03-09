"use client";

import { useEffect } from "react";
import { ElementSelectionCard } from "./ElementSelectionCard";
import { useDisplayStore } from "@/lib/store/project-display";
import { DISPLAY_GRID_CONFIG, ASPECT_RATIO_CLASSES, FIT_MODE_CLASSES, CARD_SIZES } from "@/lib/utils/constants";
import type { DisplayCardSize, DisplayAspectRatio } from "@/lib/types";

// Helper для получения минимальной ширины карточки
function getMinCardWidth(size: DisplayCardSize, aspectRatio: DisplayAspectRatio): number {
  return CARD_SIZES[size][aspectRatio].width;
}
import { cn } from "@/lib/utils";
import { ImageOff } from "lucide-react";
import type { Element } from "@/lib/types";

export interface ElementSelectionGridProps {
  elements: Element[];
  selectedIds: Set<number>;
  onToggle: (elementId: number) => void;
  maxReached: boolean;
}

export function ElementSelectionGrid({
  elements,
  selectedIds,
  onToggle,
  maxReached,
}: ElementSelectionGridProps) {
  const { preferences, hydratePreferences } = useDisplayStore();
  
  // Get grid config в зависимости от size И aspect ratio
  const gridConfig = DISPLAY_GRID_CONFIG[preferences.size][preferences.aspectRatio];
  const aspectClass = ASPECT_RATIO_CLASSES[preferences.aspectRatio];

  // Hydrate preferences on mount
  useEffect(() => {
    hydratePreferences();
  }, [hydratePreferences]);

  // Empty state
  if (elements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <ImageOff className="w-16 h-16 mb-4 opacity-40" />
        <p className="text-lg font-medium">Нет подходящих элементов</p>
        <p className="text-sm">Попробуйте изменить фильтры</p>
      </div>
    );
  }

  const fitMode = preferences.fitMode;

  return (
    <div 
      className={cn("grid", gridConfig.gap, "p-1")}
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${getMinCardWidth(preferences.size, preferences.aspectRatio)}px, 1fr))` }}
    >
      {elements.map((element) => {
        const isSelected = selectedIds.has(element.id);
        const disabled = maxReached && !isSelected;

        return (
          <ElementSelectionCard
            key={element.id}
            element={element}
            isSelected={isSelected}
            disabled={disabled}
            onClick={() => onToggle(element.id)}
            aspectClass={aspectClass}
            fitMode={fitMode}
          />
        );
      })}
    </div>
  );
}
