import { apiClient, normalizeError } from "./client";
import type { FeatureGateInfo, PlanInfo } from "@/lib/types";

export const subscriptionsApi = {
  async getPlans(): Promise<PlanInfo[]> {
    try {
      const { data } = await apiClient.get<PlanInfo[]>(
        "/api/subscriptions/plans/"
      );
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async getFeatureGate(code: string): Promise<FeatureGateInfo> {
    try {
      const { data } = await apiClient.get<FeatureGateInfo>(
        `/api/subscriptions/feature-gate/${code}/`
      );
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },
};
