"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store/auth";
import { authApi } from "@/lib/api/auth";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const syncFromCookies = useAuthStore((s) => s.syncFromCookies);
  const router = useRouter();
  const redirected = useRef(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  const canAccessWorkspace = isAuthenticated || Boolean(accessToken) || Boolean(refreshToken);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const persistApi = (useAuthStore as typeof useAuthStore & {
      persist?: {
        hasHydrated: () => boolean;
        onFinishHydration: (callback: () => void) => () => void;
      };
    }).persist;
    if (!persistApi) return;

    setIsHydrated(persistApi.hasHydrated());
    const unsubscribe = persistApi.onFinishHydration(() => {
      setIsHydrated(true);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (isMounted && isHydrated) {
      syncFromCookies();
    }
  }, [isMounted, isHydrated, syncFromCookies]);

  useEffect(() => {
    if (!isMounted || !isHydrated || !canAccessWorkspace) return;
    if (user?.quota) return;

    let isActive = true;
    authApi
      .getMe()
      .then((me) => {
        if (isActive) {
          setUser(me);
        }
      })
      .catch((error) => {
        console.error("Failed to hydrate current user profile", error);
      });

    return () => {
      isActive = false;
    };
  }, [isMounted, isHydrated, canAccessWorkspace, user, setUser]);

  useEffect(() => {
    if (isMounted && isHydrated && !canAccessWorkspace && !redirected.current) {
      redirected.current = true;
      router.replace("/login");
    }
  }, [isMounted, isHydrated, canAccessWorkspace, router]);

  if (!isMounted || !isHydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!canAccessWorkspace) {
    return null;
  }

  return <>{children}</>;
}
