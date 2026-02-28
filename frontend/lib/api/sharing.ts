import { apiClient, normalizeError } from "./client";
import type {
  SharedLink,
  CreateSharedLinkPayload,
  PublicProject,
  CreateCommentPayload,
  Comment,
} from "@/lib/types";

export const sharingApi = {
  async getLinks(projectId: number): Promise<SharedLink[]> {
    try {
      const { data } = await apiClient.get<SharedLink[]>("/api/sharing/links/", {
        params: { project: projectId },
      });
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async createLink(payload: CreateSharedLinkPayload): Promise<SharedLink> {
    try {
      const { data } = await apiClient.post<SharedLink>(
        "/api/sharing/links/",
        payload
      );
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async deleteLink(id: number): Promise<void> {
    try {
      await apiClient.delete(`/api/sharing/links/${id}/`);
    } catch (error) {
      throw normalizeError(error);
    }
  },

  /** Public — no auth required */
  async getPublicProject(token: string): Promise<PublicProject> {
    try {
      const { data } = await apiClient.get<PublicProject>(
        `/api/sharing/public/${token}/`
      );
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async addComment(payload: CreateCommentPayload): Promise<Comment> {
    try {
      const { data } = await apiClient.post<Comment>(
        `/api/sharing/public/${payload.token}/comment/`,
        {
          scene: payload.scene,
          author_name: payload.author_name,
          text: payload.text,
        }
      );
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },
};
