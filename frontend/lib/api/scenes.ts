import { LONG_API_TIMEOUT_MS, apiClient, normalizeError } from "./client";
import type {
  Scene,
  Element,
  CreateScenePayload,
  UpdateScenePayload,
  ReorderScenesPayload,
  GeneratePayload,
} from "@/lib/types";

export const scenesApi = {
  async getByProject(projectId: number): Promise<Scene[]> {
    try {
      const { data } = await apiClient.get<Scene[]>("/api/scenes/", {
        params: { project: projectId },
      });
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async getById(id: number, options?: { signal?: AbortSignal }): Promise<Scene> {
    try {
      const { data } = await apiClient.get<Scene>(`/api/scenes/${id}/`, {
        signal: options?.signal,
      });
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async create(payload: CreateScenePayload): Promise<Scene> {
    try {
      const { data } = await apiClient.post<Scene>("/api/scenes/", payload);
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async update(id: number, payload: UpdateScenePayload): Promise<Scene> {
    try {
      const { data } = await apiClient.patch<Scene>(
        `/api/scenes/${id}/`,
        payload
      );
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async delete(id: number): Promise<void> {
    try {
      await apiClient.delete(`/api/scenes/${id}/`);
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async reorder(projectId: number, payload: ReorderScenesPayload): Promise<void> {
    try {
      await apiClient.post(`/api/scenes/reorder/`, {
        project: projectId,
        ...payload,
      });
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async getChildren(
    projectId: number,
    parentId?: number | null
  ): Promise<Scene[]> {
    try {
      const params: Record<string, string> = { project: String(projectId) };
      if (parentId === null || parentId === undefined) {
        params["parent__isnull"] = "true";
      } else {
        params["parent"] = String(parentId);
      }
      const { data } = await apiClient.get<Scene[]>("/api/scenes/", {
        params,
      });
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async getDeleteInfo(
    sceneId: number
  ): Promise<{
    element_count: number;
    children_count: number;
    child_element_count: number;
    total_elements_affected: number;
  }> {
    try {
      const { data } = await apiClient.get(
        `/api/scenes/${sceneId}/delete-info/`
      );
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async setHeadliner(sceneId: number, elementId: number | null): Promise<Scene> {
    try {
      const { data } = await apiClient.post<Scene>(
        `/api/scenes/${sceneId}/set_headliner/`,
        { element_id: elementId }
      );
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async generate(sceneId: number, payload: GeneratePayload): Promise<Element> {
    try {
      const { data } = await apiClient.post<Element>(
        `/api/scenes/${sceneId}/generate/`,
        payload,
        { timeout: LONG_API_TIMEOUT_MS }
      );
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async upload(
    sceneId: number,
    file: File,
    options?: { prompt_text?: string; is_favorite?: boolean; signal?: AbortSignal }
  ): Promise<Element> {
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (options?.prompt_text) formData.append("prompt_text", options.prompt_text);
      if (options?.is_favorite !== undefined) formData.append("is_favorite", String(options.is_favorite));

      const { data } = await apiClient.post<Element>(
        `/api/scenes/${sceneId}/upload/`,
        formData,
        {
          timeout: LONG_API_TIMEOUT_MS,
          headers: { "Content-Type": "multipart/form-data" },
          signal: options?.signal,
        }
      );
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },
};
