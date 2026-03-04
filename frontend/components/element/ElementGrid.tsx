"use client";

import { useCallback, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDropzone } from "react-dropzone";
import { useSceneWorkspaceStore } from "@/lib/store/scene-workspace";
import { useAuthStore } from "@/lib/store/auth";
import { ElementCard } from "@/components/element/ElementCard";
import { ElementCardSkeleton } from "@/components/element/ElementCardSkeleton";
import { EmptyState } from "@/components/element/EmptyState";
import { cn } from "@/lib/utils";
import { GRID_DENSITY_CONFIG, MAX_FILE_SIZE_MB } from "@/lib/utils/constants";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import type { Element, GridDensity } from "@/lib/types";

interface ElementGridProps {
  className?: string;
  onRequestDelete: (ids: number[]) => void;
}

interface SortableElementCardProps {
  element: Element;
  index: number;
  density: GridDensity;
  isSelected: boolean;
  isMultiSelectMode: boolean;
  onSelect: (id: number, addToSelection: boolean) => void;
  onOpenLightbox: (id: number) => void;
  onToggleFavorite: (id: number) => void;
  onDelete: (id: number) => void;
}

function SortableElementCard({
  element,
  index,
  ...cardProps
}: SortableElementCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: element.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <ElementCard element={element} index={index} {...cardProps} />
    </div>
  );
}

export function ElementGrid({ className, onRequestDelete }: ElementGridProps) {
  const {
    scene,
    elements,
    getFilteredElements,
    selectedIds,
    isMultiSelectMode,
    isLoading,
    density,
    // actions
    selectElement,
    openLightbox,
    toggleFavorite,
    reorderElements,
    enqueueUploads,
  } = useSceneWorkspaceStore();
  const user = useAuthStore((state) => state.user);

  const filteredElements = getFilteredElements();

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  // Handle drag end
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = filteredElements.findIndex((e) => e.id === active.id);
      const newIndex = filteredElements.findIndex((e) => e.id === over.id);

      if (oldIndex === -1 || newIndex === -1) return;

      // Build new order
      const newElements = [...filteredElements];
      const [moved] = newElements.splice(oldIndex, 1);
      newElements.splice(newIndex, 0, moved);

      reorderElements(newElements.map((e) => e.id));
    },
    [filteredElements, reorderElements]
  );

  // File drop handler
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

      // const maxElementsPerScene = user?.quota?.max_elements_per_scene;
      // if (typeof maxElementsPerScene !== "number") {
      //   toast.info("Проверяю лимиты аккаунта, повторите загрузку через секунду");
      //   return;
      // }
      // const remainingSlots =
      //   Math.max(0, maxElementsPerScene - elements.length);
      // if (remainingSlots === 0) {
      //   toast.error(`Достигнут лимит элементов в сцене (${maxElementsPerScene})`);
      //   return;
      // }
      // const filesToUpload = validFiles.slice(0, remainingSlots);
      // if (filesToUpload.length < validFiles.length) {
      //   toast.info(
      //     `Лимит сцены: загружаю ${filesToUpload.length} из ${validFiles.length}`
      //   );
      // }
      const filesToUpload = validFiles;

      enqueueUploads(scene.id, filesToUpload);
    },
    [scene, enqueueUploads]
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

  // Empty state upload handler
  const handleUploadClick = useCallback(() => {
    open();
  }, [open]);

  // Card callbacks
  const cardCallbacks = useMemo(
    () => ({
      onSelect: selectElement,
      onOpenLightbox: openLightbox,
      onToggleFavorite: toggleFavorite,
      onDelete: (id: number) => onRequestDelete([id]),
    }),
    [selectElement, openLightbox, toggleFavorite, onRequestDelete]
  );

  // Loading state
  if (isLoading) {
    return (
      <div
        className={cn(
          "element-grid",
          className
        )}
        style={{
          "--card-min-size": GRID_DENSITY_CONFIG[density].minSize,
          "--grid-gap": GRID_DENSITY_CONFIG[density].gap,
        } as React.CSSProperties}
      >
        <div
          className="grid"
          style={{
            gridTemplateColumns:
              "repeat(auto-fill, minmax(var(--card-min-size), 1fr))",
            gap: "var(--grid-gap)",
          }}
        >
          {Array.from({ length: 12 }).map((_, i) => (
            <ElementCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (filteredElements.length === 0 && !isLoading) {
    return (
      <div className={cn("relative", className)} {...getRootProps()}>
        <input {...getInputProps()} />
        <EmptyState onUploadClick={handleUploadClick} />
        {isDragActive && (
          <div className="absolute inset-0 z-50 border-2 border-dashed border-primary bg-primary/5 rounded-xl flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Upload className="h-10 w-10 text-primary" />
              <p className="text-lg font-medium">Перетащите файлы сюда</p>
              <p className="text-sm text-muted-foreground">JPG, PNG, MP4, MOV</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn("element-grid relative", className)}
      {...getRootProps()}
      style={{
        "--card-min-size": GRID_DENSITY_CONFIG[density].minSize,
        "--grid-gap": GRID_DENSITY_CONFIG[density].gap,
      } as React.CSSProperties}
    >
      <input {...getInputProps()} />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={filteredElements.map((e) => e.id)}
          strategy={rectSortingStrategy}
          disabled={isMultiSelectMode}
        >
          <div
            className="grid"
            style={{
              gridTemplateColumns:
                "repeat(auto-fill, minmax(var(--card-min-size), 1fr))",
              gap: "var(--grid-gap)",
            }}
          >
            {filteredElements.map((element, index) => (
              <SortableElementCard
                key={element.id}
                element={element}
                index={index}
                density={density}
                isSelected={selectedIds.has(element.id)}
                isMultiSelectMode={isMultiSelectMode}
                {...cardCallbacks}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Drag overlay */}
      {isDragActive && (
        <div className="absolute inset-0 z-50 border-2 border-dashed border-primary bg-primary/5 rounded-xl flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Upload className="h-10 w-10 text-primary" />
            <p className="text-lg font-medium">Перетащите файлы сюда</p>
            <p className="text-sm text-muted-foreground">JPG, PNG, MP4, MOV</p>
          </div>
        </div>
      )}
    </div>
  );
}
