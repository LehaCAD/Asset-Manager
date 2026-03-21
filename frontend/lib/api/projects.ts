import { LONG_API_TIMEOUT_MS, apiClient, normalizeError } from "./client";
import type {
  Project,
  Element,
  CreateProjectPayload,
  UpdateProjectPayload,
  GeneratePayload,
  ReorderItem,
  ProjectStats,
} from "@/lib/types";

export const projectsApi = {
  async getAll(): Promise<Project[]> {
    try {
      const { data } = await apiClient.get<Project[]>("/api/projects/");
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async getById(id: number): Promise<Project> {
    try {
      const { data } = await apiClient.get<Project>(`/api/projects/${id}/`);
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async create(payload: CreateProjectPayload): Promise<Project> {
    try {
      const { data } = await apiClient.post<Project>("/api/projects/", payload);
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async update(id: number, payload: UpdateProjectPayload): Promise<Project> {
    try {
      const { data } = await apiClient.patch<Project>(
        `/api/projects/${id}/`,
        payload
      );
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async delete(id: number): Promise<void> {
    try {
      await apiClient.delete(`/api/projects/${id}/`);
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async generateInProject(projectId: number, payload: GeneratePayload): Promise<Element> {
    try {
      const { data } = await apiClient.post<Element>(
        `/api/projects/${projectId}/generate/`,
        payload,
        { timeout: LONG_API_TIMEOUT_MS }
      );
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async uploadToProject(
    projectId: number,
    file: File,
    options?: { prompt_text?: string; is_favorite?: boolean; signal?: AbortSignal }
  ): Promise<Element> {
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (options?.prompt_text) formData.append("prompt_text", options.prompt_text);
      if (options?.is_favorite) formData.append("is_favorite", "true");
      const { data } = await apiClient.post<Element>(
        `/api/projects/${projectId}/upload/`,
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

  async getStats(projectId: number): Promise<ProjectStats> {
    try {
      const { data } = await apiClient.get<ProjectStats>(`/api/projects/${projectId}/stats/`);
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async reorderItems(projectId: number, items: ReorderItem[]): Promise<void> {
    try {
      await apiClient.post(`/api/projects/${projectId}/reorder-items/`, {
        item_order: items,
      });
    } catch (error) {
      throw normalizeError(error);
    }
  },
};
