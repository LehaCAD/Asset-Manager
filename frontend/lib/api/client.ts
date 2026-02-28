import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { API_BASE_URL } from "@/lib/utils/constants";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

const PUBLIC_API_PATHS = ["/api/auth/register/", "/api/auth/login/", "/api/auth/token/refresh/"];

/* ── Request interceptor: attach JWT ────────────────────── */
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window === "undefined") return config;

  const isPublic = PUBLIC_API_PATHS.some((p) => config.url?.includes(p));
  if (isPublic) return config;

  const stored = localStorage.getItem("auth-storage");
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as { state?: { accessToken?: string } };
      const token = parsed?.state?.accessToken;
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // malformed storage — skip
    }
  }
  return config;
});

/* ── Response interceptor: refresh on 401 ───────────────── */
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  failedQueue = [];
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    const isPublic = PUBLIC_API_PATHS.some((p) => originalRequest.url?.includes(p));
    if (error.response?.status !== 401 || originalRequest._retry || isPublic) {
      return Promise.reject(normalizeError(error));
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return apiClient(originalRequest);
        })
        .catch((err) => Promise.reject(err));
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const stored = localStorage.getItem("auth-storage");
      const parsed = stored
        ? (JSON.parse(stored) as { state?: { refreshToken?: string } })
        : null;
      const refreshToken = parsed?.state?.refreshToken;

      if (!refreshToken) {
        throw new Error("Нет токена обновления");
      }

      const { data } = await axios.post<{ access: string }>(
        `${API_BASE_URL}/api/auth/token/refresh/`,
        { refresh: refreshToken }
      );

      const newAccess = data.access;

      if (stored) {
        const updated = JSON.parse(stored) as {
          state: { accessToken: string };
        };
        updated.state.accessToken = newAccess;
        localStorage.setItem("auth-storage", JSON.stringify(updated));
      }

      document.cookie = `access_token=${newAccess}; path=/; max-age=${60 * 30}; SameSite=Lax`;

      apiClient.defaults.headers.common.Authorization = `Bearer ${newAccess}`;
      originalRequest.headers.Authorization = `Bearer ${newAccess}`;

      processQueue(null, newAccess);
      return apiClient(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      localStorage.removeItem("auth-storage");
      document.cookie = "access_token=; path=/; max-age=0";
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export function normalizeError(error: unknown): Error {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as Record<string, unknown> | undefined;
    if (data) {
      // Plain string detail/message
      if (typeof data.detail === "string") return new Error(data.detail);
      if (typeof data.message === "string") return new Error(data.message);
      // DRF field validation errors: { field: ["msg", ...] | "msg" }
      const messages: string[] = [];
      for (const val of Object.values(data)) {
        if (typeof val === "string") messages.push(val);
        else if (Array.isArray(val))
          val.forEach((v) => typeof v === "string" && messages.push(v));
      }
      if (messages.length) return new Error(messages.join(" "));
    }
    return new Error(error.message || "Произошла ошибка");
  }
  if (error instanceof Error) return error;
  return new Error("Неизвестная ошибка");
}
