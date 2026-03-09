"use client";

import { useCallback, useEffect, useState } from "react";
import { elementsApi } from "@/lib/api/elements";
import type { Element } from "@/lib/types";

interface UseModalSceneElementsResult {
  elements: Element[];
  isLoading: boolean;
  error: string | null;
  loadElements: (sceneId: number) => Promise<void>;
}

export function useModalSceneElements(): UseModalSceneElementsResult {
  const [elements, setElements] = useState<Element[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadElements = useCallback(async (sceneId: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await elementsApi.getByScene(sceneId);
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
