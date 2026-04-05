"use client";

import { useCallback, useState } from "react";
import { elementsApi } from "@/lib/api/elements";
import type { Element } from "@/lib/types";

interface UseModalSceneElementsResult {
  elements: Element[];
  isLoading: boolean;
  error: string | null;
  loadElements: (sceneId: number, projectId?: number) => Promise<void>;
}

/**
 * sceneId === 0 means "project root" (elements with scene=null).
 * In that case projectId is required.
 */
export function useModalSceneElements(): UseModalSceneElementsResult {
  const [elements, setElements] = useState<Element[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadElements = useCallback(async (sceneId: number, projectId?: number) => {
    setIsLoading(true);
    setError(null);
    try {
      let data: Element[];
      if (sceneId === 0 && projectId) {
        data = await elementsApi.getByProject(projectId, true);
      } else {
        data = await elementsApi.getByScene(sceneId);
      }
      setElements(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setElements([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    elements,
    isLoading,
    error,
    loadElements,
  };
}
