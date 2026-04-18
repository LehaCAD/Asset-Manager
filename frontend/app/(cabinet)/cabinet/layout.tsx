"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  TrendingUp,
  History,
  Wallet,
  CircleCheckBig,
  HardDrive,
  Bell,
  Settings,
  Clapperboard,
  MessageCircle,
  Inbox,
  Menu,
  X,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/store/auth";
import { KadrIcon } from "@/components/ui/kadr-icon";
import { useCreditsStore } from "@/lib/store/credits";
import { useFeedbackAdminStore } from "@/lib/store/feedback-admin";
import { formatCurrency } from "@/lib/utils/format";
import { useEffect, useState, useCallback } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

function getNavSections(isStaff: boolean) {
  const sections: { label: string; items: NavItem[] }[] = [
    {
      label: "Обзор",
      items: [
        { href: "/cabinet/analytics", label: "Аналитика", icon: TrendingUp },
        { href: "/cabinet/history", label: "Журнал", icon: History },
        { href: "/cabinet/achievements", label: "Достижения", icon: Trophy },
      ],
    },
    {
      label: "Оплата",
      items: [
        { href: "/cabinet/subscription", label: "Подписка", icon: CircleCheckBig },
        { href: "/cabinet/balance", label: "Платежи", icon: Wallet },
      ],
    },
    {
      label: "Инструменты",
      items: [
        { href: "/cabinet/storage", label: "Хранилище", icon: HardDrive },
        { href: "/cabinet/notifications", label: "Уведомления", icon: Bell },
        { href: "/cabinet/feedback", label: "Обратная связь", icon: MessageCircle },
        { href: "/cabinet/settings", label: "Профиль", icon: Settings },
      ],
    },
  ];

  if (isStaff) {
    sections.push({
      label: "Администрирование",
      items: [
        { href: "/cabinet/inbox", label: "Входящие", icon: Inbox },
      ],
    });
  }

  return sections;
}

/** Find the label for the current page */
function getCurrentPageLabel(pathname: string, sections: { items: NavItem[] }[]): string {
  for (const section of sections) {
    for (const item of section.items) {
      if (pathname.startsWith(item.href)) return item.label;
    }
  }
  return "Кабинет";
}

