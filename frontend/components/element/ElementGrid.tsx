"use client";

import { useMemo, useEffect, useCallback, useState } from "react";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useSceneWorkspaceStore } from "@/lib/store/scene-workspace";
import { useDisplayStore } from "@/lib/store/project-display";
import { useGenerationStore } from "@/lib/store/generation";
import { ElementCard, type ElementCardProps } from "@/components/element/ElementCard";
import { ElementCardSkeleton } from "@/components/element/ElementCardSkeleton";
import { GroupCard } from "@/components/element/GroupCard";
import { SectionHeader } from "@/components/element/SectionHeader";
import { DragOverlayContent } from "@/components/element/DragOverlayContent";
import { toDndId, parseDndId } from "@/lib/utils/dnd";
import { elementsApi } from "@/lib/api/elements";
import { scenesApi } from "@/lib/api/scenes";
import { cn } from "@/lib/utils";
import { DISPLAY_GRID_CONFIG, CARD_SIZES, GROUP_CARD_SIZES, GROUP_GRID_MIN_WIDTH } from "@/lib/utils/constants";
import type { DragItem, DisplayCardSize, DisplayAspectRatio, Scene } from "@/lib/types";
import { toast } from "sonner";

// Sortable wrapper for GroupCard
function SortableGroupCard({
  dndId,
  group,
  isSelected,
  isMultiSelectMode,
  isDropTarget,
  onSelect,
  onClick,
  onDelete,
  onRename,
  onShare,
  onDownload,
  size,
}: {
  dndId: string;
  group: Scene;
  isSelected: boolean;
  isMultiSelectMode: boolean;
  isDropTarget: boolean;
  onSelect: (id: number, add: boolean) => void;
  onClick: (id: number) => void;
  onDelete: (id: number) => void;
  onRename?: (id: number) => void;
  onShare?: (id: number) => void;
  onDownload?: (id: number) => void;
  size: DisplayCardSize;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dndId });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <GroupCard
        group={group}
        isSelected={isSelected}
        isMultiSelectMode={isMultiSelectMode}
        isDropTarget={isDropTarget}
        onSelect={onSelect}
        onClick={onClick}
        onDelete={onDelete}
        onRename={onRename}
        onShare={onShare}
        onDownload={onDownload}
        size={size}
      />
    </div>
  );
}

// Sortable wrapper for ElementCard
function SortableElementCard({ dndId, ...props }: ElementCardProps & { dndId: string }) {
  const isInProgress = props.element.status === "UPLOADING" ||
    props.element.status === "PENDING" ||
    props.element.status === "PROCESSING" ||
    (props.element.client_upload_phase != null && (props.element.client_upload_progress ?? 0) < 100);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: dndId, disabled: isInProgress });

  const style: React.CSSProperties = {
    ...props.style,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} {...attributes} {...listeners}>
      <ElementCard {...props} style={style} />
    </div>
  );
}

interface ElementGridProps {
  className?: string;
  onRequestDelete: (ids: number[]) => void;
  groups?: Scene[];
  onGroupClick?: (id: number) => void;
  onGroupDelete?: (id: number) => void;
  onGroupRename?: (id: number) => void;
  onGroupShare?: (id: number) => void;
  onGroupDownload?: (id: number) => void;
  shareMode?: boolean;
  shareSelectedIds?: Set<number>;
  onShareToggle?: (id: number) => void;
  onRename?: (id: number, currentName: string) => void;
  onMove?: (id: number) => void;
}

