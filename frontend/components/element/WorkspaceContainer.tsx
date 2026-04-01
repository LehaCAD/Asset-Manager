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
import { Upload, ChevronLeft, ChevronRight, FolderPlus, Share2, Link2, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ShareSelectionMode } from '@/components/sharing/ShareSelectionMode';
import { CreateLinkDialog } from '@/components/sharing/CreateLinkDialog';
import { ShareLinksPanel } from '@/components/sharing/ShareLinksPanel';
import { sharingApi } from '@/lib/api/sharing';
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
import type { WSEvent, WorkspaceElement } from '@/lib/types';

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
  const [sharePopoverOpen, setSharePopoverOpen] = useState(false);

  // Share mode persisted in sessionStorage to survive group navigation
  const [shareMode, _setShareMode] = useState(() => {
    if (typeof sessionStorage === 'undefined') return false;
    return sessionStorage.getItem('shareMode') === 'true';
  });
  const setShareMode = useCallback((v: boolean) => {
    _setShareMode(v);
    if (typeof sessionStorage !== 'undefined') {
      if (v) sessionStorage.setItem('shareMode', 'true');
      else sessionStorage.removeItem('shareMode');
    }
  }, []);

  const [shareSelectedIds, _setShareSelectedIds] = useState<Set<number>>(() => {
    if (typeof sessionStorage === 'undefined') return new Set();
    try {
      const stored = sessionStorage.getItem('shareSelectedIds');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const setShareSelectedIds = useCallback((updater: Set<number> | ((prev: Set<number>) => Set<number>)) => {
    _setShareSelectedIds((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('shareSelectedIds', JSON.stringify([...next]));
      }
      return next;
    });
  }, []);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [shareElements, setShareElements] = useState<Array<{ id: number; element_type: string; is_favorite: boolean }>>([]);
  const [linksPanelOpen, setLinksPanelOpen] = useState(false);
  const [linksRefreshKey, setLinksRefreshKey] = useState(0);
  const [promptBarHeight, setPromptBarHeight] = useState(0);
  const promptBarRef = useRef<HTMLDivElement>(null);
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

  // Handle lightbox deep-link from URL (?lightbox=elementId)
  useEffect(() => {
    if (isLoading || elements.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const lightboxId = params.get('lightbox');
    if (lightboxId) {
      const elementId = parseInt(lightboxId, 10);
      if (!isNaN(elementId)) {
        const exists = elements.some((e) => e.id === elementId);
        if (exists) {
          openLightbox(elementId);
        }
        // Clean URL regardless — avoid re-triggering
        const url = new URL(window.location.href);
        url.searchParams.delete('lightbox');
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, [isLoading, elements, openLightbox]);

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
        .elements.some((element) => element.status === 'PENDING' || element.status === 'PROCESSING' || element.status === 'UPLOADING');

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
          updateElement(event.element_id, {
            status: 'COMPLETED',
            ...(event.file_url && { file_url: event.file_url }),
            ...(event.thumbnail_url && { thumbnail_url: event.thumbnail_url }),
            ...(event.preview_url && { preview_url: event.preview_url }),
            // Clear upload progress tracking
            client_upload_phase: undefined,
            client_upload_progress: undefined,
          });
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
              // Clear upload progress tracking
              client_upload_phase: undefined,
              client_upload_progress: undefined,
            });
            void useCreditsStore.getState().loadBalance();
          }
        } else {
          const updates: Partial<WorkspaceElement> = {
            status: event.status,
            ...(event.file_url && { file_url: event.file_url }),
            ...(event.thumbnail_url && { thumbnail_url: event.thumbnail_url }),
            ...(event.preview_url && { preview_url: event.preview_url }),
          };
          // Server-side progress from Celery (upload or generation finalization)
          if (event.upload_progress != null) {
            // Check if this is an upload element (has client upload tracking) or generation
            const el = elements.find((e) => e.id === event.element_id);
            const isUploadElement = el?.source_type === "UPLOADED";
            updates.client_upload_phase = "completing";
            updates.client_upload_progress = isUploadElement
              ? 90 + Math.round(event.upload_progress * 0.1) // upload: 90-100
              : event.upload_progress; // generation: 0-100
          }
          updateElement(event.element_id, updates);
        }
      }
    });

    const unsubscribeConnect = wsManager.onConnect(() => {
      stopFallbackRefetch();
      // After reconnect, refresh state to catch up on any WS events missed during disconnect
      if (hasPendingOrProcessingElements() || hasSubmittingGenerationElements()) {
        useSceneWorkspaceStore.getState().loadWorkspace(projectId, groupId);
      }
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
    } else if (groupId) {
      router.push(`/projects/${projectId}`);
    } else {
      router.push('/projects');
    }
  }, [router, projectId, groupId, scene]);

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

  // === Share mode handlers ===
  const allElementIds = useMemo(() => {
    return getFilteredElements().map((el) => el.id);
  }, [getFilteredElements]);

  const handleToggleShareElement = useCallback((id: number) => {
    setShareSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleShareSelectAll = useCallback(() => {
    setShareSelectedIds((prev) => {
      if (prev.size === allElementIds.length) return new Set();
      return new Set(allElementIds);
    });
  }, [allElementIds]);

  const handleShareConfirm = useCallback(() => {
    setLinkDialogOpen(true);
  }, []);

  const handleShareCancel = useCallback(() => {
    setShareMode(false);
    setShareSelectedIds(new Set());
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('shareMode');
      sessionStorage.removeItem('shareSelectedIds');
    }
  }, [setShareMode, setShareSelectedIds]);

  const handleLinkDialogClose = useCallback(() => {
    setLinkDialogOpen(false);
    setShareMode(false);
    setShareSelectedIds(new Set());
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('shareMode');
      sessionStorage.removeItem('shareSelectedIds');
    }
  }, [setShareMode, setShareSelectedIds]);

  const handleLinkCreated = useCallback(() => {
    setLinksRefreshKey((k) => k + 1);
    setLinksPanelOpen(true);
  }, []);

  // Measure PromptBar height dynamically
  useEffect(() => {
    const el = promptBarRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setPromptBarHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

        {/* Breadcrumbs + Filters toolbar — single row */}
        <div className="flex items-center justify-between border-b px-4 py-2 shrink-0 bg-surface">
          {/* Left: breadcrumbs + create group */}
          <div className="flex items-center gap-1 min-w-0">
            {breadcrumbs.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Назад</span>
                </button>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 mx-0.5 shrink-0" />
                {breadcrumbs.map((crumb, i) => (
                  <span key={i} className="flex items-center gap-1 min-w-0">
                    {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 mx-0.5 shrink-0" />}
                    {crumb.href ? (
                      <button
                        type="button"
                        onClick={() => router.push(crumb.href!)}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors truncate"
                      >
                        {crumb.label}
                      </button>
                    ) : (
                      <span className="text-sm text-foreground font-medium truncate">{crumb.label}</span>
                    )}
                  </span>
                ))}
              </>
            )}
            <button
              type="button"
              onClick={() => setCreateGroupOpen(true)}
              className="flex items-center gap-1.5 h-7 px-3 ml-2 rounded text-xs font-medium text-primary bg-card hover:bg-card/80 transition-colors shrink-0"
            >
              <FolderPlus className="h-4 w-4" />
              Создать группу
            </button>
          </div>

          {/* Right: share + filters + view */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Popover open={sharePopoverOpen} onOpenChange={setSharePopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1.5 h-7 px-3 rounded text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors shrink-0"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  Поделиться
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-52 p-1" sideOffset={4}>
                <button
                  type="button"
                  onClick={async () => {
                    setSharePopoverOpen(false);
                    try {
                      const els = await sharingApi.getProjectElements(projectId);
                      if (els.length === 0) { toast.error('В проекте нет элементов'); return; }
                      setShareElements(els);
                      setShareSelectedIds(new Set(els.map(e => e.id)));
                      setLinkDialogOpen(true);
                    } catch { toast.error('Не удалось загрузить элементы'); }
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors text-left"
                >
                  <Share2 className="h-4 w-4 text-muted-foreground" />
                  Весь проект
                </button>
                <div className="h-px bg-border my-1" />
                <button
                  type="button"
                  onClick={() => { setSharePopoverOpen(false); setLinksPanelOpen(true); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors text-left"
                >
                  <Link2 className="h-4 w-4 text-muted-foreground" />
                  Все ссылки
                </button>
              </PopoverContent>
            </Popover>
            <ElementFilters
              filter={filter}
              onFilterChange={setFilter}
              counts={filterCounts}
            />
            <DisplaySettingsPopover />
          </div>
        </div>

        {/* Zone 3: Grid area - scrollable */}
        <div
          className="flex-1 overflow-auto p-2 sm:p-4 relative min-h-0"
          style={{ paddingBottom: promptBarHeight + 16 }}
        >
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
              shareMode={shareMode}
              shareSelectedIds={shareSelectedIds}
              onShareToggle={handleToggleShareElement}
            />
          ) : (
            <EmptyState onUploadClick={open} isDragActive={isDragActive} />
          )}
        </div>

        {/* Zone 2: Prompt Bar (floating bottom) */}
        <div ref={promptBarRef} className="absolute bottom-0 left-0 right-0 z-40 pointer-events-none">
          <div className="pointer-events-auto">
            <PromptBar projectId={projectId} groupId={groupId} />
          </div>
        </div>

        {/* Bulk actions bar */}
        <ElementBulkBar
          selectedCount={selectedIds.size}
          totalCount={getFilteredElements().length + groups.length}
          onDeleteSelected={() => openDeleteDialog(Array.from(selectedIds))}
          onMoveSelected={handleOpenMoveDialog}
          onShareSelected={() => {
            const elementOnlyIds = Array.from(selectedIds).filter(
              id => !groups.some(g => g.id === id)
            );
            const selectedGroupIds = Array.from(selectedIds).filter(
              id => groups.some(g => g.id === id)
            );

            if (selectedGroupIds.length === 0) {
              // Only elements — build metadata from store
              const els = getFilteredElements()
                .filter(e => elementOnlyIds.includes(e.id))
                .map(e => ({ id: e.id, element_type: e.element_type, is_favorite: e.is_favorite }));
              setShareElements(els);
              setShareSelectedIds(new Set(elementOnlyIds));
              setLinkDialogOpen(true);
            } else {
              // Groups selected — fetch metadata
              Promise.all(selectedGroupIds.map(gid => sharingApi.getGroupElements(gid)))
                .then(results => {
                  const groupEls = results.flat();
                  const storeEls = getFilteredElements()
                    .filter(e => elementOnlyIds.includes(e.id))
                    .map(e => ({ id: e.id, element_type: e.element_type, is_favorite: e.is_favorite }));
                  const allEls = [...storeEls, ...groupEls];
                  if (allEls.length === 0) {
                    toast.error('Нет элементов для шеринга');
                    return;
                  }
                  setShareElements(allEls);
                  setShareSelectedIds(new Set(allEls.map(e => e.id)));
                  setLinkDialogOpen(true);
                })
                .catch(() => toast.error('Не удалось загрузить элементы групп'));
            }
          }}
          onClearSelection={clearSelection}
          onToggleSelectAll={toggleSelectAll}
        />

        {/* Share selection mode bar */}
        {shareMode && (
          <ShareSelectionMode
            selectedIds={shareSelectedIds}
            totalCount={allElementIds.length}
            onConfirm={handleShareConfirm}
            onCancel={handleShareCancel}
            onSelectAll={handleShareSelectAll}
          />
        )}

        {/* Create link dialog */}
        <CreateLinkDialog
          isOpen={linkDialogOpen}
          onClose={handleLinkDialogClose}
          onCreated={handleLinkCreated}
          projectId={projectId}
          elementIds={Array.from(shareSelectedIds)}
          elements={shareElements}
        />

        {/* Share links panel (slide-over) */}
        {linksPanelOpen && (
          <div className="fixed inset-y-0 right-0 z-50 w-80 bg-background border-l shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="text-sm font-medium">Ссылки для просмотра</h3>
              <button
                type="button"
                onClick={() => setLinksPanelOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              <ShareLinksPanel projectId={projectId} refreshKey={linksRefreshKey} />
            </div>
          </div>
        )}

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
              onClose={closeLightbox}
            />
          )}
        </LightboxModal>
      </div>
    </div>
  );
}
