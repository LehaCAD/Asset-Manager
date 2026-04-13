/**
 * @deprecated Use WorkspaceContainer instead. This component is kept temporarily
 * for backward compatibility with old routes that reference it directly.
 * See WorkspaceContainer.tsx for the unified workspace that supports both
 * project root and group views with mixed grid (groups + elements).
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useSceneWorkspaceStore } from "@/lib/store/scene-workspace";
import { useCreditsStore } from "@/lib/store/credits";
import { useGenerationStore } from "@/lib/store/generation";
import { useUIStore } from "@/lib/store/ui";
import { wsManager } from "@/lib/api/websocket";
import { ElementGrid } from "@/components/element/ElementGrid";
import { ElementFilters } from "@/components/element/ElementFilters";
import { ElementBulkBar } from "@/components/element/ElementBulkBar";
import { ConfigPanel } from "@/components/generation/ConfigPanel";
import { PromptBar } from "@/components/generation/PromptBar";
import { EmptyState } from "@/components/element/EmptyState";
import { DisplaySettingsPopover } from "@/components/display/DisplaySettingsPopover";
import { LightboxModal } from "@/components/lightbox/LightboxModal";
import { DetailPanel } from "@/components/lightbox/DetailPanel";
import { useKeyboard } from "@/lib/hooks/use-keyboard";
import { Upload } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { MAX_FILE_SIZE_MB } from "@/lib/utils/constants";
import type { WSEvent } from "@/lib/types";

interface SceneWorkspaceProps {
  projectId: number;
  sceneId: number;
}

export function SceneWorkspace({ projectId, sceneId }: SceneWorkspaceProps) {
  const {
    elements,
    filter,
    selectedIds,
    loadScene,
    setFilter,
    clearSelection,
    toggleSelectAll,
    getFilteredElements,
    updateElement,
    enqueueUploads,
    scene,
    lightboxOpen,
    lightboxElementId,
  } = useSceneWorkspaceStore();

  const { loadModels } = useGenerationStore();

  const [confirmDeleteIds, setConfirmDeleteIds] = useState<number[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [nextElementIdAfterDelete, setNextElementIdAfterDelete] = useState<number | null>(null);
  const fallbackRefetchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const disconnectDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetWorkspace = useSceneWorkspaceStore((s) => s.resetWorkspace);
  const deleteElements = useSceneWorkspaceStore((s) => s.deleteElements);
  const openLightbox = useSceneWorkspaceStore((s) => s.openLightbox);
  const closeLightbox = useSceneWorkspaceStore((s) => s.closeLightbox);
  const navigateLightbox = useSceneWorkspaceStore((s) => s.navigateLightbox);
  const toggleFavorite = useSceneWorkspaceStore((s) => s.toggleFavorite);
  const setHeadliner = useSceneWorkspaceStore((s) => s.setHeadliner);
  const deleteElement = useSceneWorkspaceStore((s) => s.deleteElement);

  // Load scene data
  useEffect(() => {
    loadScene(sceneId);
    return () => {
      resetWorkspace();
    };
  }, [sceneId, loadScene, resetWorkspace]);

  // Load models for generation
  useEffect(() => {
    loadModels();
  }, [loadModels]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    wsManager.connect(projectId);

    const hasPendingOrProcessingElements = () =>
      useSceneWorkspaceStore
        .getState()
        .elements.some((element) => element.status === "PENDING" || element.status === "PROCESSING");

    // Для optimistic generation: проверяем есть ли элементы в submitting состоянии
    const hasSubmittingGenerationElements = () =>
      useSceneWorkspaceStore
        .getState()
        .elements.some(
          (element) =>
            element.client_optimistic_kind === "generation" &&
            element.client_generation_submit_state === "submitting"
        );

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
      const hasPendingElements = hasPendingOrProcessingElements() || hasSubmittingGenerationElements();
      if (!wsManager.isConnected && hasPendingElements) {
        useSceneWorkspaceStore.getState().loadScene(sceneId);
      } else if (!hasPendingElements) {
        stopFallbackRefetch();
      }
    };

    const unsubscribe = wsManager.on((event: WSEvent) => {
      if (event.type === "element_status_changed") {
        if (event.status === "COMPLETED") {
          updateElement(event.element_id, {
            status: "COMPLETED",
            ...(event.file_url && { file_url: event.file_url }),
            ...(event.thumbnail_url && { thumbnail_url: event.thumbnail_url }),
            ...(event.preview_url && { preview_url: event.preview_url }),
          });
        } else if (event.status === "FAILED") {
          const err = (event.error_message ?? "").toLowerCase();
          const isCreditsError =
            err.includes("credits") || err.includes("недостаточно средств");
          if (isCreditsError) {
            toast.error("Недостаточно средств для генерации. Карточка удалена.");
            void deleteElement(event.element_id, { silent: true });
            void useCreditsStore.getState().loadBalance();
          } else {
            updateElement(event.element_id, {
              status: "FAILED",
              error_message: event.error_message ?? "",
            });
            void useCreditsStore.getState().loadBalance();
          }
        } else {
          updateElement(event.element_id, {
            status: event.status,
            ...(event.file_url && { file_url: event.file_url }),
            ...(event.thumbnail_url && { thumbnail_url: event.thumbnail_url }),
            ...(event.preview_url && { preview_url: event.preview_url }),
          });
        }
      } else if (event.type === 'new_comment') {
        if (event.element_id) {
          useSceneWorkspaceStore.getState().incrementCommentCount(event.element_id);
        }
        toast.info(`Новый комментарий от ${event.author_name}`);
      } else if (event.type === 'reaction_updated') {
        // Реакции не хранятся в WorkspaceElement напрямую
      } else if (event.type === 'review_updated') {
        if (event.element_id) {
          updateElement(event.element_id, {
            review_summary: event.action
              ? { action: event.action, author_name: event.author_name }
              : null,
          } as any);
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

    // Initial fallback check для optimistic generation
    if (!wsManager.isConnected && hasSubmittingGenerationElements()) {
      if (!fallbackRefetchIntervalRef.current) {
        fallbackRefetchIntervalRef.current = setInterval(tryFallbackRefetch, 8000);
      }
    }

    return () => {
      stopFallbackRefetch();
      unsubscribe();
      unsubscribeConnect();
      unsubscribeDisconnect();
      unsubscribeReconnectExhausted();
      wsManager.disconnect();
    };
  }, [projectId, sceneId, updateElement, deleteElement]);

  // Calculate filter counts
  const filterCounts = useMemo(() => {
    return {
      all: elements.length,
      favorites: elements.filter((e) => e.is_favorite).length,
      images: elements.filter((e) => e.element_type === "IMAGE").length,
      videos: elements.filter((e) => e.element_type === "VIDEO").length,
    };
  }, [elements]);

  // File drop handler — moved to SceneWorkspace level
  const handleFileDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (!scene) return;

      const validFiles: File[] = [];
      for (const file of acceptedFiles) {
        const fileSizeMB = file.size / (1024 * 1024);
        if (fileSizeMB > MAX_FILE_SIZE_MB) {
          toast.error(
            `Файл "${file.name}" слишком большой (макс. ${MAX_FILE_SIZE_MB} МБ)`
          );
          continue;
        }
        validFiles.push(file);
      }

      if (validFiles.length === 0) return;

      enqueueUploads(scene.id, validFiles);
    },
    [scene, enqueueUploads]
  );

  // Check if modal is open to disable scene dropzone
  const isModalOpen = useUIStore((s) => s.isElementSelectionModalOpen);
  
  // Dropzone setup — noClick: true means drag works, click doesn't
  // disabled when modal is open
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: handleFileDrop,
    accept: {
      "image/*": [".jpg", ".jpeg", ".png", ".webp", ".gif"],
      "video/*": [".mp4", ".webm", ".mov"],
    },
    noClick: true,
    noKeyboard: true,
    disabled: isModalOpen,
  });

  const isGroupDelete = confirmDeleteIds.length > 1;

  const openDeleteDialog = (ids: number[]) => {
    if (ids.length === 0) return;
    setConfirmDeleteIds(ids);
    setDeleteDialogOpen(true);
  };

  // Handle delete from lightbox - prepare next element to show after delete
  const handleLightboxDelete = (id: number) => {
    const filteredElements = getFilteredElements();
    const currentIndex = filteredElements.findIndex((e) => e.id === id);
    
    // Determine next element to show after delete
    let nextId: number | null = null;
    if (filteredElements.length > 1) {
      if (currentIndex < filteredElements.length - 1) {
        // Show next element
        nextId = filteredElements[currentIndex + 1].id;
      } else if (currentIndex > 0) {
        // Show previous element (if deleting last)
        nextId = filteredElements[currentIndex - 1].id;
      }
    }
    
    // Save next element id for after delete confirmation
    setNextElementIdAfterDelete(nextId);
    
    // Open delete dialog
    openDeleteDialog([id]);
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
    
    // Navigate to next element after delete (for lightbox)
    if (nextElementIdAfterDelete !== null) {
      openLightbox(nextElementIdAfterDelete);
      setNextElementIdAfterDelete(null);
    } else if (nextElementIdAfterDelete === null && lightboxOpen) {
      // No elements left - close lightbox
      closeLightbox();
    }
    
    try {
      await deleteElements(idsToDelete);
      clearSelection();
    } finally {
      toast.dismiss(deletingToastId);
    }
  };

  const hasElements = elements.length > 0;

  // Current element for lightbox detail panel
  const currentElementForLightbox = useMemo(() => {
    if (!lightboxElementId) return null;
    return elements.find((e) => e.id === lightboxElementId) ?? null;
  }, [elements, lightboxElementId]);

  // Keyboard shortcuts for lightbox
  useKeyboard({
    onArrowLeft: () => lightboxOpen && navigateLightbox("prev"),
    onArrowRight: () => lightboxOpen && navigateLightbox("next"),
    onEscape: () => lightboxOpen && closeLightbox(),
    onF: () => lightboxOpen && lightboxElementId && toggleFavorite(lightboxElementId),
    onDelete: () => {
      if (lightboxOpen && lightboxElementId) {
        openDeleteDialog([lightboxElementId]);
      }
    },
    enabled: lightboxOpen,
  });

  return (
    <div className="flex h-full overflow-hidden">
      {/* Zone 1: Config Panel (left sidebar) */}
      <div className="hidden md:block">
        <ConfigPanel />
      </div>

      {/* Main content area — whole-scene dropzone (drag only, no click) */}
      <div
        className={cn(
          "flex flex-1 flex-col min-w-0 relative",
          isDragActive && "bg-primary/5"
        )}
        {...getRootProps()}
      >
        <input {...getInputProps()} />

        {/* Filters toolbar - inside scene workspace */}
        <div className="border-b px-4 py-2 shrink-0 bg-surface">
          <div className="flex items-center gap-4">
            <ElementFilters
              filter={filter}
              onFilterChange={setFilter}
              counts={filterCounts}
            />
            <DisplaySettingsPopover />
          </div>
        </div>

        {/* Zone 3: Grid area - scrollable */}
        <div className="flex-1 overflow-auto p-4 relative min-h-0">
          {hasElements ? (
            <ElementGrid onRequestDelete={openDeleteDialog} />
          ) : (
            <EmptyState onUploadClick={open} isDragActive={isDragActive} />
          )}
        </div>

        {/* Zone 2: Prompt Bar (bottom) */}
        <PromptBar projectId={projectId} sceneId={sceneId} />

        {/* Bulk actions bar - shown when items selected */}
        <ElementBulkBar
          selectedCount={selectedIds.size}
          totalCount={getFilteredElements().length}
          onDeleteSelected={() => openDeleteDialog(Array.from(selectedIds))}
          onClearSelection={clearSelection}
          onToggleSelectAll={toggleSelectAll}
        />

        {/* Whole-scene drag overlay - only during drag */}
        {isDragActive && hasElements && (
          <div className="absolute inset-0 z-50 border-2 border-dashed border-primary bg-primary/5 rounded-md flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center gap-3">
              <Upload className="h-10 w-10 text-primary animate-pulse" />
              <p className="text-lg font-medium text-primary">Отпустите файлы для загрузки</p>
              <p className="text-sm text-muted-foreground">JPG, PNG, MP4, MOV</p>
            </div>
          </div>
        )}

        {/* Delete confirmation dialog */}
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

        {/* Lightbox Modal */}
        <LightboxModal
          elements={getFilteredElements()}
          currentElementId={lightboxElementId}
          isOpen={lightboxOpen}
          onClose={closeLightbox}
          onNavigate={navigateLightbox}
          onSelectElement={openLightbox}
          onToggleFavorite={toggleFavorite}
          onSetHeadliner={setHeadliner}
          onDelete={handleLightboxDelete}
          headlinerId={scene?.headliner ?? null}
          filter={filter}
          onFilterChange={setFilter}
          filterCounts={filterCounts}
        >
          {currentElementForLightbox && (
            <DetailPanel
              element={currentElementForLightbox}
              onUpdateElement={updateElement}
              onClose={closeLightbox}
            />
          )}
        </LightboxModal>
      </div>
    </div>
  );
}
