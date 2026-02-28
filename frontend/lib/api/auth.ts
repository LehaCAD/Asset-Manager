import { apiClient, normalizeError } from "./client";
import type { LoginPayload, RegisterPayload, TokenPair, User } from "@/lib/types";

export const authApi = {
  async login(payload: LoginPayload): Promise<TokenPair> {
    try {
      const { data } = await apiClient.post<TokenPair>(
        "/api/auth/login/",
        payload
      );
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async register(payload: RegisterPayload): Promise<TokenPair> {
    try {
      const { data } = await apiClient.post<TokenPair>(
        "/api/auth/register/",
        payload
      );
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async getMe(): Promise<User> {
    try {
      const { data } = await apiClient.get<User>("/api/auth/me/");
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async refreshToken(refresh: string): Promise<{ access: string }> {
    try {
      const { data } = await apiClient.post<{ access: string }>(
        "/api/auth/token/refresh/",
        { refresh }
      );
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },
};
