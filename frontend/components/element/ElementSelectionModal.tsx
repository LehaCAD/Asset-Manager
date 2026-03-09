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
import { SceneNavigation } from "./SceneNavigation";
import { useSceneNeighbors } from "@/lib/hooks/use-scene-neighbors";
import { useModalSceneElements } from "@/lib/hooks/use-modal-scene-elements";
import { useSceneWorkspaceStore } from "@/lib/store/scene-workspace";
import { useUIStore } from "@/lib/store/ui";
import { toast } from "sonner";
import { Upload, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_FILE_SIZE_MB } from "@/lib/utils/constants";
import type { Element, ElementType, ModalSelectionByScene, ElementFilter } from "@/lib/types";

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

const filterTabs: { value: ElementFilter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "favorites", label: "★ Избранное" },
  { value: "images", label: "Изображения" },
  { value: "videos", label: "Видео" },
];

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

  // Load scene neighbors for navigation
  const {
    previousScene,
    nextScene,
    currentScene,
    currentIndex,
    total,
    isReady,
  } = useSceneNeighbors({ projectId, sceneId: activeSceneId, autoLoad: true });

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

  // Load elements when active scene changes
  useEffect(() => {
    if (isOpen && activeSceneId) {
      void loadElements(activeSceneId);
    }
  }, [isOpen, activeSceneId, loadElements]);

  // Handle scene navigation within modal
  const handleSceneNavigate = useCallback((sceneId: number) => {
    setActiveSceneId(sceneId);
  }, []);

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
        void loadElements(activeSceneId);
      }, 500);
    },
    [activeSceneId, enqueueUploads, loadElements]
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

  // Modal title
  const modalTitle = title || (max === 1 ? "Выбор элемента" : "Выбор элементов");
  const isValidSelection = totalSelectedCount >= min;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent showCloseButton={false} className="sm:max-w-5xl p-0 gap-0 overflow-hidden flex flex-col max-h-[85vh]">
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

        {/* Scene navigation */}
        {isReady && (
          <div className="px-6 py-3 border-b bg-muted/30 shrink-0">
            <div className="flex items-center justify-center">
              <SceneNavigation
                previousScene={previousScene}
                nextScene={nextScene}
                currentScene={currentScene}
                currentIndex={currentIndex}
                total={total}
                onNavigate={handleSceneNavigate}
              />
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="px-6 py-3 border-b shrink-0">
          <div className="flex items-center gap-1">
            {filterTabs.map((tab) => (
              <Button
                key={tab.value}
                variant={filter === tab.value ? "default" : "ghost"}
                size="sm"
                onClick={() => setFilter(tab.value)}
                className="h-8 px-3"
              >
                {tab.label} ({filterCounts[tab.value]})
              </Button>
            ))}
          </div>
        </div>

        {/* Grid with elements - dropzone area */}
        <div 
          className={cn(
            "flex-1 overflow-auto p-6 relative min-h-[400px]",
            isDragActive && "bg-primary/5"
          )}
          {...getRootProps()}
        >
          <input {...getInputProps()} />
          
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mr-3" />
              Загрузка элементов...
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
            <div className="fixed inset-0 z-50 border-2 border-dashed border-primary bg-primary/5 flex items-center justify-center pointer-events-none">
              <div className="flex flex-col items-center gap-3">
                <Upload className="h-10 w-10 text-primary animate-pulse" />
                <p className="text-lg font-medium text-primary">Отпустите файлы для загрузки</p>
                <p className="text-sm text-muted-foreground">JPG, PNG, MP4, MOV</p>
              </div>
            </div>
          )}
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
