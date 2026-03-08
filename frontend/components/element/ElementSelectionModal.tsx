"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ElementSelectionGrid } from "./ElementSelectionGrid";
import { useSceneWorkspaceStore } from "@/lib/store/scene-workspace";
import { toast } from "sonner";
import type { Element, ElementType } from "@/lib/types";

export interface ElementSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedElements: Element[]) => void;
  max: number;
  min?: number;
  initialSelection?: number[];
  elementTypeFilter?: ElementType;
  title?: string;
}

export function ElementSelectionModal({
  isOpen,
  onClose,
  onConfirm,
  max,
  min = 1,
  initialSelection = [],
  elementTypeFilter = "IMAGE",
  title,
}: ElementSelectionModalProps) {
  // Read elements from store
  const storeElements = useSceneWorkspaceStore((state) => state.elements);

  // Local selection state (ephemeral, exists only while modal is open)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Local filter for favorites
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  // Initialize selection when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set(initialSelection));
      setFavoritesOnly(false);
    }
  }, [isOpen, initialSelection]);

  // Filter elements: COMPLETED status + type filter + favorites filter
  const filteredElements = useMemo(() => {
    return storeElements.filter((element) => {
      // Only COMPLETED elements can be selected
      if (element.status !== "COMPLETED") return false;

      // Filter by type
      if (element.element_type !== elementTypeFilter) return false;

      // Filter by favorites if enabled
      if (favoritesOnly && !element.is_favorite) return false;

      return true;
    });
  }, [storeElements, elementTypeFilter, favoritesOnly]);

  // Toggle selection handler
  const handleToggle = useCallback(
    (elementId: number) => {
      setSelectedIds((prev) => {
        const newSet = new Set(prev);

        if (newSet.has(elementId)) {
          // Deselect
          newSet.delete(elementId);
        } else {
          // Select
          if (max === 1) {
            // Single selection: replace
            newSet.clear();
            newSet.add(elementId);
          } else if (prev.size < max) {
            // Multi selection: add if under limit
            newSet.add(elementId);
          } else {
            // Max reached: show toast and don't add
            toast.warning(`Максимум ${max} элементов`);
          }
        }

        return newSet;
      });
    },
    [max]
  );

  // Check if max reached (for disabling unselected cards)
  const maxReached = selectedIds.size >= max;

  // Get selected elements for return value
  const selectedElements = useMemo(() => {
    return storeElements.filter((e) => selectedIds.has(e.id));
  }, [storeElements, selectedIds]);

  // Handle confirm
  const handleConfirm = useCallback(() => {
    if (selectedIds.size < min) return;
    onConfirm(selectedElements);
    onClose();
  }, [selectedIds, min, selectedElements, onConfirm, onClose]);

  // Handle close without confirm
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Determine title
  const modalTitle = useMemo(() => {
    if (title) return title;
    return max === 1 ? "Выбор элемента" : "Выбор элементов";
  }, [title, max]);

  // Check if selection is valid (min reached)
  const isValidSelection = selectedIds.size >= min;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-5xl p-0 gap-0 overflow-hidden">
        {/* Header with title and favorites toggle */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle>{modalTitle}</DialogTitle>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                Только избранные
              </span>
              <Switch
                checked={favoritesOnly}
                onCheckedChange={setFavoritesOnly}
                aria-label="Только избранные"
              />
            </div>
          </div>
        </DialogHeader>

        {/* Grid with elements */}
        <div className="px-6 py-4">
          <ElementSelectionGrid
            elements={filteredElements}
            selectedIds={selectedIds}
            onToggle={handleToggle}
            maxReached={maxReached}
          />
        </div>

        {/* Footer with counter and buttons */}
        <DialogFooter className="px-6 py-4 border-t flex items-center justify-between sm:justify-between">
          <span className="text-sm text-muted-foreground">
            Выбрано: {selectedIds.size} из {max}
            {min > 0 && selectedIds.size < min && (
              <span className="text-destructive ml-2">(минимум {min})</span>
            )}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={handleClose}>
              Отмена
            </Button>
            <Button onClick={handleConfirm} disabled={!isValidSelection}>
              Готово
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