export default function CabinetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const balance = useCreditsStore((s) => s.balance);
  const loadBalance = useCreditsStore((s) => s.loadBalance);
  const totalUnread = useFeedbackAdminStore((s) => s.totalUnread);
  const loadAdminConversations = useFeedbackAdminStore((s) => s.loadConversations);

  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => { loadBalance(); }, [loadBalance]);

  useEffect(() => {
    if (user?.is_staff) loadAdminConversations();
  }, [user?.is_staff, loadAdminConversations]);

  // Close drawer on navigation
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  const NAV_SECTIONS = getNavSections(!!user?.is_staff);
  const currentLabel = getCurrentPageLabel(pathname, NAV_SECTIONS);

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : "??";

  const isFullHeight = pathname === "/cabinet/inbox" || pathname === "/cabinet/feedback";

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  return (
    <div className="flex flex-1 min-h-0 flex-col md:flex-row p-0 md:p-3 gap-0 md:gap-3 max-w-[1440px] mx-auto w-full">

      {/* ── Mobile header bar ──────────────────────────── */}
      <div className="md:hidden flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 border-b border-border bg-background">
        <button
          onClick={() => setDrawerOpen(true)}
          className="p-1.5 -ml-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-sm font-semibold text-foreground">{currentLabel}</span>
        <div className="flex items-center gap-1.5">
          <KadrIcon size="sm" className="relative top-[-0.5px]" />
          <span className="text-xs font-bold font-mono text-foreground">{formatCurrency(balance)}</span>
        </div>
      </div>

      {/* ── Mobile drawer overlay ──────────────────────── */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 transition-opacity"
            onClick={closeDrawer}
          />
          {/* Drawer panel */}
          <div className="relative w-[280px] max-w-[80vw] bg-sidebar border-r border-border flex flex-col h-full pt-[max(0.75rem,env(safe-area-inset-top))]">
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 pb-3">
              <Link
                href="/projects"
                onClick={closeDrawer}
                className="flex items-center gap-2"
              >
                <Clapperboard className="h-4 w-4 text-primary" strokeWidth={1.75} />
                <span className="text-[13px] font-semibold text-foreground tracking-tight">
                  Раскадровка
                </span>
              </Link>
              <button
                onClick={closeDrawer}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* User card */}
            <div className="flex items-center gap-2.5 px-4 py-2.5 mb-2">
              <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                <span className="text-[11px] font-bold text-primary-foreground">{initials}</span>
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-foreground truncate">{user?.username ?? "Пользователь"}</p>
                {user?.email && (
                  <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                )}
              </div>
            </div>

            {/* Navigation */}
            <div className="flex-1 overflow-y-auto px-2">
              <div className="flex flex-col gap-3">
                {NAV_SECTIONS.map((section) => (
                  <div key={section.label}>
                    <p className="px-3 pb-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      {section.label}
                    </p>
                    <div className="flex flex-col gap-0.5">
                      {section.items.map(({ href, label, icon: Icon }) => {
                        const active = pathname.startsWith(href);
                        const showBadge = href === "/cabinet/inbox" && totalUnread > 0;
                        return (
                          <Link
                            key={href}
                            href={href}
                            onClick={closeDrawer}
                            className={cn(
                              "flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[13px] font-medium transition-colors",
                              active
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                            )}
                          >
                            <Icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
                            {label}
                            {showBadge && (
                              <span className="min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-medium flex items-center justify-center px-1 ml-auto">
                                {totalUnread > 99 ? "99+" : totalUnread}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom: balance */}
            <div className="mx-3 mb-3 mt-2 rounded-md bg-card border border-border px-3 py-2.5">
              <p className="text-[11px] text-muted-foreground mb-1">Баланс</p>
              <div className="flex items-center gap-1.5">
                <KadrIcon size="sm" className="relative top-[-0.5px]" />
                <span className="text-sm font-bold font-mono text-foreground">{formatCurrency(balance)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Desktop sidebar ────────────────────────────── */}
      <nav className="hidden md:flex w-[260px] shrink-0 rounded-md border border-border bg-sidebar flex-col p-3 justify-between">
        <div>
          {/* Logo → projects */}
          <Link
            href="/projects"
            className="flex items-center gap-2 px-3 py-2 mb-3 rounded-md hover:bg-muted/50 transition-colors"
          >
            <Clapperboard className="h-4 w-4 text-primary" strokeWidth={1.75} />
            <span className="text-[13px] font-semibold text-foreground tracking-tight">
              Раскадровка
            </span>
          </Link>

          {/* User card */}
          <div className="flex items-center gap-2.5 px-3 py-2.5 mb-3">
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center shrink-0">
              <span className="text-[11px] font-bold text-primary-foreground">{initials}</span>
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-foreground truncate">{user?.username ?? "Пользователь"}</p>
              {user?.email && (
                <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
              )}
            </div>
          </div>

          {/* Grouped navigation */}
          <div className="flex flex-col gap-3">
            {NAV_SECTIONS.map((section) => (
              <div key={section.label}>
                <p className="px-3 pb-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  {section.label}
                </p>
                <div className="flex flex-col gap-0.5">
                  {section.items.map(({ href, label, icon: Icon }) => {
                    const active = pathname.startsWith(href);
                    const showUnreadBadge = href === '/cabinet/inbox' && totalUnread > 0;
                    return (
                      <Link
                        key={href}
                        href={href}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors",
                          active
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        )}
                      >
                        <Icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
                        {label}
                        {showUnreadBadge && (
                          <span className="min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-medium flex items-center justify-center px-1 ml-auto">
                            {totalUnread > 99 ? '99+' : totalUnread}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom: balance */}
        <div className="mt-4 rounded-md bg-card border border-border px-3 py-2.5">
          <p className="text-[11px] text-muted-foreground mb-1">Баланс</p>
          <div className="flex items-center gap-1.5">
            <KadrIcon size="sm" className="relative top-[-0.5px]" />
            <span className="text-sm font-bold font-mono text-foreground">{formatCurrency(balance)}</span>
          </div>
        </div>
      </nav>

      {/* ── Content ────────────────────────────────────── */}
      <div className={cn(
        "flex-1 md:rounded-md md:border md:border-border bg-background md:shadow-[var(--shadow-card)] overflow-x-hidden",
        isFullHeight
          ? "flex flex-col overflow-hidden"
          : "overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      )}>
        {isFullHeight ? (
          children
        ) : (
          <div className="max-w-5xl mx-auto px-4 py-5 md:p-8 space-y-6">{children}</div>
        )}
      </div>
    </div>
  );
}
