"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import { ElementSelectionGrid } from "./ElementSelectionGrid";
import { ElementFilters } from "./ElementFilters";
import { useModalSceneElements } from "@/lib/hooks/use-modal-scene-elements";
import { useScenesStore } from "@/lib/store/scenes";
import { useSceneWorkspaceStore } from "@/lib/store/scene-workspace";
import { useUIStore } from "@/lib/store/ui";
import { toast } from "sonner";
import { Upload, Plus, X, Folder, FolderOpen, ChevronRight, ChevronDown, FileImage } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_FILE_SIZE_MB } from "@/lib/utils/constants";
import type { Element, ElementType, ModalSelectionByScene, ElementFilter, Scene } from "@/lib/types";

export interface ElementSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedElements: Element[]) => void;
  projectId: number;
  currentSceneId: number;
  max: number;
  min?: number;
  initialSelection?: ModalSelectionByScene;
  elementTypeFilter?: ElementType;
  title?: string;
}


// --- Group tree node ---
interface GroupTreeNode {
  group: Scene;
  children: GroupTreeNode[];
}

function buildGroupTree(groups: Scene[]): GroupTreeNode[] {
  const childrenMap = new Map<number | null, Scene[]>();
  for (const g of groups) {
    const key = g.parent ?? null;
    if (!childrenMap.has(key)) childrenMap.set(key, []);
    childrenMap.get(key)!.push(g);
  }

  const build = (parentId: number | null): GroupTreeNode[] => {
    const children = childrenMap.get(parentId) ?? [];
    return children
      .sort((a, b) => a.order_index - b.order_index)
      .map((group) => ({
        group,
        children: build(group.id),
      }));
  };

  return build(null);
}

