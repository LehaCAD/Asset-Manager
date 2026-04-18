import { apiClient, normalizeError } from "./client";
import type {
  CreditsBalanceResponse,
  CreditsEstimateRequest,
  CreditsEstimateResponse,
  TopUpCreateRequest,
  TopUpCreateResponse,
  TopUpStatusResponse,
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

  async createTopUp(
    payload: TopUpCreateRequest
  ): Promise<TopUpCreateResponse> {
    try {
      const { data } = await apiClient.post<TopUpCreateResponse>(
        "/api/credits/topup/create/",
        payload
      );
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async getTopUpStatus(paymentId: string): Promise<TopUpStatusResponse> {
    try {
      const { data } = await apiClient.get<TopUpStatusResponse>(
        `/api/credits/topup/${paymentId}/status/`
      );
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },
};
