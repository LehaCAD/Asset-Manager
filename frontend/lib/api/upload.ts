import { apiClient } from "./client";
import type { Element } from "../types";

interface PresignResponse {
  element_id: number;
  upload_keys: {
    original: string;
    small: string;
    medium: string;
  };
  presigned_urls: {
    original: string;
    small: string;
    medium: string;
  };
  content_types: {
    original: string;
    small: string;
    medium: string;
  };
  expires_in: number;
}

export const uploadApi = {
  async presignForScene(
    sceneId: number,
    data: { filename: string; file_size: number; prompt_text?: string }
  ): Promise<PresignResponse> {
    const res = await apiClient.post(`/api/scenes/${sceneId}/presign/`, data);
    return res.data;
  },

  async presignForProject(
    projectId: number,
    data: { filename: string; file_size: number; prompt_text?: string }
  ): Promise<PresignResponse> {
    const res = await apiClient.post(`/api/projects/${projectId}/presign/`, data);
    return res.data;
  },

  async complete(
    elementId: number,
    phase: "thumbnail" | "final"
  ): Promise<Element> {
    const res = await apiClient.post(`/api/elements/${elementId}/complete/`, {
      phase,
    });
    return res.data;
  },
};
