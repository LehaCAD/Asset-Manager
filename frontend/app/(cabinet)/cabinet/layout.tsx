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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/store/auth";
import { KadrIcon } from "@/components/ui/kadr-icon";
import { useCreditsStore } from "@/lib/store/credits";
import { useFeedbackAdminStore } from "@/lib/store/feedback-admin";
import { formatCurrency } from "@/lib/utils/format";
import { useEffect } from "react";

function getNavSections(isStaff: boolean) {
  const sections = [
    {
      label: "Обзор",
      items: [
        { href: "/cabinet/analytics", label: "Аналитика", icon: TrendingUp },
        { href: "/cabinet/history", label: "Журнал", icon: History },
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

  useEffect(() => { loadBalance(); }, [loadBalance]);

  useEffect(() => {
    if (user?.is_staff) loadAdminConversations();
  }, [user?.is_staff, loadAdminConversations]);

  const NAV_SECTIONS = getNavSections(!!user?.is_staff);

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : "??";

  return (
    <div className="flex flex-1 min-h-0 p-3 gap-3 max-w-[1440px] mx-auto w-full">
      {/* Sidebar — floating rounded card */}
      <nav className="w-[260px] shrink-0 rounded-md border border-border bg-sidebar flex flex-col p-3 justify-between">
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

      {/* Content — also in a rounded card */}
      {(() => {
        const isFullHeight = pathname === "/cabinet/inbox" || pathname === "/cabinet/feedback";
        return (
          <div className={cn(
            "flex-1 rounded-md border border-border bg-background shadow-[var(--shadow-card)]",
            isFullHeight ? "flex flex-col overflow-hidden" : "overflow-y-auto scrollbar-thin"
          )}>
            {isFullHeight ? (
              children
            ) : (
              <div className="max-w-5xl mx-auto p-8 space-y-6">{children}</div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
