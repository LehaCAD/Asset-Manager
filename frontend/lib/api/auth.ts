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

  async verifyEmail(token: string): Promise<{ message: string }> {
    try {
      const { data } = await apiClient.get<{ message: string }>(
        `/api/auth/verify-email/?token=${token}`
      );
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async resendVerification(): Promise<{ message: string }> {
    try {
      const { data } = await apiClient.post<{ message: string }>(
        '/api/auth/resend-verification/'
      );
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async forgotPassword(email: string): Promise<{ message: string }> {
    try {
      const { data } = await apiClient.post<{ message: string }>(
        '/api/auth/forgot-password/',
        { email }
      );
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async resetPassword(token: string, password: string, password_confirm: string): Promise<{ message: string }> {
    try {
      const { data } = await apiClient.post<{ message: string }>(
        '/api/auth/reset-password/',
        { token, password, password_confirm }
      );
      return data;
    } catch (error) {
      throw normalizeError(error);
    }
  },
};
