"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  LogOut,
  User,
  Clapperboard,
  HardDrive,
  LayoutDashboard,
  Bell,
  Moon,
  Sun,
  ArrowRight,
  Trophy,
} from "lucide-react";
import { KadrIcon } from "@/components/ui/kadr-icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationDropdown } from "./NotificationDropdown";
import { useAuthStore } from "@/lib/store/auth";
import { useCreditsStore } from "@/lib/store/credits";
import { useNotificationStore } from "@/lib/store/notifications";
import { useSubscriptionStore } from "@/lib/store/subscription";
import { useOnboardingStore } from "@/lib/store/onboarding";
import { notificationWS } from "@/lib/api/notification-ws";
import { authApi } from "@/lib/api/auth";
import { logger } from "@/lib/utils/logger";
import { formatCurrency, formatStorage } from "@/lib/utils/format";
import { FeedbackButton } from "@/components/feedback/FeedbackButton";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";
import { PlanBadge } from "@/components/subscription/PlanBadge";
import { cn } from "@/lib/utils";

const FREE_PLAN_NAME = "Старт";

/** Build the centered status text shown in the navbar for non-active-paid users. */
function resolveCenterStatus(args: {
  planCode: string;
  planName: string;
  status: string;
  isTrial: boolean;
  trialDaysLeft: number | null;
}): { text: string; cta: string } | null {
  const { planCode, planName, status, isTrial, trialDaysLeft } = args;

  if (isTrial) {
    const days = trialDaysLeft ?? 0;
    const word = pluralizeDays(days);
    return {
      text: `Пробный тариф «${planName}» — ${word}. После — «${FREE_PLAN_NAME}».`,
      cta: "Выбрать тариф",
    };
  }

  if (status === "expired") {
    return {
      text: `Пробный период завершён — вы на тарифе «${FREE_PLAN_NAME}».`,
      cta: "Выбрать тариф",
    };
  }

  if (status === "cancelled") {
    return {
      text: `Тариф «${planName}» отменён, действует до конца периода.`,
      cta: "Возобновить",
    };
  }

  if (planCode === "free") {
    return {
      text: `Тариф «${planName}» — некоторые функции ограничены.`,
      cta: "Выбрать тариф",
    };
  }

  return null;
}

function pluralizeDays(n: number): string {
  const lastDigit = n % 10;
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 19) return `осталось ${n} дней`;
  if (lastDigit === 1) return `остался ${n} день`;
  if (lastDigit >= 2 && lastDigit <= 4) return `осталось ${n} дня`;
  return `осталось ${n} дней`;
}

