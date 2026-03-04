"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSceneWorkspaceStore } from "@/lib/store/scene-workspace";
import { wsManager } from "@/lib/api/websocket";
import { ElementGrid } from "@/components/element/ElementGrid";
import { ElementFilters } from "@/components/element/ElementFilters";
import { ElementBulkBar } from "@/components/element/ElementBulkBar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { WSEvent } from "@/lib/types";

interface SceneWorkspaceProps {
  projectId: number;
  sceneId: number;
}

// Russian pluralization helper
function pluralizeElements(count: number): string {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return "элементов";
  }

  if (lastDigit === 1) {
    return "элемент";
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return "элемента";
  }

  return "элементов";
}

export function SceneWorkspace({ projectId, sceneId }: SceneWorkspaceProps) {
  const {
    scene,
    elements,
    filter,
    density,
    selectedIds,
    isLoading,
    loadScene,
    setFilter,
    setDensity,
    hydrateDensityPreference,
    deleteElements,
    clearSelection,
    toggleSelectAll,
    updateElement,
  } = useSceneWorkspaceStore();
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<number[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const fallbackRefetchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const disconnectDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetWorkspace = useSceneWorkspaceStore((s) => s.resetWorkspace);

  useEffect(() => {
    loadScene(sceneId);
    return () => {
      resetWorkspace();
    };
  }, [sceneId, loadScene, resetWorkspace]);

  useEffect(() => {
    hydrateDensityPreference();
  }, [hydrateDensityPreference]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    wsManager.connect(projectId);

    const hasPendingOrProcessingElements = () =>
      useSceneWorkspaceStore
        .getState()
        .elements.some((element) => element.status === "PENDING" || element.status === "PROCESSING");

    const stopFallbackRefetch = () => {
      if (disconnectDebounceTimerRef.current) {
        clearTimeout(disconnectDebounceTimerRef.current);
        disconnectDebounceTimerRef.current = null;
      }
      if (fallbackRefetchIntervalRef.current) {
        clearInterval(fallbackRefetchIntervalRef.current);
        fallbackRefetchIntervalRef.current = null;
      }
    };

    const tryFallbackRefetch = () => {
      if (!wsManager.isConnected && hasPendingOrProcessingElements()) {
        useSceneWorkspaceStore.getState().loadScene(sceneId);
      } else if (!hasPendingOrProcessingElements()) {
        stopFallbackRefetch();
      }
    };

    const unsubscribe = wsManager.on((event: WSEvent) => {
      if (event.type === "element_status_changed") {
        if (event.status === "COMPLETED") {
          const completedUpdates: Partial<{
            status: "COMPLETED";
            file_url: string;
            thumbnail_url: string;
          }> = {
            status: "COMPLETED",
          };
          if (typeof event.file_url === "string" && event.file_url.length > 0) {
            completedUpdates.file_url = event.file_url;
          }
          if (
            typeof event.thumbnail_url === "string" &&
            event.thumbnail_url.length > 0
          ) {
            completedUpdates.thumbnail_url = event.thumbnail_url;
          }
          updateElement(event.element_id, completedUpdates);
        } else if (event.status === "FAILED") {
          updateElement(event.element_id, {
            status: "FAILED",
            error_message: event.error_message ?? "",
          });
        } else {
          updateElement(event.element_id, { status: event.status });
        }
      }
    });
    const unsubscribeConnect = wsManager.onConnect(() => {
      stopFallbackRefetch();
    });
    const unsubscribeDisconnect = wsManager.onDisconnect(() => {
      if (disconnectDebounceTimerRef.current) {
        clearTimeout(disconnectDebounceTimerRef.current);
      }
      disconnectDebounceTimerRef.current = setTimeout(() => {
        tryFallbackRefetch();
      }, 1500);
    });
    const unsubscribeReconnectExhausted = wsManager.onReconnectExhausted(() => {
      toast.warning("Соединение нестабильно, обновляю статусы в фоновом режиме");
      tryFallbackRefetch();
      if (!fallbackRefetchIntervalRef.current) {
        fallbackRefetchIntervalRef.current = setInterval(tryFallbackRefetch, 8000);
      }
    });

    return () => {
      stopFallbackRefetch();
      unsubscribe();
      unsubscribeConnect();
      unsubscribeDisconnect();
      unsubscribeReconnectExhausted();
      wsManager.disconnect();
    };
  }, [projectId, sceneId, updateElement]);

  // Calculate filter counts
  const filterCounts = useMemo(() => {
    return {
      all: elements.length,
      favorites: elements.filter((e) => e.is_favorite).length,
      images: elements.filter((e) => e.element_type === "IMAGE").length,
      videos: elements.filter((e) => e.element_type === "VIDEO").length,
    };
  }, [elements]);

  // Element count label with Russian pluralization
  const elementsCountLabel = pluralizeElements(elements.length);
  const isGroupDelete = confirmDeleteIds.length > 1;

  const openDeleteDialog = (ids: number[]) => {
    if (ids.length === 0) return;
    setConfirmDeleteIds(ids);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (confirmDeleteIds.length === 0) return;
    const idsToDelete = confirmDeleteIds;
    const deletingToastId = toast.loading(
      idsToDelete.length > 1
        ? `Удаление ${idsToDelete.length} элементов...`
        : "Удаление элемента..."
    );

    setDeleteDialogOpen(false);
    setConfirmDeleteIds([]);
    try {
      await deleteElements(idsToDelete);
      clearSelection();
    } finally {
      toast.dismiss(deletingToastId);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header: scene name + element count */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold">
            {isLoading ? "Загрузка..." : scene?.name ?? "Сцена"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {elements.length} {elementsCountLabel}
          </p>
        </div>
      </div>

      {/* Filters toolbar */}
      <div className="border-b px-4 py-2">
        <ElementFilters
          filter={filter}
          onFilterChange={setFilter}
          density={density}
          onDensityChange={setDensity}
          counts={filterCounts}
        />
      </div>

      {/* Grid area - scrollable */}
      <div className="relative flex-1 overflow-auto p-4">
        <ElementGrid onRequestDelete={openDeleteDialog} />
      </div>

      {/* Bulk actions bar - shown when items selected */}
      <ElementBulkBar
        selectedCount={selectedIds.size}
        totalCount={elements.length}
        onDeleteSelected={() => openDeleteDialog(Array.from(selectedIds))}
        onClearSelection={clearSelection}
        onToggleSelectAll={toggleSelectAll}
      />

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {isGroupDelete ? "Удалить выбранные элементы?" : "Удалить элемент?"}
            </DialogTitle>
            <DialogDescription>
              {isGroupDelete
                ? `Будет удалено ${confirmDeleteIds.length} элементов. Это действие нельзя отменить.`
                : "Элемент будет удалён безвозвратно."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
            >
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
