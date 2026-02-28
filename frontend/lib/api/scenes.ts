import { apiClient, normalizeError } from "./client";
import type {
  Scene,
  CreateScenePayload,
  UpdateScenePayload,
  ReorderScenesPayload,
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

  async getById(id: number): Promise<Scene> {
    try {
      const { data } = await apiClient.get<Scene>(`/api/scenes/${id}/`);
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

  async setHeadliner(sceneId: number, elementId: number | null): Promise<Scene> {
    try {
      const { data } = await apiClient.patch<Scene>(`/api/scenes/${sceneId}/`, {
        headliner: elementId,
      });
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },
};
