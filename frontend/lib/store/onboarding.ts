import { create } from 'zustand';
import { toast } from 'sonner';
import { onboardingApi } from '@/lib/api/onboarding';
import type { OnboardingTaskDTO, WSOnboardingTaskCompletedEvent } from '@/lib/types';

interface OnboardingState {
  tasks: OnboardingTaskDTO[];
  welcomeSeen: boolean;
  totalEarned: number;
  totalPossible: number;
  completedCount: number;
  totalCount: number;
  isLoaded: boolean;
}

interface OnboardingActions {
  fetchOnboarding: () => Promise<void>;
  markWelcomeSeen: () => Promise<void>;
  completeTask: (taskCode: string) => Promise<void>;
  getTaskForPage: (page: string) => OnboardingTaskDTO | null;
  isAllCompleted: () => boolean;
  handleTaskCompleted: (event: WSOnboardingTaskCompletedEvent) => void;
}

export const useOnboardingStore = create<OnboardingState & OnboardingActions>()((set, get) => ({
  tasks: [],
  welcomeSeen: false,
  totalEarned: 0,
  totalPossible: 0,
  completedCount: 0,
  totalCount: 0,
  isLoaded: false,

  fetchOnboarding: async () => {
    try {
      const data = await onboardingApi.getState();
      set({
        tasks: data.tasks,
        welcomeSeen: data.welcome_seen,
        totalEarned: data.total_earned,
        totalPossible: data.total_possible,
        completedCount: data.completed_count,
        totalCount: data.total_count,
        isLoaded: true,
      });
    } catch {
      // Silent — onboarding is non-critical
    }
  },

  markWelcomeSeen: async () => {
    set({ welcomeSeen: true });
    try {
      await onboardingApi.markWelcomeSeen();
    } catch {
      // Silent
    }
  },

  completeTask: async (taskCode: string) => {
    const { tasks } = get();
    const task = tasks.find((t) => t.code === taskCode);
    if (!task || task.completed) return; // Already done locally
    try {
      await onboardingApi.completeTask(taskCode);
      // Will receive WS confirmation with final state
    } catch {
      // Silent
    }
  },

  getTaskForPage: (page: string) => {
    const { tasks } = get();
    return tasks.find((t) => t.empty_state?.page === page && !t.completed) ?? null;
  },

  isAllCompleted: () => {
    const { completedCount, totalCount } = get();
    return totalCount > 0 && completedCount >= totalCount;
  },

  handleTaskCompleted: (event: WSOnboardingTaskCompletedEvent) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.code === event.task_code
          ? { ...t, completed: true, completed_at: new Date().toISOString() }
          : t
      ),
      completedCount: event.completed_count,
      totalCount: event.total_count,
    }));
  },
}));
