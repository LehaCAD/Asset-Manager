import axios from 'axios'
import { apiClient } from './client'
import type {
  SharedLink, Comment, PublicProject, PublicElementReaction,
} from '@/lib/types'

const publicClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
})

export const sharingApi = {
  // SharedLink CRUD (authenticated)
  getLinks: (projectId?: number) =>
    apiClient.get<SharedLink[]>('/api/sharing/links/', { params: projectId ? { project: projectId } : {} })
      .then(r => r.data),

  createLink: (data: { project: number; element_ids: number[]; name?: string; expires_at?: string; display_preferences?: { size: string; aspectRatio: string; fitMode: string } }) =>
    apiClient.post<SharedLink>('/api/sharing/links/', data).then(r => r.data),

  updateLink: (id: number, data: { name?: string; element_ids?: number[]; expires_at?: string }) =>
    apiClient.patch<SharedLink>(`/api/sharing/links/${id}/`, data).then(r => r.data),

  deleteLink: (id: number) =>
    apiClient.delete(`/api/sharing/links/${id}/`),

  // Comments — authenticated (creator workspace)
  getElementComments: (elementId: number) =>
    apiClient.get<Comment[]>(`/api/sharing/elements/${elementId}/comments/`).then(r => r.data),

  getSceneComments: (sceneId: number) =>
    apiClient.get<Comment[]>(`/api/sharing/scenes/${sceneId}/comments/`).then(r => r.data),

  addElementComment: (elementId: number, text: string, parentId?: number) =>
    apiClient.post<Comment>(`/api/sharing/elements/${elementId}/comments/`, {
      text, parent_id: parentId,
    }).then(r => r.data),

  addSceneComment: (sceneId: number, text: string, parentId?: number) =>
    apiClient.post<Comment>(`/api/sharing/scenes/${sceneId}/comments/`, {
      text, parent_id: parentId,
    }).then(r => r.data),

  markCommentRead: (commentId: number) =>
    apiClient.patch(`/api/sharing/comments/${commentId}/read/`),

  markAllCommentsRead: (projectId: number) =>
    apiClient.post('/api/sharing/comments/read-all/', { project_id: projectId }),

  // Public (reviewer, no auth)
  getPublicProject: (token: string) =>
    publicClient.get<PublicProject>(`/api/sharing/public/${token}/`).then(r => r.data),

  addPublicComment: (token: string, data: {
    text: string; author_name: string; session_id: string;
    element_id?: number; scene_id?: number; parent_id?: number;
  }) =>
    publicClient.post<Comment>(`/api/sharing/public/${token}/comments/`, data).then(r => r.data),

  setReaction: (token: string, data: { element_id: number; session_id: string; value: string | null; author_name?: string }) =>
    publicClient.post(`/api/sharing/public/${token}/reactions/`, data),

  submitReview: (token: string, data: { element_id: number; action: string; session_id: string; author_name: string }) =>
    publicClient.post(`/api/sharing/public/${token}/review/`, data).then(r => r.data),

  // Reactions — authenticated (creator workspace)
  getElementReactions: (elementId: number) =>
    apiClient.get<PublicElementReaction[]>(`/api/sharing/elements/${elementId}/reactions/`).then(r => r.data),

  // Element metadata for sharing
  getProjectElements: (projectId: number) =>
    apiClient.get<{ elements: Array<{ id: number; element_type: string; is_favorite: boolean }> }>(
      `/api/sharing/project-elements/${projectId}/`
    ).then(r => r.data.elements),

  getGroupElements: (sceneId: number) =>
    apiClient.get<{ elements: Array<{ id: number; element_type: string; is_favorite: boolean }> }>(
      `/api/sharing/group-elements/${sceneId}/`
    ).then(r => r.data.elements),
}
