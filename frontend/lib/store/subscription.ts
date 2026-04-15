import { create } from "zustand";
import type { UserSubscription } from "@/lib/types";

interface SubscriptionState {
  planCode: string;
  planName: string;
  status: string;
  features: string[];
  isTrial: boolean;
  trialDaysLeft: number | null;
  trialTotalDays: number | null;

  setFromUser: (sub: UserSubscription | undefined) => void;
  hasFeature: (code: string) => boolean;
}

export const useSubscriptionStore = create<SubscriptionState>()((set, get) => ({
  planCode: "free",
  planName: "Старт",
  status: "active",
  features: [],
  isTrial: false,
  trialDaysLeft: null,
  trialTotalDays: null,

  setFromUser: (sub) => {
    if (!sub) return;
    set({
      planCode: sub.plan_code,
      planName: sub.plan_name,
      status: sub.status,
      features: sub.features,
      isTrial: sub.is_trial,
      trialDaysLeft: sub.trial_days_left,
      trialTotalDays: sub.trial_total_days,
    });
  },

  hasFeature: (code) => get().features.includes(code),
}));
