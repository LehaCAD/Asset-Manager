// frontend/lib/api/feedback.ts
import { apiClient, normalizeError } from './client'
import type {
  FeedbackConversation,
  FeedbackMessage,
  AdminConversation,
} from '@/lib/types'

export const feedbackApi = {
  // User
  getConversation: async () => {
    try {
      const { data } = await apiClient.get<FeedbackConversation>('/api/feedback/conversation/')
      return data
    } catch (error) {
      throw normalizeError(error)
    }
  },
  createConversation: async () => {
    try {
      const { data } = await apiClient.post<FeedbackConversation>('/api/feedback/conversation/')
      return data
    } catch (error) {
      throw normalizeError(error)
    }
  },
  getMessages: async (cursor?: number) => {
    try {
      const { data } = await apiClient.get<FeedbackMessage[]>('/api/feedback/messages/', {
        params: cursor ? { cursor } : undefined,
      })
      return data
    } catch (error) {
      throw normalizeError(error)
    }
  },
  sendMessage: async (text: string) => {
    try {
      const { data } = await apiClient.post<FeedbackMessage>('/api/feedback/messages/', { text })
      return data
    } catch (error) {
      throw normalizeError(error)
    }
  },
  presignAttachment: async (messageId: number, fileName: string, contentType: string) => {
    try {
      const { data } = await apiClient.post<{ upload_url: string; file_key: string }>(
        `/api/feedback/messages/${messageId}/presign/`,
        { file_name: fileName, content_type: contentType },
      )
      return data
    } catch (error) {
      throw normalizeError(error)
    }
  },
  confirmAttachment: async (messageId: number, fileKey: string, fileName: string, fileSize: number, contentType: string) => {
    try {
      const { data } = await apiClient.post<{ status: string }>(
        `/api/feedback/messages/${messageId}/confirm-attach/`,
        { file_key: fileKey, file_name: fileName, file_size: fileSize, content_type: contentType },
      )
      return data
    } catch (error) {
      throw normalizeError(error)
    }
  },
  markRead: async () => {
    try {
      const { data } = await apiClient.post('/api/feedback/conversation/read/')
      return data
    } catch (error) {
      throw normalizeError(error)
    }
  },

  // Admin
  getConversations: async (params?: { status?: string; tag?: string; search?: string }) => {
    try {
      const { data } = await apiClient.get<AdminConversation[]>('/api/feedback/admin/conversations/', { params })
      return data
    } catch (error) {
      throw normalizeError(error)
    }
  },
  getConversationDetail: async (id: number) => {
    try {
      const { data } = await apiClient.get<AdminConversation>(`/api/feedback/admin/conversations/${id}/`)
      return data
    } catch (error) {
      throw normalizeError(error)
    }
  },
  getConversationMessages: async (id: number, cursor?: number) => {
    try {
      const { data } = await apiClient.get<FeedbackMessage[]>(
        `/api/feedback/admin/conversations/${id}/messages/`,
        { params: cursor ? { cursor } : undefined },
      )
      return data
    } catch (error) {
      throw normalizeError(error)
    }
  },
  sendAdminReply: async (id: number, text: string) => {
    try {
      const { data } = await apiClient.post<FeedbackMessage>(
        `/api/feedback/admin/conversations/${id}/messages/`,
        { text },
      )
      return data
    } catch (error) {
      throw normalizeError(error)
    }
  },
  updateConversation: async (id: number, data: { status?: string; tag?: string }) => {
    try {
      const { data: result } = await apiClient.patch<AdminConversation>(
        `/api/feedback/admin/conversations/${id}/`,
        data,
      )
      return result
    } catch (error) {
      throw normalizeError(error)
    }
  },
  grantReward: async (id: number, amount: number, comment: string) => {
    try {
      const { data } = await apiClient.post(
        `/api/feedback/admin/conversations/${id}/reward/`,
        { amount, comment },
      )
      return data
    } catch (error) {
      throw normalizeError(error)
    }
  },
  adminMarkRead: async (id: number) => {
    try {
      const { data } = await apiClient.post(`/api/feedback/admin/conversations/${id}/read/`)
      return data
    } catch (error) {
      throw normalizeError(error)
    }
  },
  deleteMessage: async (messageId: number) => {
    try {
      const { data } = await apiClient.delete(`/api/feedback/admin/messages/${messageId}/`)
      return data
    } catch (error) {
      throw normalizeError(error)
    }
  },
}
