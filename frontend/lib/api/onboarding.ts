import { apiClient } from './client';
import type { OnboardingStateResponse } from '@/lib/types';

export const onboardingApi = {
  async getState(): Promise<OnboardingStateResponse> {
    const { data } = await apiClient.get('/api/onboarding/');
    return data;
  },
  async markWelcomeSeen(): Promise<void> {
    await apiClient.post('/api/onboarding/welcome-seen/');
  },
  async completeTask(taskCode: string): Promise<{ ok: boolean; reward?: string; new_balance?: string; already_completed?: boolean }> {
    const { data } = await apiClient.post('/api/onboarding/complete/', { task_code: taskCode });
    return data;
  },
};
