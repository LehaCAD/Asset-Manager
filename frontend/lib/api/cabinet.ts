import { apiClient } from "./client";
import type {
  CabinetAnalytics,
  CabinetHistoryEntry,
  CabinetTransaction,
  CabinetStorage,
  PaginatedResponse,
} from "@/lib/types";

export interface AnalyticsParams {
  period?: string;
  ai_model_id?: number;
  element_type?: string;
}

export interface HistoryParams {
  page?: number;
  page_size?: number;
  status?: string;
  ai_model_id?: number;
  source_type?: string;
  element_type?: string;
  project_id?: number;
  date_from?: string;
  date_to?: string;
}

export interface TransactionParams {
  page?: number;
  page_size?: number;
  reason?: string;
  date_from?: string;
  date_to?: string;
}

function cleanParams(params: Record<string, unknown>): Record<string, string | number> {
  const cleaned: Record<string, string | number> = {};
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null && val !== "") {
      cleaned[key] = val as string | number;
    }
  }
  return cleaned;
}

export async function getAnalytics(params: AnalyticsParams = {}): Promise<CabinetAnalytics> {
  const { data } = await apiClient.get("/api/cabinet/analytics/", {
    params: cleanParams(params),
  });
  return data;
}

export async function getHistory(params: HistoryParams = {}): Promise<PaginatedResponse<CabinetHistoryEntry>> {
  const { data } = await apiClient.get("/api/cabinet/history/", {
    params: cleanParams(params),
  });
  return data;
}

export async function getTransactions(params: TransactionParams = {}): Promise<PaginatedResponse<CabinetTransaction>> {
  const { data } = await apiClient.get("/api/cabinet/transactions/", {
    params: cleanParams(params),
  });
  return data;
}

export async function getStorage(): Promise<CabinetStorage> {
  const { data } = await apiClient.get("/api/cabinet/storage/");
  return data;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiClient.post("/api/auth/me/password/", {
    current_password: currentPassword,
    new_password: newPassword,
  });
}