export function Navbar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const setUser = useAuthStore((s) => s.setUser);
  const balance = useCreditsStore((s) => s.balance);
  const loadBalance = useCreditsStore((s) => s.loadBalance);

  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const fetchUnreadCount = useNotificationStore((s) => s.fetchUnreadCount);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { resolvedTheme, setTheme } = useTheme();

  // Subscription status (for center text + avatar popup badge)
  const planCode = useSubscriptionStore((s) => s.planCode);
  const planName = useSubscriptionStore((s) => s.planName);
  const subscriptionStatus = useSubscriptionStore((s) => s.status);
  const isTrial = useSubscriptionStore((s) => s.isTrial);
  const trialDaysLeft = useSubscriptionStore((s) => s.trialDaysLeft);

  // Onboarding counter for the avatar dropdown
  const achievementsDone = useOnboardingStore((s) => s.completedCount);
  const achievementsTotal = useOnboardingStore((s) => s.totalCount);

  useEffect(() => {
    if (user) {
      loadBalance();
      authApi.getMe().then(setUser).catch((err) => logger.warn("navbar.fetch_me_failed", { cause: err }));
    }
  }, [user?.id, loadBalance, setUser]);

  useEffect(() => {
    if (!user) return;

    fetchUnreadCount();

    notificationWS.connect();
    const unsubscribe = notificationWS.on((event) => {
      addNotification(event.notification);
    });

    const startPolling = () => {
      pollIntervalRef.current = setInterval(fetchUnreadCount, 30_000);
    };
    const stopPolling = () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };

    const handleVisibility = () => {
      stopPolling();
      if (!document.hidden) {
        fetchUnreadCount();
        startPolling();
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      unsubscribe();
      notificationWS.disconnect();
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  function handleLogout() {
    logout();
    // Hard reload guarantees all React effects, WS connections, and cached
    // state are wiped before mounting the login route.
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : "";

  const isDark = resolvedTheme === "dark";

  // Hide center status on pricing page (CTA would be redundant)
  const centerStatus =
    user && !pathname?.startsWith("/pricing")
      ? resolveCenterStatus({
          planCode,
          planName,
          status: subscriptionStatus,
          isTrial,
          trialDaysLeft,
        })
      : null;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/60">
      <div className="flex h-12 items-center px-3 sm:px-4">
        {/* Logo (left) */}
        <Link
          href="/projects"
          className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity"
        >
          <Clapperboard className="h-5 w-5 text-primary" strokeWidth={1.75} />
          <span className="font-semibold text-sm tracking-tight hidden sm:block">
            Раскадровка
          </span>
        </Link>

        {/* Center — subscription status text (desktop only, and only for free/trial/expired/cancelled). */}
        <div className="flex-1 min-w-0 flex justify-center">
          {centerStatus && (
            <div className="hidden md:flex min-w-0 justify-center items-center gap-1.5 text-[11px] leading-tight text-muted-foreground">
              <span className="truncate">{centerStatus.text}</span>
              <Link
                href="/pricing"
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-0.5 shrink-0 font-medium text-primary hover:text-primary/80 transition-colors"
              >
                {centerStatus.cta}
                <ArrowRight className="h-3 w-3" strokeWidth={2.25} />
              </Link>
            </div>
          )}
        </div>

        {/* Right side — all items unified h-9 with breathing gap. Sticks to the right edge. */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Баланс — h-9 to match the rest */}
          {user && (
            <div className="flex items-center gap-1.5 h-9 px-3 rounded-md bg-success/10 border border-success/20">
              <KadrIcon size="sm" />
              <span className="text-xs font-medium text-foreground tabular-nums">
                {formatCurrency(balance)}
              </span>
            </div>
          )}

          {/* OnboardingProgress — hidden on xs */}
          {user && (
            <div className="hidden sm:block">
              <OnboardingProgress />
            </div>
          )}

          {/* FeedbackButton — pill "Чат поддержки" */}
          {user && <FeedbackButton />}

          {/* Bell */}
          {user && (
            <NotificationDropdown>
              <Button
                variant="ghost"
                size="icon"
                className="relative h-9 w-9"
                aria-label="Уведомления"
              >
                <Bell className="h-4 w-4" strokeWidth={1.75} />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-semibold text-white leading-none">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Button>
            </NotificationDropdown>
          )}

          {/* Avatar — clearly round, coloured, initials */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex items-center justify-center h-9 w-9 rounded-full transition-colors",
                  "bg-primary text-primary-foreground font-semibold text-[11px]",
                  "hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ring-offset-2 ring-offset-background",
                )}
                aria-label="Меню пользователя"
              >
                {user ? (
                  <span className="tracking-wide">{initials}</span>
                ) : (
                  <User className="h-4 w-4" strokeWidth={1.75} />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {/* Identity + plan badge */}
              <DropdownMenuLabel className="font-normal py-2">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-sm font-medium leading-tight truncate">
                      {user?.username ?? "Пользователь"}
                    </p>
                    <PlanBadge
                      planCode={planCode}
                      isTrial={isTrial}
                      className="shrink-0"
                    />
                  </div>
                  {user?.email && (
                    <p className="text-xs leading-tight text-muted-foreground truncate">
                      {user.email}
                    </p>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              {/* Storage quota */}
              {user?.quota && (
                <>
                  <DropdownMenuLabel className="font-normal px-3 py-3">
                    <div className="flex items-start gap-3 text-xs text-muted-foreground">
                      <HardDrive className="h-3.5 w-3.5 shrink-0 mt-0.5" strokeWidth={1.75} />
                      <div className="flex-1 min-w-0 flex flex-col gap-2">
                        {user.quota.storage_limit_bytes === 0 ? (
                          <div className="text-foreground text-xs whitespace-nowrap">
                            Хранилище:{" "}
                            <span className="text-muted-foreground">безлимит</span>
                          </div>
                        ) : (
                          <>
                            <div className="text-foreground text-xs whitespace-nowrap">
                              {formatStorage(user.quota.storage_used_bytes ?? 0)}{" "}
                              <span className="text-muted-foreground">/ {formatStorage(user.quota.storage_limit_bytes ?? 0)}</span>
                            </div>
                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all bg-primary"
                                style={{
                                  width: `${Math.max(Math.min(Math.round(((user.quota.storage_used_bytes ?? 0) / (user.quota.storage_limit_bytes || 1)) * 100), 100), (user.quota.storage_used_bytes ?? 0) > 0 ? 4 : 0)}%`,
                                }}
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                </>
              )}

              {/* Cabinet */}
              <DropdownMenuItem className="cursor-pointer" asChild>
                <Link href="/cabinet" target="_blank" rel="noopener">
                  <LayoutDashboard className="mr-2 h-4 w-4" strokeWidth={1.75} />
                  Личный кабинет
                </Link>
              </DropdownMenuItem>

              {/* Achievements — mobile only (on sm+ the OnboardingProgress ring in the navbar
                  serves the same purpose). */}
              <DropdownMenuItem className="cursor-pointer sm:hidden" asChild>
                <Link href="/cabinet/achievements" target="_blank" rel="noopener">
                  <Trophy className="mr-2 h-4 w-4" strokeWidth={1.75} />
                  <span>Достижения</span>
                  {achievementsTotal > 0 && (
                    <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                      {achievementsDone} из {achievementsTotal}
                    </span>
                  )}
                </Link>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {/* Theme segmented switch — full-width, icon-only, no label.
                  Sun/Moon are obvious enough; bigger hit area. */}
              <div className="px-2 py-1.5">
                <div
                  role="group"
                  aria-label="Переключение темы"
                  className="flex items-center rounded-md border border-border bg-muted/40 p-0.5"
                >
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setTheme("light"); }}
                    className={cn(
                      "flex-1 inline-flex items-center justify-center h-8 rounded-sm transition-colors",
                      !isDark
                        ? "bg-primary/15 text-primary shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    aria-label="Светлая тема"
                    aria-pressed={!isDark}
                  >
                    <Sun className="h-[18px] w-[18px]" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setTheme("dark"); }}
                    className={cn(
                      "flex-1 inline-flex items-center justify-center h-8 rounded-sm transition-colors",
                      isDark
                        ? "bg-primary/15 text-primary shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    aria-label="Тёмная тема"
                    aria-pressed={isDark}
                  >
                    <Moon className="h-[18px] w-[18px]" strokeWidth={2} />
                  </button>
                </div>
              </div>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                onClick={handleLogout}
              >
                <LogOut className="mr-2 h-4 w-4" strokeWidth={1.75} />
                Выйти
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
