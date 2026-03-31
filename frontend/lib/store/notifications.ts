import { create } from "zustand";
import { notificationsApi } from "@/lib/api/notifications";
import type { Notification } from "@/lib/types";

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  hasMore: boolean;
  isLoading: boolean;

  fetchUnreadCount: () => Promise<void>;
  fetchNotifications: (offset?: number) => Promise<void>;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  addNotification: (notification: Notification) => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  hasMore: false,
  isLoading: false,

  fetchUnreadCount: async () => {
    try {
      const count = await notificationsApi.unreadCount();
      set({ unreadCount: count });
    } catch {
      // silently ignore — unread badge is non-critical
    }
  },

  fetchNotifications: async (offset = 0) => {
    set({ isLoading: true });
    try {
      const data = await notificationsApi.list({ offset });
      set((state) => ({
        notifications:
          offset === 0
            ? data.results
            : [...state.notifications, ...data.results],
        hasMore: data.has_more,
        isLoading: false,
      }));
    } catch {
      set({ isLoading: false });
    }
  },

  markRead: async (id) => {
    await notificationsApi.markRead(id);
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, is_read: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }));
  },

  markAllRead: async () => {
    await notificationsApi.markAllRead();
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, is_read: true })),
      unreadCount: 0,
    }));
  },

  addNotification: (notification) => {
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    }));
  },
}));
