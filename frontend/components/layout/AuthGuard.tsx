"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
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
  const pathname = usePathname();
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

  const hasQuota = Boolean(user?.quota);
  useEffect(() => {
    if (!isMounted || !isHydrated || !canAccessWorkspace) return;
    if (hasQuota) return;

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
  }, [isMounted, isHydrated, canAccessWorkspace, hasQuota, setUser]);

  useEffect(() => {
    // Never redirect if we're already on an auth route — prevents render loop
    // when /login briefly mounts AuthGuard during hydration.
    const onAuthRoute = pathname?.startsWith("/login")
      || pathname?.startsWith("/register")
      || pathname?.startsWith("/forgot-password")
      || pathname?.startsWith("/reset-password")
      || pathname?.startsWith("/verify-email");

    if (isMounted && isHydrated && !canAccessWorkspace && !redirected.current && !onAuthRoute) {
      redirected.current = true;
      router.replace("/login");
    }
  }, [isMounted, isHydrated, canAccessWorkspace, router, pathname]);

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
