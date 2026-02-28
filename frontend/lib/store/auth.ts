import { create } from "zustand";
import { persist } from "zustand/middleware";

interface User {
  id: number;
  username: string;
  email: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;

  setTokens: (access: string, refresh: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
}

function syncTokenCookie(token: string | null) {
  if (typeof document === "undefined") return;
  if (token) {
    document.cookie = `access_token=${token}; path=/; max-age=${60 * 30}; SameSite=Lax`;
  } else {
    document.cookie = "access_token=; path=/; max-age=0";
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
        set({ accessToken: access, refreshToken: refresh, isAuthenticated: true });
      },

      setUser: (user) => set({ user }),

      logout: () => {
        syncTokenCookie(null);
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
      onRehydrate: () => {
        return (state) => {
          if (state?.accessToken) {
            syncTokenCookie(state.accessToken);
          }
        };
      },
    }
  )
);
