"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  TrendingUp,
  History,
  Wallet,
  HardDrive,
  Bell,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/cabinet/analytics", label: "Аналитика", icon: TrendingUp },
  { href: "/cabinet/history", label: "Журнал", icon: History },
  { href: "/cabinet/balance", label: "Баланс", icon: Wallet },
  { href: "/cabinet/storage", label: "Хранилище", icon: HardDrive },
  { href: "/cabinet/notifications", label: "Уведомления", icon: Bell },
  { href: "/cabinet/settings", label: "Настройки", icon: Settings },
];

export default function CabinetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex flex-1 min-h-0">
      {/* Sidebar */}
      <nav className="w-[200px] shrink-0 border-r border-border bg-card flex flex-col gap-1 p-3">
        <div className="px-3 py-2 mb-2">
          <span className="text-sm font-semibold text-foreground">Кабинет</span>
        </div>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors",
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl p-8 space-y-6">{children}</div>
      </div>
    </div>
  );
}
