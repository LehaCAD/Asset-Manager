import { apiClient, normalizeError } from "./client";
import type {
  Project,
  CreateProjectPayload,
  UpdateProjectPayload,
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
};
