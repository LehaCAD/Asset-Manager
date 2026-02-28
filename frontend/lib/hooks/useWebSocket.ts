"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { wsManager } from "@/lib/api/websocket";
import type { WSEvent } from "@/lib/types";

/**
 * Connects to the project WebSocket when mounted, disconnects on unmount.
 * On element_status_changed: invalidates ['elements', sceneId] cache.
 */
export function useWebSocket(projectId: number | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!projectId) return;

    wsManager.connect(projectId);

    const unsubscribe = wsManager.on((event: WSEvent) => {
      if (event.type === "element_status_changed") {
        void queryClient.invalidateQueries({
          queryKey: ["elements", event.scene_id],
        });

        if (event.status === "COMPLETED") {
          toast.success("Генерация завершена");
        } else if (event.status === "FAILED") {
          toast.error(
            event.error_message
              ? `Ошибка генерации: ${event.error_message}`
              : "Ошибка генерации"
          );
        }
      }
    });

    return () => {
      unsubscribe();
      wsManager.disconnect();
    };
  }, [projectId, queryClient]);
}
