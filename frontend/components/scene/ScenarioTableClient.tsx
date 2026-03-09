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
import { SceneCard } from "./SceneCard";
import { CreateSceneDialog } from "./CreateSceneDialog";
import { useScenesStore } from "@/lib/store/scenes";
import { projectsApi } from "@/lib/api/projects";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import type { Project } from "@/lib/types";

interface ScenarioTableClientProps {
  projectId: number;
}

function pluralizeScenes(count: number): string {
  if (count === 1) return "сцена";
  if (count >= 2 && count <= 4) return "сцены";
  return "сцен";
}

export function ScenarioTableClient({ projectId }: ScenarioTableClientProps) {
  const { scenes, isLoading, loadScenes, reorderScenes, setScenes } = useScenesStore();
  const [createOpen, setCreateOpen] = useState(false);
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    loadScenes(projectId);
    projectsApi.getById(projectId).then(setProject).catch(() => null);
  }, [projectId, loadScenes]);

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
      const reordered = arrayMove(scenes, oldIndex, newIndex);
      setScenes(reordered);
      try {
        await reorderScenes(projectId, reordered.map((s) => s.id));
      } catch {
        toast.error("Не удалось сохранить порядок");
        setScenes(scenes);
      }
    },
    [scenes, projectId, reorderScenes, setScenes]
  );

  return (
    <>
      {/* Header: breadcrumbs + count + button (all left-aligned) */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-4 px-4 py-3">
          <Breadcrumbs 
            projectName={project?.name} 
            suffix={!isLoading ? `· ${scenes.length} ${pluralizeScenes(scenes.length)}` : undefined}
          />
          <Button onClick={() => setCreateOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Добавить сцену
          </Button>
        </div>
      </div>

      {/* Grid - full width, no max-width limit */}
      <div className="flex-1 overflow-auto px-4 py-6">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SceneCardSkeleton key={i} />
            ))}
          </div>
        ) : scenes.length === 0 ? (
          <EmptyState onCreateClick={() => setCreateOpen(true)} />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={scenes.map((s) => s.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                {scenes.map((scene, index) => (
                  <SceneCard key={scene.id} scene={scene} projectId={projectId} index={index} />
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

function SceneCardSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden border border-border bg-card">
      <Skeleton className="aspect-video w-full" />
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
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-muted mb-6">
        <Clapperboard className="h-10 w-10 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold mb-2">Нет сцен</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs">
        Добавьте первую сцену, чтобы начать наполнять раскадровку.
      </p>
      <Button onClick={onCreateClick}>
        <Plus className="h-4 w-4 mr-2" />
        Добавить сцену
      </Button>
    </div>
  );
}