// --- Tree item component ---
function GroupTreeItem({
  node,
  depth,
  activeId,
  onSelect,
  expandedIds,
  onToggleExpand,
}: {
  node: GroupTreeNode;
  depth: number;
  activeId: number;
  onSelect: (id: number) => void;
  expandedIds: Set<number>;
  onToggleExpand: (id: number) => void;
}) {
  const isActive = activeId === node.group.id;
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.group.id);
  const indent = 8 + depth * 16;

  return (
    <>
      <button
        type="button"
        onClick={() => onSelect(node.group.id)}
        className={cn(
          "w-full flex items-center gap-1.5 py-1.5 rounded-md text-xs transition-colors text-left group/item",
          isActive
            ? "bg-primary/15 text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
        style={{ paddingLeft: `${indent}px`, paddingRight: "8px" }}
      >
        {/* Expand/collapse chevron */}
        {hasChildren ? (
          <span
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(node.group.id);
            }}
            className="shrink-0 p-0.5 rounded hover:bg-muted-foreground/20 cursor-pointer"
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </span>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {/* Folder icon */}
        {isActive ? (
          <FolderOpen className="w-3.5 h-3.5 shrink-0 text-primary" />
        ) : (
          <Folder className="w-3.5 h-3.5 shrink-0" />
        )}

        {/* Name */}
        <span className={cn("truncate", isActive && "font-medium")}>
          {node.group.name}
        </span>

        {/* Element count */}
        {(node.group.elements_count ?? 0) > 0 && (
          <span className="ml-auto text-[10px] text-muted-foreground/60 shrink-0">
            {node.group.elements_count}
          </span>
        )}
      </button>

      {/* Children */}
      {hasChildren && isExpanded && (
        node.children.map((child) => (
          <GroupTreeItem
            key={child.group.id}
            node={child}
            depth={depth + 1}
            activeId={activeId}
            onSelect={onSelect}
            expandedIds={expandedIds}
            onToggleExpand={onToggleExpand}
          />
        ))
      )}
    </>
  );
}

export function ElementSelectionModal({
  isOpen,
  onClose,
  onConfirm,
  projectId,
  currentSceneId,
  max,
  min = 1,
  initialSelection = {},
  elementTypeFilter = "IMAGE",
  title,
}: ElementSelectionModalProps) {
  // Update global UI store for blocking scene dropzone
  const setModalOpen = useUIStore((s) => s.setElementSelectionModalOpen);

  useEffect(() => {
    setModalOpen(isOpen);
    return () => setModalOpen(false);
  }, [isOpen, setModalOpen]);

  // Local state for active scene in modal
  const [activeSceneId, setActiveSceneId] = useState(currentSceneId);

  // Local selection state by scene
  const [selectionByScene, setSelectionByScene] = useState<ModalSelectionByScene>({});

  // Local filter state
  const [filter, setFilter] = useState<ElementFilter>("all");

  // Expanded groups in tree
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  // Load all groups for the tree sidebar
  const scenes = useScenesStore((s) => s.scenes);
  const ensureScenesLoaded = useScenesStore((s) => s.ensureScenesLoaded);

  useEffect(() => {
    if (isOpen) void ensureScenesLoaded(projectId);
  }, [isOpen, projectId, ensureScenesLoaded]);

  // Build tree
  const groupTree = useMemo(() => buildGroupTree(scenes), [scenes]);

  // Auto-expand parent of current scene on open
  useEffect(() => {
    if (isOpen && currentSceneId) {
      const current = scenes.find((s) => s.id === currentSceneId);
      if (current?.parent) {
        setExpandedIds((prev) => new Set([...prev, current.parent!]));
      }
    }
  }, [isOpen, currentSceneId, scenes]);

  const handleToggleExpand = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Load elements for active scene
  const { elements, isLoading, loadElements } = useModalSceneElements();

  // Get scene workspace store for uploading files
  const { enqueueUploads } = useSceneWorkspaceStore();

  // Initialize selection when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveSceneId(currentSceneId);
      setFilter("all");
      const initial: ModalSelectionByScene = {};
      Object.entries(initialSelection).forEach(([sceneIdStr, elementIds]) => {
        const sceneId = Number(sceneIdStr);
        if (Array.isArray(elementIds) && elementIds.length > 0) {
          initial[sceneId] = elementIds;
        }
      });
      setSelectionByScene(initial);
    }
  }, [isOpen, currentSceneId, initialSelection]);

  // Load elements when active scene changes (0 = project root)
  useEffect(() => {
    if (isOpen && (activeSceneId || activeSceneId === 0)) {
      void loadElements(activeSceneId, projectId);
    }
  }, [isOpen, activeSceneId, projectId, loadElements]);

  // Calculate filter counts
  const filterCounts = useMemo(() => {
    const completedElements = elements.filter((e) => e.status === "COMPLETED" && e.element_type === elementTypeFilter);
    return {
      all: completedElements.length,
      favorites: completedElements.filter((e) => e.is_favorite).length,
      images: completedElements.filter((e) => e.element_type === "IMAGE").length,
      videos: completedElements.filter((e) => e.element_type === "VIDEO").length,
    };
  }, [elements, elementTypeFilter]);

  // Filter elements
  const filteredElements = useMemo(() => {
    return elements.filter((element) => {
      if (element.status !== "COMPLETED") return false;
      if (element.element_type !== elementTypeFilter) return false;
      if (filter === "favorites" && !element.is_favorite) return false;
      if (filter === "images" && element.element_type !== "IMAGE") return false;
      if (filter === "videos" && element.element_type !== "VIDEO") return false;
      return true;
    });
  }, [elements, elementTypeFilter, filter]);

  // Get selected IDs for current scene
  const selectedIdsForCurrentScene = useMemo(() => {
    return new Set(selectionByScene[activeSceneId] ?? []);
  }, [selectionByScene, activeSceneId]);

  // Calculate total selected count
  const totalSelectedCount = useMemo(() => {
    return Object.values(selectionByScene).reduce((sum, ids) => sum + ids.length, 0);
  }, [selectionByScene]);

  // Check if max reached
  const maxReached = max > 1 && totalSelectedCount >= max;

  // Toggle selection
  const handleToggle = useCallback(
    (elementId: number) => {
      setSelectionByScene((prev) => {
        const currentSceneIds = prev[activeSceneId] ?? [];
        const isSelected = currentSceneIds.includes(elementId);

        if (isSelected) {
          const updated = currentSceneIds.filter((id) => id !== elementId);
          if (updated.length === 0) {
            const { [activeSceneId]: _, ...rest } = prev;
            return rest;
          }
          return { ...prev, [activeSceneId]: updated };
        } else {
          if (max === 1) {
            return { [activeSceneId]: [elementId] };
          } else if (totalSelectedCount < max) {
            return { ...prev, [activeSceneId]: [...currentSceneIds, elementId] };
          } else {
            toast.warning(`Максимум ${max} элементов`);
            return prev;
          }
        }
      });
    },
    [activeSceneId, max, totalSelectedCount]
  );

  // Cache for elements from visited scenes
  const [elementsCache, setElementsCache] = useState<Record<number, Element[]>>({});

  useEffect(() => {
    if (elements.length > 0) {
      setElementsCache((prev) => ({ ...prev, [activeSceneId]: elements }));
    }
  }, [elements, activeSceneId]);

  // Get all selected elements from cache
  const allSelectedElements = useMemo(() => {
    const result: Element[] = [];
    const seenIds = new Set<number>();

    Object.entries(selectionByScene).forEach(([sceneIdStr, elementIds]) => {
      const sceneId = Number(sceneIdStr);
      const sceneElements = elementsCache[sceneId] ?? [];

      sceneElements.forEach((element) => {
        if (elementIds.includes(element.id) && !seenIds.has(element.id)) {
          result.push(element);
          seenIds.add(element.id);
        }
      });
    });

    return result;
  }, [selectionByScene, elementsCache]);

  // Handle file drop/upload
  const handleFileDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const validFiles: File[] = [];
      for (const file of acceptedFiles) {
        const fileSizeMB = file.size / (1024 * 1024);
        if (fileSizeMB > MAX_FILE_SIZE_MB) {
          toast.error(`Файл "${file.name}" слишком большой (макс. ${MAX_FILE_SIZE_MB} МБ)`);
          continue;
        }
        validFiles.push(file);
      }

      if (validFiles.length === 0) return;

      enqueueUploads(activeSceneId, validFiles);
      setTimeout(() => {
        void loadElements(activeSceneId, projectId);
      }, 500);
    },
    [activeSceneId, projectId, enqueueUploads, loadElements]
  );

  // Dropzone setup
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: handleFileDrop,
    accept: {
      "image/*": [".jpg", ".jpeg", ".png", ".webp", ".gif"],
      "video/*": [".mp4", ".webm", ".mov"],
    },
    noClick: true,
    noKeyboard: true,
  });

  // Handle confirm
  const handleConfirm = useCallback(() => {
    if (totalSelectedCount < min) return;
    onConfirm(allSelectedElements);
    onClose();
  }, [totalSelectedCount, min, allSelectedElements, onConfirm, onClose]);

  // Handle close
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Active group name
  const activeGroup = scenes.find((s) => s.id === activeSceneId);

  // Modal title
  const modalTitle = title || (max === 1 ? "Выбор элемента" : "Выбор элементов");
  const isValidSelection = totalSelectedCount >= min;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent showCloseButton={false} className="sm:max-w-5xl p-0 gap-0 overflow-hidden flex flex-col h-[85vh]">
        {/* Header with title, upload button, and close */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="text-lg font-semibold">{modalTitle}</DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={open}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Загрузить файлы
              </Button>
              <DialogClose asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
            </div>
          </div>
        </DialogHeader>

        {/* Body: sidebar + content */}
        <div className="flex flex-1 min-h-0">
          {/* Sidebar: group tree */}
          <div className="w-48 shrink-0 border-r bg-muted/30 overflow-y-auto py-2 px-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-2 mb-1.5">
              Группы
            </p>
            {/* Project root entry */}
            <button
              type="button"
              onClick={() => setActiveSceneId(0)}
              className={cn(
                "w-full flex items-center gap-1.5 py-1.5 rounded-md text-xs transition-colors text-left",
                activeSceneId === 0
                  ? "bg-primary/15 text-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              style={{ paddingLeft: "8px", paddingRight: "8px" }}
            >
              <span className="w-4 shrink-0" />
              <FileImage className={cn("w-3.5 h-3.5 shrink-0", activeSceneId === 0 && "text-primary")} />
              <span className="truncate">Корень проекта</span>
            </button>

            {groupTree.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-4">Нет групп</p>
            ) : (
              groupTree.map((node) => (
                <GroupTreeItem
                  key={node.group.id}
                  node={node}
                  depth={0}
                  activeId={activeSceneId}
                  onSelect={setActiveSceneId}
                  expandedIds={expandedIds}
                  onToggleExpand={handleToggleExpand}
                />
              ))
            )}
          </div>

          {/* Right side: filters + grid */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Active group name + filters */}
            <div className="px-4 py-2.5 border-b shrink-0 flex items-center gap-3">
              <div className="flex items-center gap-1.5 mr-2">
                {activeSceneId === 0 ? (
                  <FileImage className="w-3.5 h-3.5 text-muted-foreground" />
                ) : (
                  <Folder className="w-3.5 h-3.5 text-muted-foreground" />
                )}
                <span className="text-sm font-medium truncate max-w-[200px]">
                  {activeSceneId === 0 ? "Корень проекта" : (activeGroup?.name ?? "...")}
                </span>
              </div>
              <ElementFilters
                filter={filter}
                onFilterChange={setFilter}
                counts={filterCounts}
              />
            </div>

            {/* Grid with elements - dropzone area */}
            <div
              className={cn(
                "flex-1 overflow-auto p-4 relative min-h-[350px]",
                isDragActive && "bg-primary/5"
              )}
              {...getRootProps()}
            >
              <input {...getInputProps()} />

              {isLoading ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mr-3" />
                  Загрузка...
                </div>
              ) : filteredElements.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Нет элементов
                </div>
              ) : (
                <ElementSelectionGrid
                  elements={filteredElements}
                  selectedIds={selectedIdsForCurrentScene}
                  onToggle={handleToggle}
                  maxReached={maxReached}
                />
              )}

              {/* Drag overlay */}
              {isDragActive && (
                <div className="absolute inset-0 z-50 border-2 border-dashed border-primary bg-primary/5 flex items-center justify-center pointer-events-none">
                  <div className="flex flex-col items-center gap-3">
                    <Upload className="h-10 w-10 text-primary animate-pulse" />
                    <p className="text-lg font-medium text-primary">Отпустите файлы для загрузки</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t shrink-0 flex items-center justify-between sm:justify-between">
          <span className="text-sm text-muted-foreground">
            Выбрано: {totalSelectedCount} из {max}
            {min > 0 && totalSelectedCount < min && (
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
