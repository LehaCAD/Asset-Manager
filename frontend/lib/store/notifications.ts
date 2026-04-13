import { create } from "zustand";
import { notificationsApi } from "@/lib/api/notifications";
import type { Notification } from "@/lib/types";

type NotificationTab = 'all' | 'feedback' | 'content';

// Типы фидбека — теперь живут в overlay «Отзывы», не в bell
const FEEDBACK_TYPES = ['comment_new', 'reaction_new', 'review_new'];

const TAB_TYPES: Record<NotificationTab, string[] | null> = {
  all: null, // всё кроме feedback (фильтруется ниже)
  feedback: FEEDBACK_TYPES, // для /cabinet/notifications архива
  content: ['generation_completed', 'generation_failed', 'upload_completed'],
};

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  hasMore: boolean;
  isLoading: boolean;
  error: boolean;
  activeTab: NotificationTab;
  projectId: number | null;

  fetchUnreadCount: () => Promise<void>;
  fetchNotifications: (offset?: number) => Promise<void>;
  setActiveTab: (tab: NotificationTab) => void;
  setProjectId: (id: number | null) => void;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  addNotification: (notification: Notification) => void;
  getBellNotifications: () => Notification[];
  getBellUnreadCount: () => number;
}

export type { NotificationTab };

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  hasMore: false,
  isLoading: false,
  error: false,
  activeTab: 'all',
  projectId: null,

  fetchUnreadCount: async () => {
    try {
      const count = await notificationsApi.unreadCount();
      set({ unreadCount: count });
    } catch {
      // silently ignore — unread badge is non-critical
    }
  },

  fetchNotifications: async (offset = 0) => {
    const { activeTab, projectId } = get();
    set({ isLoading: true, error: false });
    try {
      const params: Record<string, unknown> = { offset };
      if (projectId) params.project = projectId;
      const types = TAB_TYPES[activeTab];
      if (types) params.type = types.join(',');

      const data = await notificationsApi.list(params as any);
      set((state) => ({
        notifications:
          offset === 0
            ? data.results
            : [...state.notifications, ...data.results],
        hasMore: data.has_more,
        isLoading: false,
      }));
    } catch {
      set({ isLoading: false, error: offset === 0 });
    }
  },

  setActiveTab: (tab) => {
    set({ activeTab: tab });
    get().fetchNotifications(0);
  },

  setProjectId: (id) => {
    set({ projectId: id });
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

  getBellNotifications: () => {
    return get().notifications.filter(
      (n) => !FEEDBACK_TYPES.includes(n.type)
    );
  },

  getBellUnreadCount: () => {
    return get().notifications.filter(
      (n) => !FEEDBACK_TYPES.includes(n.type) && !n.is_read
    ).length;
  },
}));
