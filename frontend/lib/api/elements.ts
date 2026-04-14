import { apiClient, normalizeError } from "./client";
import type {
  Element,
  UpdateElementPayload,
  ReorderElementsPayload,
  DownloadMetaResponse,
} from "@/lib/types";

export const elementsApi = {
  async getByScene(
    sceneId: number,
    options?: { signal?: AbortSignal }
  ): Promise<Element[]> {
    try {
      const { data } = await apiClient.get<Element[]>("/api/elements/", {
        params: { scene: sceneId },
        signal: options?.signal,
      });
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async getById(id: number): Promise<Element> {
    try {
      const { data } = await apiClient.get<Element>(`/api/elements/${id}/`);
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async update(id: number, payload: UpdateElementPayload): Promise<Element> {
    try {
      const { data } = await apiClient.patch<Element>(
        `/api/elements/${id}/`,
        payload
      );
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async delete(id: number): Promise<void> {
    try {
      await apiClient.delete(`/api/elements/${id}/`);
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async reorder(sceneId: number, payload: ReorderElementsPayload): Promise<void> {
    try {
      await apiClient.post("/api/elements/reorder/", {
        scene: sceneId,
        ...payload,
      });
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async getByProject(
    projectId: number,
    rootOnly?: boolean,
    options?: { signal?: AbortSignal }
  ): Promise<Element[]> {
    try {
      const params: Record<string, string> = { project: String(projectId) };
      if (rootOnly) params["scene__isnull"] = "true";
      const { data } = await apiClient.get<Element[]>("/api/elements/", {
        params,
        signal: options?.signal,
      });
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async move(payload: {
    element_ids?: number[];
    group_ids?: number[];
    target_scene: number | null;
  }): Promise<void> {
    try {
      await apiClient.post("/api/elements/move/", payload);
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async getDownloadMeta(params: { projectId?: number; sceneId?: number }): Promise<DownloadMetaResponse> {
    try {
      const query = params.projectId
        ? `project_id=${params.projectId}`
        : `scene_id=${params.sceneId}`
      const { data } = await apiClient.get<DownloadMetaResponse>(
        `/api/elements/download-meta/?${query}`
      );
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async toggleFavorite(id: number, isFavorite: boolean): Promise<Element> {
    try {
      const { data } = await apiClient.patch<Element>(`/api/elements/${id}/`, {
        is_favorite: isFavorite,
      });
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },
};
