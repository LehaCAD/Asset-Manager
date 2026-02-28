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

interface SceneGridProps {
  projectId: number;
  projectName?: string;
}

export function SceneGrid({ projectId, projectName }: SceneGridProps) {
  const { scenes, isLoading, loadScenes, reorderScenes, setScenes } =
    useScenesStore();
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    loadScenes(projectId);
  }, [projectId, loadScenes]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
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
    <div className="px-4 py-8 max-w-[1800px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {projectName ?? "Сценарный стол"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isLoading
              ? "Загрузка..."
              : scenes.length === 0
              ? "Добавьте первую сцену"
              : `${scenes.length} ${scenesLabel(scenes.length)} · перетащите для изменения порядка`}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Добавить сцену
        </Button>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SceneCardSkeleton key={i} />
          ))}
        </div>
      ) : scenes.length === 0 ? (
        <EmptyState onCreateClick={() => setCreateOpen(true)} />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={scenes.map((s) => s.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {scenes.map((scene, index) => (
                <SceneCard
                  key={scene.id}
                  scene={scene}
                  projectId={projectId}
                  index={index}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <CreateSceneDialog
        projectId={projectId}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </div>
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

function scenesLabel(count: number): string {
  if (count === 1) return "сцена";
  if (count >= 2 && count <= 4) return "сцены";
  return "сцен";
}
