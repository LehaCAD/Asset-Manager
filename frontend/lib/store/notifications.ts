import { create } from "zustand";
import { notificationsApi } from "@/lib/api/notifications";
import type { Notification } from "@/lib/types";

interface NotificationFilters {
  projectId: number | null;
  types: string[] | null; // null = all types
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  hasMore: boolean;
  isLoading: boolean;
  error: boolean;
  filters: NotificationFilters;
  lastFetchedFilters: NotificationFilters | null;

  fetchUnreadCount: () => Promise<void>;
  fetchNotifications: (offset?: number) => Promise<void>;
  setFilters: (update: Partial<NotificationFilters>) => void;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  addNotification: (notification: Notification) => void;
}

const DEFAULT_FILTERS: NotificationFilters = { projectId: null, types: null };

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  hasMore: false,
  isLoading: false,
  error: false,
  filters: { ...DEFAULT_FILTERS },
  lastFetchedFilters: null,

  fetchUnreadCount: async () => {
    try {
      const count = await notificationsApi.unreadCount();
      set({ unreadCount: count });
    } catch {
      // silently ignore — unread badge is non-critical
    }
  },

  fetchNotifications: async (offset = 0) => {
    const { filters } = get();
    set({ isLoading: true, error: false });
    try {
      const params: Record<string, unknown> = { offset };
      if (filters.projectId) params.project = filters.projectId;
      if (filters.types && filters.types.length > 0) params.type = filters.types.join(',');

      const data = await notificationsApi.list(params as any);
      set((state) => ({
        notifications:
          offset === 0
            ? data.results
            : [...state.notifications, ...data.results],
        hasMore: data.has_more,
        isLoading: false,
        lastFetchedFilters: { ...filters },
      }));
    } catch {
      set({ isLoading: false, error: offset === 0 });
    }
  },

  setFilters: (update) => {
    set((state) => ({
      filters: { ...state.filters, ...update },
    }));
    // Auto-refetch with new filters
    get().fetchNotifications(0);
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
