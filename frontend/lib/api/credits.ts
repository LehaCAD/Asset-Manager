import { apiClient, normalizeError } from "./client";
import type {
  CreditsBalanceResponse,
  CreditsEstimateRequest,
  CreditsEstimateResponse,
} from "@/lib/types";

export const creditsApi = {
  async getBalance(): Promise<CreditsBalanceResponse> {
    try {
      const { data } = await apiClient.get<CreditsBalanceResponse>(
        "/api/credits/balance/"
      );
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async estimate(
    payload: CreditsEstimateRequest
  ): Promise<CreditsEstimateResponse> {
    try {
      const { data } = await apiClient.post<CreditsEstimateResponse>(
        "/api/credits/estimate/",
        payload
      );
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },
};
