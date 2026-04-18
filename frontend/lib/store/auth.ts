import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/lib/types";
import { useSubscriptionStore } from "./subscription";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;

  setTokens: (access: string, refresh: string) => void;
  setUser: (user: User) => void;
  syncFromCookies: () => void;
  logout: () => void;
}

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.split("=")[1];
  return value || null;
}

function syncTokenCookie(token: string | null) {
  if (typeof document === "undefined") return;
  if (token) {
    document.cookie = `access_token=${token}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
  } else {
    document.cookie = "access_token=; path=/; max-age=0";
  }
}

function syncRefreshCookie(token: string | null) {
  if (typeof document === "undefined") return;
  if (token) {
    document.cookie = `refresh_token=${token}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
  } else {
    document.cookie = "refresh_token=; path=/; max-age=0";
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      setTokens: (access, refresh) => {
        syncTokenCookie(access);
        syncRefreshCookie(refresh);
        set({ accessToken: access, refreshToken: refresh, isAuthenticated: true });
      },

      setUser: (user) => {
        set({ user });
        useSubscriptionStore.getState().setFromUser(user?.subscription);
      },

      syncFromCookies: () => {
        const accessFromCookie = readCookie("access_token");
        const refreshFromCookie = readCookie("refresh_token");

        if (!accessFromCookie && !refreshFromCookie) return;

        set((state) => {
          const accessToken = state.accessToken ?? accessFromCookie;
          const refreshToken = state.refreshToken ?? refreshFromCookie;
          return {
            accessToken,
            refreshToken,
            isAuthenticated: Boolean(accessToken || refreshToken),
          };
        });
      },

      logout: () => {
        syncTokenCookie(null);
        syncRefreshCookie(null);
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => {
        return (state) => {
          if (state?.accessToken) {
            syncTokenCookie(state.accessToken);
          }
          if (state?.refreshToken) {
            syncRefreshCookie(state.refreshToken);
          }
          if (state?.user?.subscription) {
            useSubscriptionStore.getState().setFromUser(state.user.subscription);
          }
        };
      },
    }
  )
);
