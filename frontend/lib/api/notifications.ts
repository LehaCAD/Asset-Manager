import { apiClient } from './client'
import type { Notification } from '@/lib/types'

interface NotificationListResponse {
  results: Notification[]
  has_more: boolean
  next_offset: number | null
}

export const notificationsApi = {
  list: (params?: { type?: string; is_read?: boolean; offset?: number; project?: number }) =>
    apiClient.get<NotificationListResponse>('/api/notifications/', { params })
      .then(r => r.data),

  unreadCount: () =>
    apiClient.get<{ count: number }>('/api/notifications/unread-count/')
      .then(r => r.data.count),

  markRead: (id: number) =>
    apiClient.patch(`/api/notifications/${id}/read/`),

  markAllRead: () =>
    apiClient.post('/api/notifications/read-all/'),
}
