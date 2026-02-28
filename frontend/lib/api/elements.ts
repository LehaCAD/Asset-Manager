import { apiClient, normalizeError } from "./client";
import type {
  Element,
  GenerateElementPayload,
  UpdateElementPayload,
  ReorderElementsPayload,
  Img2VidPayload,
} from "@/lib/types";

export const elementsApi = {
  async getByScene(sceneId: number): Promise<Element[]> {
    try {
      const { data } = await apiClient.get<Element[]>("/api/elements/", {
        params: { scene: sceneId },
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

  async generate(payload: GenerateElementPayload): Promise<Element> {
    try {
      const { data } = await apiClient.post<Element>(
        "/api/elements/generate/",
        payload
      );
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async upload(sceneId: number, file: File): Promise<Element> {
    try {
      const formData = new FormData();
      formData.append("scene", String(sceneId));
      formData.append("file", file);

      const { data } = await apiClient.post<Element>(
        "/api/elements/upload/",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
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

  async img2vid(payload: Img2VidPayload): Promise<Element> {
    try {
      const { data } = await apiClient.post<Element>(
        "/api/elements/img2vid/",
        payload
      );
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },
};
