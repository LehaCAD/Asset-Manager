import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { API_BASE_URL } from "@/lib/utils/constants";
import { logger } from "@/lib/utils/logger";

export const DEFAULT_API_TIMEOUT_MS = 15_000;
export const LONG_API_TIMEOUT_MS = 120_000;

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: DEFAULT_API_TIMEOUT_MS,
  headers: {
    "Content-Type": "application/json",
  },
});

/**
 * Error subclass carrying correlation data from the backend response so UI
 * layers can surface a copy-pastable `error_id` to the user.
 */
export class ApiError extends Error {
  readonly status: number | undefined;
  readonly errorId: string | undefined;
  readonly requestId: string | undefined;
  readonly url: string | undefined;
  readonly payload: unknown;
  constructor(
    message: string,
    init: {
      status?: number;
      errorId?: string;
      requestId?: string;
      url?: string;
      payload?: unknown;
    } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = init.status;
    this.errorId = init.errorId;
    this.requestId = init.requestId;
    this.url = init.url;
    this.payload = init.payload;
  }
}

const PUBLIC_API_PATHS = ["/api/auth/register/", "/api/auth/login/", "/api/auth/token/refresh/"];
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.split("=")[1];
  return value || null;
}

/* ── Request interceptor: attach JWT ────────────────────── */
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window === "undefined") return config;

  const isPublic = PUBLIC_API_PATHS.some((p) => config.url?.includes(p));
  if (isPublic) return config;

  const stored = localStorage.getItem("auth-storage");
  let tokenFromStorage: string | null = null;
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as { state?: { accessToken?: string } };
      tokenFromStorage = parsed?.state?.accessToken ?? null;
    } catch {
      // malformed storage — skip
    }
  }

  const token = readCookie("access_token") || tokenFromStorage;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
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
      const refreshToken = parsed?.state?.refreshToken || readCookie("refresh_token");

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

      document.cookie = `access_token=${newAccess}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;

      apiClient.defaults.headers.common.Authorization = `Bearer ${newAccess}`;
      originalRequest.headers.Authorization = `Bearer ${newAccess}`;

      processQueue(null, newAccess);
      return apiClient(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      localStorage.removeItem("auth-storage");
      document.cookie = "access_token=; path=/; max-age=0";
      document.cookie = "refresh_token=; path=/; max-age=0";
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
    const response = error.response;
    const status = response?.status;
    const url = error.config?.url;
    const data = response?.data as Record<string, unknown> | undefined;
    const headerRaw = response?.headers?.["x-request-id"];
    const requestId = typeof headerRaw === "string" ? headerRaw : undefined;
    const errorId = typeof data?.error_id === "string" ? (data.error_id as string) : undefined;

    const timeoutLike =
      error.code === "ECONNABORTED" || error.message.toLowerCase().includes("timeout");
    const gatewayLike =
      status !== undefined && (status === 502 || status === 503 || status === 504);
    const isJsonObject = data !== null && typeof data === "object" && !Array.isArray(data);
    let message: string;
    if (timeoutLike) {
      message = "Превышено время ожидания ответа сервера";
    } else if (gatewayLike) {
      message = "Сервер недоступен, попробуйте ещё раз";
    } else if (isJsonObject) {
      if (typeof data!.error === "string") {
        message = data!.error as string;
      } else if (typeof data!.detail === "string") {
        message = data!.detail as string;
      } else if (typeof data!.message === "string") {
        message = data!.message as string;
      } else {
        const parts: string[] = [];
        for (const [field, val] of Object.entries(data!)) {
          if (field === "error_id") continue;
          if (typeof val === "string") parts.push(val);
          else if (Array.isArray(val)) {
            val.forEach((v) => typeof v === "string" && parts.push(v));
          }
        }
        message = parts.length ? parts.join(" ") : error.message || "Произошла ошибка";
      }
    } else if (status && status >= 500) {
      message = "Сервер вернул ошибку, попробуйте ещё раз";
    } else {
      message = error.message || "Произошла ошибка";
    }

    const apiError = new ApiError(message, {
      status,
      errorId,
      requestId,
      url,
      payload: data,
    });

    // Log everything except auth redirects (handled explicitly by refresh flow)
    // and explicit client aborts (navigation, React StrictMode double-invoke).
    const aborted = error.code === "ERR_CANCELED" || error.name === "CanceledError";
    if (status !== 401 && !timeoutLike && !aborted) {
      logger.error(
        "api_error",
        {
          url,
          method: error.config?.method,
          status,
          code: error.code,
          request_id: requestId,
          error_id: errorId,
        },
        apiError,
      );
    } else if (timeoutLike) {
      logger.warn("api_timeout", { url, method: error.config?.method });
    }

    return apiError;
  }
  if (error instanceof Error) return error;
  return new Error("Неизвестная ошибка");
}
