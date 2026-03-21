'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import { useSceneWorkspaceStore } from '@/lib/store/scene-workspace';
import { useCreditsStore } from '@/lib/store/credits';
import { useGenerationStore } from '@/lib/store/generation';
import { useUIStore } from '@/lib/store/ui';
import { useProjectsStore } from '@/lib/store/projects';
import { wsManager } from '@/lib/api/websocket';
import { ElementGrid } from '@/components/element/ElementGrid';
import { ElementFilters } from '@/components/element/ElementFilters';
import { ElementBulkBar } from '@/components/element/ElementBulkBar';
import { ConfigPanel } from '@/components/generation/ConfigPanel';
import { PromptBar } from '@/components/generation/PromptBar';
import { EmptyState } from '@/components/element/EmptyState';
import { DisplaySettingsPopover } from '@/components/display/DisplaySettingsPopover';
import { LightboxModal } from '@/components/lightbox/LightboxModal';
import { DetailPanel } from '@/components/lightbox/DetailPanel';
import { useKeyboard } from '@/lib/hooks/use-keyboard';
import { scenesApi } from '@/lib/api/scenes';
import { MoveToGroupDialog } from '@/components/element/MoveToGroupDialog';
import { Upload, ChevronLeft, FolderPlus } from 'lucide-react';
import { CreateSceneDialog } from '@/components/scene/CreateSceneDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { MAX_FILE_SIZE_MB } from '@/lib/utils/constants';
import type { WSEvent } from '@/lib/types';

interface WorkspaceContainerProps {
  projectId: number;
  groupId?: number;
}