export function ElementGrid({ className, onRequestDelete, groups = [], onGroupClick, onGroupDelete, onGroupRename, onGroupShare, onGroupDownload, shareMode, shareSelectedIds, onShareToggle, onRename, onMove }: ElementGridProps) {
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
    updateApprovalStatus,
  } = useSceneWorkspaceStore();

  const { preferences, hydratePreferences } = useDisplayStore();

  const retryFromElement = useGenerationStore((s) => s.retryFromElement);

  // Hydrate display preferences on mount
  useEffect(() => {
    hydratePreferences();
  }, [hydratePreferences]);

  const filteredElements = getFilteredElements();

  // Get display configuration в зависимости от size И aspect ratio
  const gridConfig = DISPLAY_GRID_CONFIG[preferences.size][preferences.aspectRatio];
  const cardSize = preferences.size;
  const groupDims = GROUP_CARD_SIZES[preferences.size];

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // DnD local state
  const [activeDragItem, setActiveDragItem] = useState<DragItem | null>(null);
  const [overDropTarget, setOverDropTarget] = useState<string | null>(null);

  const {
    collapsedSections,
    toggleSectionCollapse,
    selectAllInSection,
  } = useSceneWorkspaceStore();

  // Prefixed DnD IDs
  const prefixedGroupIds = useMemo(
    () => groups.map((g) => toDndId('group', g.id)),
    [groups],
  );
  const prefixedElementIds = useMemo(
    () => filteredElements.map((e) => toDndId('element', e.id)),
    [filteredElements],
  );

  // Section checkbox states
  const groupsCheckboxState = useMemo(() => {
    if (groups.length === 0) return 'empty' as const;
    const selectedCount = groups.filter((g) => selectedIds.has(g.id)).length;
    if (selectedCount === 0) return 'empty' as const;
    if (selectedCount === groups.length) return 'full' as const;
    return 'partial' as const;
  }, [groups, selectedIds]);

  const elementsCheckboxState = useMemo(() => {
    if (filteredElements.length === 0) return 'empty' as const;
    const selectedCount = filteredElements.filter((e) => selectedIds.has(e.id)).length;
    if (selectedCount === 0) return 'empty' as const;
    if (selectedCount === filteredElements.length) return 'full' as const;
    return 'partial' as const;
  }, [filteredElements, selectedIds]);

  // Section total sizes
  const groupsTotalSize = useMemo(
    () => groups.reduce((sum, g) => sum + (g.storage_bytes ?? 0), 0),
    [groups],
  );
  const elementsTotalSize = useMemo(
    () => filteredElements.reduce((sum, e) => sum + (e.file_size ?? 0), 0),
    [filteredElements],
  );

  // Sorted groups
  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.order_index - b.order_index),
    [groups]
  );

  // DnD handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const parsed = parseDndId(event.active.id);
    if (parsed) setActiveDragItem(parsed);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const overId = event.over?.id;
    setOverDropTarget(overId ? String(overId) : null);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDragItem(null);
      setOverDropTarget(null);

      if (!over || active.id === over.id) return;

      const activeParsed = parseDndId(active.id);
      const overParsed = parseDndId(over.id);
      if (!activeParsed || !overParsed) return;

      const { scene, elements, projectId } = useSceneWorkspaceStore.getState();

      // Case 1: Element reorder (element → element)
      if (activeParsed.type === 'element' && overParsed.type === 'element') {
        if (!scene) return;
        const allElements = elements;
        const oldIndex = allElements.findIndex((e) => e.id === activeParsed.id);
        const newIndex = allElements.findIndex((e) => e.id === overParsed.id);
        if (oldIndex === -1 || newIndex === -1) return;
        const ids = allElements.map((e) => e.id);
        const [movedId] = ids.splice(oldIndex, 1);
        ids.splice(newIndex, 0, movedId);
        try {
          await reorderElements(ids);
        } catch {
          toast.error("Не удалось сохранить порядок");
        }
      }

      // Case 2: Element → Group (cross-container move)
      if (activeParsed.type === 'element' && overParsed.type === 'group') {
        const elementIds = selectedIds.has(activeParsed.id)
          ? Array.from(selectedIds).filter((id) => elements.some((e) => e.id === id))
          : [activeParsed.id];
        try {
          await elementsApi.move({
            element_ids: elementIds,
            target_scene: overParsed.id,
          });
          elementIds.forEach((id) => useSceneWorkspaceStore.getState().removeElement(id));
          useSceneWorkspaceStore.getState().clearSelection();
          if (projectId) {
            const groupId = scene?.id;
            useSceneWorkspaceStore.getState().loadWorkspace(projectId, groupId);
          }
          toast.success("Перемещено в группу");
        } catch {
          toast.error("Не удалось переместить");
        }
      }

      // Case 3: Group reorder
      if (activeParsed.type === 'group' && overParsed.type === 'group' && projectId) {
        const oldIndex = sortedGroups.findIndex((g) => g.id === activeParsed.id);
        const newIndex = sortedGroups.findIndex((g) => g.id === overParsed.id);
        if (oldIndex === -1 || newIndex === -1) return;
        const prevGroups = sortedGroups;
        const reordered = arrayMove(sortedGroups, oldIndex, newIndex);
        useSceneWorkspaceStore.setState({ groups: reordered.map((g, i) => ({ ...g, order_index: i })) });
        const reorderedIds = reordered.map((g) => g.id);
        try {
          await scenesApi.reorder(projectId, { scene_ids: reorderedIds });
        } catch {
          useSceneWorkspaceStore.setState({ groups: prevGroups });
          toast.error("Не удалось изменить порядок групп");
        }
      }
    },
    [sortedGroups, selectedIds, reorderElements],
  );

  // Card callbacks
  const cardCallbacks = useMemo(
    () => ({
      onSelect: selectElement,
      onOpenLightbox: openLightbox,
      onToggleFavorite: toggleFavorite,
      onDelete: (id: number) => onRequestDelete([id]),
      onRetry: (id: number) => {
        const element = getFilteredElements().find((e) => e.id === id);
        if (element) retryFromElement(element);
      },
      onUpdateStatus: (id: number, status: string | null) => updateApprovalStatus(id, status as any),
      onRename,
      onMove,
    }),
    [selectElement, openLightbox, toggleFavorite, onRequestDelete, retryFromElement, getFilteredElements, updateApprovalStatus, onRename, onMove]
  );

  // On mobile, element grid density is derived from aspect ratio instead of user-set size:
  //   landscape/square → 1 col full width (labels read well)
  //   portrait         → 2 cols (tall cards pack densely)
  const elementMobileGridClass =
    preferences.aspectRatio === "portrait" ? "grid-mobile-2" : "grid-mobile-1";

  // Loading state
  if (isLoading) {
    return (
      <div className={cn("element-grid", className)}>
        <div
          className={cn("grid", elementMobileGridClass, gridConfig.gap)}
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${gridConfig.minWidth}px, 1fr))` }}
        >
          {Array.from({ length: 12 }).map((_, i) => (
            <ElementCardSkeleton key={i} aspectRatio={preferences.aspectRatio} />
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

  const gridStyle = { gridTemplateColumns: `repeat(auto-fill, minmax(${gridConfig.minWidth}px, 1fr))` };
  const hasGroups = sortedGroups.length > 0;
  const hasElements = filteredElements.length > 0;

  return (
    <div className={cn("element-grid", className)}>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {/* Groups section */}
        {hasGroups && (
          <div className="mb-3">
            <SectionHeader
              label="Группы"
              count={sortedGroups.length}
              totalSize={groupsTotalSize}
              collapsed={collapsedSections.groups}
              checkboxState={groupsCheckboxState}
              onToggleCollapse={() => toggleSectionCollapse('groups')}
              onToggleSelectAll={() => selectAllInSection('groups')}
            />
            {!collapsedSections.groups && (
              <SortableContext items={prefixedGroupIds} strategy={rectSortingStrategy}>
                <div
                  className={cn("grid grid-mobile-1 py-1", gridConfig.gap)}
                  style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${GROUP_GRID_MIN_WIDTH[preferences.size]}px, 1fr))` }}
                >
                  {sortedGroups.map((group) => {
                    const dndId = toDndId('group', group.id);
                    return (
                      <SortableGroupCard
                        key={dndId}
                        dndId={dndId}
                        group={group}
                        isSelected={selectedIds.has(group.id)}
                        isMultiSelectMode={isMultiSelectMode}
                        isDropTarget={overDropTarget === dndId}
                        onSelect={(id, add) => {
                          useSceneWorkspaceStore.getState().selectElement(id, add);
                        }}
                        onClick={onGroupClick ?? (() => {})}
                        onDelete={onGroupDelete ?? (() => {})}
                        onRename={onGroupRename}
                        onShare={onGroupShare}
                        onDownload={onGroupDownload}
                        size={preferences.size}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            )}
          </div>
        )}

        {/* Divider between sections */}
        {hasGroups && hasElements && (
          <div className="border-t border-border mb-3" />
        )}

        {/* Elements section */}
        {hasElements && (
          <div>
            <SectionHeader
              label="Элементы"
              count={filteredElements.length}
              totalSize={elementsTotalSize}
              collapsed={collapsedSections.elements}
              checkboxState={elementsCheckboxState}
              onToggleCollapse={() => toggleSectionCollapse('elements')}
              onToggleSelectAll={() => selectAllInSection('elements')}
            />
            {!collapsedSections.elements && (
              <SortableContext items={prefixedElementIds} strategy={rectSortingStrategy}>
                <div className={cn("grid pt-2", elementMobileGridClass, gridConfig.gap)} style={gridStyle}>
                  {filteredElements.map((element, index) => (
                    <SortableElementCard
                      key={element.id}
                      dndId={toDndId('element', element.id)}
                      element={element}
                      index={index}
                      size={cardSize}
                      aspectRatio={preferences.aspectRatio}
                      fitMode={preferences.fitMode}
                      showMetadata={preferences.showMetadata}
                      reviewSummary={element.review_summary}
                      isSelected={shareMode ? (shareSelectedIds?.has(element.id) ?? false) : selectedIds.has(element.id)}
                      isMultiSelectMode={shareMode || isMultiSelectMode}
                      {...cardCallbacks}
                      {...(shareMode && onShareToggle ? {
                        onSelect: (id: number) => onShareToggle(id),
                        onOpenLightbox: (id: number) => onShareToggle(id),
                      } : {})}
                    />
                  ))}
                </div>
              </SortableContext>
            )}
          </div>
        )}

        {/* Drag overlay */}
        <DragOverlay>
          {activeDragItem && (
            <DragOverlayContent
              type={activeDragItem.type}
              element={activeDragItem.type === 'element' ? filteredElements.find((e) => e.id === activeDragItem.id) : undefined}
              group={activeDragItem.type === 'group' ? sortedGroups.find((g) => g.id === activeDragItem.id) : undefined}
              additionalCount={activeDragItem.type === 'element' && selectedIds.has(activeDragItem.id) ? selectedIds.size - 1 : 0}
              size={preferences.size}
              aspectRatio={preferences.aspectRatio}
              fitMode={preferences.fitMode}
            />
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
