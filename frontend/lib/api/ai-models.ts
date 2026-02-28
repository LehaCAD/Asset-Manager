import { apiClient, normalizeError } from "./client";
import type { AIModel, ModelType } from "@/lib/types";

export const aiModelsApi = {
  async getAll(modelType?: ModelType): Promise<AIModel[]> {
    try {
      const { data } = await apiClient.get<AIModel[]>("/api/ai-models/", {
        params: modelType ? { model_type: modelType } : undefined,
      });
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async getById(id: number): Promise<AIModel> {
    try {
      const { data } = await apiClient.get<AIModel>(`/api/ai-models/${id}/`);
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async getImageModels(): Promise<AIModel[]> {
    return aiModelsApi.getAll("IMAGE");
  },

  async getVideoModels(): Promise<AIModel[]> {
    return aiModelsApi.getAll("VIDEO");
  },
};