export function WorkspaceContainer({ projectId, groupId }: WorkspaceContainerProps) {
  const router = useRouter();

  const {
    elements,
    groups,
    filter,
    selectedIds,
    isMultiSelectMode,
    scene,
    lightboxOpen,
    lightboxElementId,
    isLoading,
    loadWorkspace,
    setFilter,
    clearSelection,
    toggleSelectAll,
    getFilteredElements,
    updateElement,
    enqueueUploads,
  } = useSceneWorkspaceStore();

  const { loadModels } = useGenerationStore();
  const projects = useProjectsStore((s) => s.projects);
  const loadProjects = useProjectsStore((s) => s.loadProjects);

  // Load projects for breadcrumb name
  useEffect(() => {
    if (projects.length === 0) void loadProjects();
  }, [projects.length, loadProjects]);

  const projectName = useMemo(() => {
    return projects.find((p) => p.id === projectId)?.name;
  }, [projects, projectId]);

  const [confirmDeleteIds, setConfirmDeleteIds] = useState<number[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [nextElementIdAfterDelete, setNextElementIdAfterDelete] = useState<number | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [groupDeleteDialogOpen, setGroupDeleteDialogOpen] = useState(false);
  const [groupDeleteTarget, setGroupDeleteTarget] = useState<number | null>(null);
  const [groupDeleteInfo, setGroupDeleteInfo] = useState<{
    element_count: number;
    children_count: number;
    total_elements_affected: number;
  } | null>(null);
  const [isGroupDeleting, setIsGroupDeleting] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
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

  // Reset store synchronously before paint to prevent stale data flash
  useLayoutEffect(() => {
    resetWorkspace();
  }, [projectId, groupId, resetWorkspace]);

  // Load workspace data
  useEffect(() => {
    loadWorkspace(projectId, groupId);
    return () => {
      resetWorkspace();
    };
  }, [projectId, groupId, loadWorkspace, resetWorkspace]);

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
        .elements.some((element) => element.status === 'PENDING' || element.status === 'PROCESSING');

    const hasSubmittingGenerationElements = () =>
      useSceneWorkspaceStore
        .getState()
        .elements.some(
          (element) =>
            element.client_optimistic_kind === 'generation' &&
            element.client_generation_submit_state === 'submitting',
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
        useSceneWorkspaceStore.getState().loadWorkspace(projectId, groupId);
      } else if (!hasPendingElements) {
        stopFallbackRefetch();
      }
    };

    const unsubscribe = wsManager.on((event: WSEvent) => {
      if (event.type === 'element_status_changed') {
        if (event.status === 'COMPLETED') {
          const completedUpdates: Partial<{
            status: 'COMPLETED';
            file_url: string;
            thumbnail_url: string;
          }> = {
            status: 'COMPLETED',
          };
          if (typeof event.file_url === 'string' && event.file_url.length > 0) {
            completedUpdates.file_url = event.file_url;
          }
          if (typeof event.thumbnail_url === 'string' && event.thumbnail_url.length > 0) {
            completedUpdates.thumbnail_url = event.thumbnail_url;
          }
          updateElement(event.element_id, completedUpdates);
        } else if (event.status === 'FAILED') {
          const err = (event.error_message ?? '').toLowerCase();
          const isCreditsError =
            err.includes('credits') || err.includes('недостаточно средств');
          if (isCreditsError) {
            toast.error('Недостаточно средств для генерации. Карточка удалена.');
            void deleteElement(event.element_id, { silent: true });
            void useCreditsStore.getState().loadBalance();
          } else {
            updateElement(event.element_id, {
              status: 'FAILED',
              error_message: event.error_message ?? '',
            });
            void useCreditsStore.getState().loadBalance();
          }
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
      toast.warning('Соединение нестабильно, обновляю статусы в фоновом режиме');
      tryFallbackRefetch();
      if (!fallbackRefetchIntervalRef.current) {
        fallbackRefetchIntervalRef.current = setInterval(tryFallbackRefetch, 8000);
      }
    });

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
  }, [projectId, groupId, updateElement, deleteElement]);

  // Filter counts
  const filterCounts = useMemo(() => {
    return {
      all: elements.length,
      favorites: elements.filter((e) => e.is_favorite).length,
      images: elements.filter((e) => e.element_type === 'IMAGE').length,
      videos: elements.filter((e) => e.element_type === 'VIDEO').length,
    };
  }, [elements]);

  // File drop handler
  const handleFileDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const validFiles: File[] = [];
      for (const file of acceptedFiles) {
        const fileSizeMB = file.size / (1024 * 1024);
        if (fileSizeMB > MAX_FILE_SIZE_MB) {
          toast.error(
            `Файл "${file.name}" слишком большой (макс. ${MAX_FILE_SIZE_MB} МБ)`,
          );
          continue;
        }
        validFiles.push(file);
      }

      if (validFiles.length === 0) return;

      enqueueUploads(groupId ?? 0, validFiles, projectId);
    },
    [groupId, enqueueUploads],
  );

  // Check if modal is open to disable dropzone
  const isModalOpen = useUIStore((s) => s.isElementSelectionModalOpen);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: handleFileDrop,
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
      'video/*': ['.mp4', '.webm', '.mov'],
    },
    noClick: true,
    noKeyboard: true,
    disabled: isModalOpen,
  });

  const isBulkDelete = confirmDeleteIds.length > 1;
  const deleteIncludesGroups = useMemo(() => {
    const groupIdSet = new Set(groups.map((g) => g.id));
    return confirmDeleteIds.some((id) => groupIdSet.has(id));
  }, [confirmDeleteIds, groups]);

  const openDeleteDialog = (ids: number[]) => {
    if (ids.length === 0) return;
    setConfirmDeleteIds(ids);
    setDeleteDialogOpen(true);
  };

  const handleLightboxDelete = (id: number) => {
    const filteredElements = getFilteredElements();
    const currentIndex = filteredElements.findIndex((e) => e.id === id);

    let nextId: number | null = null;
    if (filteredElements.length > 1) {
      if (currentIndex < filteredElements.length - 1) {
        nextId = filteredElements[currentIndex + 1].id;
      } else if (currentIndex > 0) {
        nextId = filteredElements[currentIndex - 1].id;
      }
    }

    setNextElementIdAfterDelete(nextId);
    openDeleteDialog([id]);
  };

  const handleConfirmDelete = async () => {
    if (confirmDeleteIds.length === 0) return;
    const idsToDelete = confirmDeleteIds;
    const deletingToastId = toast.loading(
      idsToDelete.length > 1
        ? `Удаление ${idsToDelete.length} объектов...`
        : 'Удаление...',
    );

    setDeleteDialogOpen(false);
    setConfirmDeleteIds([]);

    if (nextElementIdAfterDelete !== null) {
      openLightbox(nextElementIdAfterDelete);
      setNextElementIdAfterDelete(null);
    } else if (nextElementIdAfterDelete === null && lightboxOpen) {
      closeLightbox();
    }

    try {
      // Split IDs into elements and groups
      const groupIdSet = new Set(groups.map((g) => g.id));
      const elementIdsToDelete = idsToDelete.filter((id) => !groupIdSet.has(id));
      const groupIdsToDelete = idsToDelete.filter((id) => groupIdSet.has(id));

      // Delete elements
      if (elementIdsToDelete.length > 0) {
        await deleteElements(elementIdsToDelete);
      }
      // Delete groups (cascade deletes their elements on backend)
      for (const gId of groupIdsToDelete) {
        await scenesApi.delete(gId);
      }

      clearSelection();
      // Refresh to reflect deleted groups
      if (groupIdsToDelete.length > 0) {
        loadWorkspace(projectId, groupId);
      }
    } finally {
      toast.dismiss(deletingToastId);
    }
  };

  // Navigate into a group
  const handleGroupClick = useCallback(
    (groupCardId: number) => {
      router.push(`/projects/${projectId}/groups/${groupCardId}`);
    },
    [router, projectId],
  );

  // Separate selected IDs into element IDs and group IDs
  const selectedElementIds = useMemo(() => {
    const elementIdSet = new Set(elements.map((e) => e.id));
    return Array.from(selectedIds).filter((id) => elementIdSet.has(id));
  }, [selectedIds, elements]);

  const selectedGroupIds = useMemo(() => {
    const groupIdSet = new Set(groups.map((g) => g.id));
    return Array.from(selectedIds).filter((id) => groupIdSet.has(id));
  }, [selectedIds, groups]);

  // Open move dialog
  const handleOpenMoveDialog = useCallback(() => {
    if (selectedIds.size === 0) return;
    setMoveDialogOpen(true);
  }, [selectedIds]);

  // Handle move completion
  const handleMoved = useCallback(() => {
    clearSelection();
    loadWorkspace(projectId, groupId);
  }, [clearSelection, loadWorkspace, projectId, groupId]);

  // Handle group delete with confirmation (fetches counts first)
  const handleRequestGroupDelete = useCallback(
    async (groupIdToDelete: number) => {
      setGroupDeleteTarget(groupIdToDelete);
      try {
        const info = await scenesApi.getDeleteInfo(groupIdToDelete);
        setGroupDeleteInfo(info);
        setGroupDeleteDialogOpen(true);
      } catch {
        toast.error('Не удалось получить информацию о группе');
      }
    },
    [],
  );

  const handleConfirmGroupDelete = useCallback(async () => {
    if (groupDeleteTarget === null) return;
    setIsGroupDeleting(true);
    try {
      await scenesApi.delete(groupDeleteTarget);
      toast.success('Группа удалена');
      setGroupDeleteDialogOpen(false);
      setGroupDeleteTarget(null);
      setGroupDeleteInfo(null);
      clearSelection();
      loadWorkspace(projectId, groupId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Не удалось удалить группу';
      toast.error(message);
    } finally {
      setIsGroupDeleting(false);
    }
  }, [groupDeleteTarget, clearSelection, loadWorkspace, projectId, groupId]);

  // Navigate back
  const handleBack = useCallback(() => {
    if (scene?.parent) {
      router.push(`/projects/${projectId}/groups/${scene.parent}`);
    } else {
      router.push(`/projects/${projectId}`);
    }
  }, [router, projectId, scene]);

  const hasContent = elements.length > 0 || groups.length > 0;

  // Current element for lightbox detail panel
  const currentElementForLightbox = useMemo(() => {
    if (!lightboxElementId) return null;
    return elements.find((e) => e.id === lightboxElementId) ?? null;
  }, [elements, lightboxElementId]);

  // Keyboard shortcuts for lightbox
  useKeyboard({
    onArrowLeft: () => lightboxOpen && navigateLightbox('prev'),
    onArrowRight: () => lightboxOpen && navigateLightbox('next'),
    onEscape: () => lightboxOpen && closeLightbox(),
    onF: () => lightboxOpen && lightboxElementId && toggleFavorite(lightboxElementId),
    onDelete: () => {
      if (lightboxOpen && lightboxElementId) {
        openDeleteDialog([lightboxElementId]);
      }
    },
    enabled: lightboxOpen,
  });


  // Build breadcrumb parts — always visible
  const breadcrumbs = useMemo(() => {
    const parts: { label: string; href?: string }[] = [];

    // "Проекты" link — always first, always clickable
    parts.push({ label: 'Проекты', href: '/projects' });

    // Project name — clickable when inside a group
    const displayName = projectName ?? scene?.project_name ?? `#${projectId}`;
    parts.push({
      label: `Проект «${displayName}»`,
      href: groupId ? `/projects/${projectId}` : undefined,
    });

    if (groupId && scene) {
      if (scene.parent_name && scene.parent) {
        // Subgroup
        parts.push({
          label: `Группа «${scene.parent_name}»`,
          href: `/projects/${projectId}/groups/${scene.parent}`,
        });
      }
      parts.push({ label: `Группа «${scene.name}»` });
    }

    return parts;
  }, [groupId, scene, projectId, projectName]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Zone 1: Config Panel (left sidebar) */}
      <div className="hidden md:block">
        <ConfigPanel />
      </div>

      {/* Main content area */}
      <div
        className={cn(
          'flex flex-1 flex-col min-w-0 relative',
          isDragActive && 'bg-primary/5',
        )}
        {...getRootProps()}
      >
        <input {...getInputProps()} />

        {/* Breadcrumbs + Filters toolbar */}
        <div className="border-b px-4 py-2 shrink-0 bg-background">
          {/* Breadcrumbs — always visible */}
          {breadcrumbs.length > 0 && (
            <div className="flex items-center gap-1 mb-2">
              {groupId && (
                <>
                  <button
                    type="button"
                    onClick={handleBack}
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Назад</span>
                  </button>
                  <span className="text-muted-foreground/50 mx-1">/</span>
                </>
              )}
              {breadcrumbs.map((crumb, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span className="text-muted-foreground/50 mx-1">&gt;</span>}
                  {crumb.href ? (
                    <button
                      type="button"
                      onClick={() => router.push(crumb.href!)}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {crumb.label}
                    </button>
                  ) : (
                    <span className="text-sm text-foreground font-medium">{crumb.label}</span>
                  )}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            <ElementFilters
              filter={filter}
              onFilterChange={setFilter}
              counts={filterCounts}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreateGroupOpen(true)}
              className="gap-2"
            >
              <FolderPlus className="h-4 w-4" />
              Создать группу
            </Button>
            <div className="ml-auto">
              <DisplaySettingsPopover />
            </div>
          </div>
        </div>

        {/* Zone 3: Grid area - scrollable */}
        <div className="flex-1 overflow-auto p-2 sm:p-4 relative min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : hasContent ? (
            <ElementGrid
              onRequestDelete={openDeleteDialog}
              groups={groups}
              onGroupClick={handleGroupClick}
              onGroupDelete={handleRequestGroupDelete}
            />
          ) : (
            <EmptyState onUploadClick={open} isDragActive={isDragActive} />
          )}
        </div>

        {/* Zone 2: Prompt Bar (bottom) */}
        <PromptBar projectId={projectId} groupId={groupId} />

        {/* Bulk actions bar */}
        <ElementBulkBar
          selectedCount={selectedIds.size}
          totalCount={getFilteredElements().length + groups.length}
          onDeleteSelected={() => openDeleteDialog(Array.from(selectedIds))}
          onMoveSelected={handleOpenMoveDialog}
          onClearSelection={clearSelection}
          onToggleSelectAll={toggleSelectAll}
        />

        {/* Whole-area drag overlay */}
        {isDragActive && hasContent && (
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
                {isBulkDelete ? 'Удалить выбранное?' : deleteIncludesGroups ? 'Удалить группу?' : 'Удалить элемент?'}
              </DialogTitle>
              <DialogDescription>
                {deleteIncludesGroups
                  ? isBulkDelete
                    ? `Будет удалено ${confirmDeleteIds.length} объектов. Группы удаляются вместе с содержимым. Это действие нельзя отменить.`
                    : 'Группа будет удалена вместе со всем содержимым. Это действие нельзя отменить.'
                  : isBulkDelete
                    ? `Будет удалено ${confirmDeleteIds.length} элементов. Это действие нельзя отменить.`
                    : 'Элемент будет удалён безвозвратно.'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>
                Отмена
              </Button>
              <Button variant="destructive" onClick={handleConfirmDelete}>
                Удалить
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Move to group dialog */}
        <MoveToGroupDialog
          open={moveDialogOpen}
          onOpenChange={setMoveDialogOpen}
          projectId={projectId}
          selectedElementIds={selectedElementIds}
          selectedGroupIds={selectedGroupIds}
          currentGroupId={groupId}
          onMoved={handleMoved}
        />

        {/* Group delete confirmation dialog */}
        <Dialog open={groupDeleteDialogOpen} onOpenChange={setGroupDeleteDialogOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Удалить группу?</DialogTitle>
              <DialogDescription>
                {groupDeleteInfo && groupDeleteInfo.children_count > 0
                  ? `Будет удалено: ${groupDeleteInfo.children_count} подгрупп и ${groupDeleteInfo.total_elements_affected} элементов. Это действие нельзя отменить.`
                  : groupDeleteInfo && groupDeleteInfo.total_elements_affected > 0
                    ? `Будет удалено ${groupDeleteInfo.total_elements_affected} элементов внутри группы. Это действие нельзя отменить.`
                    : 'Пустая группа будет удалена.'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setGroupDeleteDialogOpen(false)}
                disabled={isGroupDeleting}
              >
                Отмена
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmGroupDelete}
                disabled={isGroupDeleting}
              >
                {isGroupDeleting ? 'Удаление...' : 'Удалить'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create group dialog */}
        <CreateSceneDialog
          projectId={projectId}
          parentId={groupId}
          open={createGroupOpen}
          onOpenChange={(open) => {
            setCreateGroupOpen(open);
            if (!open) loadWorkspace(projectId, groupId);
          }}
        />

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
            />
          )}
        </LightboxModal>
      </div>
    </div>
  );
}
