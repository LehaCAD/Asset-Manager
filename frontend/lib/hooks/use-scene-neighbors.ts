"use client";

import { useEffect, useMemo } from "react";
import { useScenesStore } from "@/lib/store/scenes";

interface UseSceneNeighborsArgs {
  projectId: number;
  sceneId: number;
  autoLoad?: boolean;
}

export function useSceneNeighbors({
  projectId,
  sceneId,
  autoLoad = true,
}: UseSceneNeighborsArgs) {
  const scenes = useScenesStore((state) => state.scenes);
  const storeProjectId = useScenesStore((state) => state.projectId);
  const isLoading = useScenesStore((state) => state.isLoading);
  const ensureScenesLoaded = useScenesStore((state) => state.ensureScenesLoaded);

  useEffect(() => {
    if (!autoLoad) {
      return;
    }

    void ensureScenesLoaded(projectId);
  }, [autoLoad, ensureScenesLoaded, projectId]);

  const neighbors = useMemo(() => {
    const sortedScenes = [...scenes].sort((a, b) => a.order_index - b.order_index);
    const currentIndex = sortedScenes.findIndex((scene) => scene.id === sceneId);

    return {
      currentScene: currentIndex >= 0 ? sortedScenes[currentIndex] ?? null : null,
      previousScene: currentIndex > 0 ? sortedScenes[currentIndex - 1] ?? null : null,
      nextScene:
        currentIndex >= 0 && currentIndex < sortedScenes.length - 1
          ? sortedScenes[currentIndex + 1] ?? null
          : null,
      currentIndex,
      total: sortedScenes.length,
      isReady: storeProjectId === projectId && sortedScenes.length > 0,
      isLoading,
    };
  }, [isLoading, projectId, sceneId, scenes, storeProjectId]);

  return neighbors;
}
