"use client";

import { useEffect, useState, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { Plus, Clapperboard } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { SceneCard } from "./SceneCard";
import { CreateSceneDialog } from "./CreateSceneDialog";
import { DisplaySettingsPopover } from "@/components/display/DisplaySettingsPopover";
import { useScenesStore } from "@/lib/store/scenes";
import { useDisplayStore } from "@/lib/store/project-display";
import { projectsApi } from "@/lib/api/projects";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { DISPLAY_GRID_CONFIG, ASPECT_RATIO_CLASSES, FIT_MODE_CLASSES, CARD_SIZES } from "@/lib/utils/constants";
import type { DisplayCardSize, DisplayAspectRatio } from "@/lib/types";

// Helper для получения минимальной ширины карточки
function getMinCardWidth(size: DisplayCardSize, aspectRatio: DisplayAspectRatio): number {
  return CARD_SIZES[size][aspectRatio].width;
}
import type { Project } from "@/lib/types";

interface ScenarioTableClientProps {
  projectId: number;
}

function pluralizeScenes(count: number): string {
  if (count === 1) return "группа";
  if (count >= 2 && count <= 4) return "группы";
  return "групп";
}

export function ScenarioTableClient({ projectId }: ScenarioTableClientProps) {
  const { scenes, isLoading, loadScenes, reorderScenes, setScenes } = useScenesStore();
  const { preferences, hydratePreferences } = useDisplayStore();
  const [createOpen, setCreateOpen] = useState(false);
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    loadScenes(projectId);
    projectsApi.getById(projectId).then(setProject).catch(() => null);
    hydratePreferences();
  }, [projectId, loadScenes, hydratePreferences]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = scenes.findIndex((s) => s.id === active.id);
      const newIndex = scenes.findIndex((s) => s.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      
      // Optimistic update: reorder and update order_index
      const reordered = arrayMove(scenes, oldIndex, newIndex).map((s, index) => ({
        ...s,
        order_index: index,
      }));
      setScenes(reordered);
      
      try {
        await reorderScenes(projectId, reordered.map((s) => s.id));
      } catch {
        toast.error("Не удалось сохранить порядок");
        // Rollback to original order
        setScenes(scenes.map((s, index) => ({ ...s, order_index: index })));
      }
    },
    [scenes, projectId, reorderScenes, setScenes]
  );

  // Get display configuration в зависимости от size И aspect ratio
  const gridConfig = DISPLAY_GRID_CONFIG[preferences.size][preferences.aspectRatio];
  const aspectClass = ASPECT_RATIO_CLASSES[preferences.aspectRatio];
  const fitClass = FIT_MODE_CLASSES[preferences.fitMode];

  return (
    <>
      {/* Header: breadcrumbs + create group + display settings */}
      <div className="flex items-center justify-between border-b px-4 py-2 bg-surface shrink-0">
        <div className="flex items-center gap-1 min-w-0">
          <Breadcrumbs
            projectName={project?.name}
            suffix={!isLoading ? `· ${scenes.length} ${pluralizeScenes(scenes.length)}` : undefined}
          />
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 h-7 px-3 ml-3 rounded text-xs font-medium text-primary bg-card hover:bg-card/80 transition-colors shrink-0"
          >
            <Plus className="h-4 w-4" />
            Добавить группу
          </button>
        </div>
        <DisplaySettingsPopover />
      </div>

      {/* Grid - full width, no max-width limit, with display preferences */}
      <div className="flex-1 overflow-auto px-4 py-6">
        {isLoading ? (
          <div 
            className={cn("grid", gridConfig.gap)}
            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${getMinCardWidth(preferences.size, preferences.aspectRatio)}px, 1fr))` }}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <SceneCardSkeleton key={i} aspectClass={aspectClass} />
            ))}
          </div>
        ) : scenes.length === 0 ? (
          <EmptyState onCreateClick={() => setCreateOpen(true)} />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={scenes.map((s) => s.id)} strategy={rectSortingStrategy}>
              <div 
                className={cn("grid", gridConfig.gap)}
                style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${getMinCardWidth(preferences.size, preferences.aspectRatio)}px, 1fr))` }}
              >
                {scenes.map((scene, index) => (
                  <SceneCard 
                    key={scene.id} 
                    scene={scene} 
                    projectId={projectId} 
                    index={index}
                    aspectClass={aspectClass}
                    fitClass={fitClass}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <CreateSceneDialog projectId={projectId} open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

function SceneCardSkeleton({ aspectClass = "aspect-video" }: { aspectClass?: string }) {
  return (
    <div className="rounded-md overflow-hidden border border-border bg-card">
      <Skeleton className={cn("w-full", aspectClass)} />
      <div className="p-3 flex items-center justify-between">
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <Skeleton className="h-7 w-7 rounded" />
      </div>
    </div>
  );
}

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-muted mb-6">
        <Clapperboard className="h-10 w-10 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold mb-2">Нет групп</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs">
        Добавьте первую группу, чтобы начать наполнять раскадровку.
      </p>
      <Button onClick={onCreateClick}>
        <Plus className="h-4 w-4 mr-2" />
        Добавить группу
      </Button>
    </div>
  );
}
