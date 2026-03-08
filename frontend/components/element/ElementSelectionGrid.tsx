"use client";

import { ElementSelectionCard } from "./ElementSelectionCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GRID_DENSITY_CONFIG } from "@/lib/utils/constants";
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
  // Fixed density "md" for modal (predictable, consistent experience)
  const density = "md";
  const config = GRID_DENSITY_CONFIG[density];

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

  return (
    <ScrollArea className="h-[60vh]">
      <div
        className="p-1"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(auto-fill, minmax(${config.minSize}, 1fr))`,
          gap: config.gap,
        }}
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
            />
          );
        })}
      </div>
    </ScrollArea>
  );
}
