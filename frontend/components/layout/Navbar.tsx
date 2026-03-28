"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, User, Clapperboard, HardDrive, LayoutDashboard } from "lucide-react";
import { ChargeIcon } from "@/components/ui/charge-icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "./ThemeToggle";
import { useAuthStore } from "@/lib/store/auth";
import { useCreditsStore } from "@/lib/store/credits";
import { authApi } from "@/lib/api/auth";
import { formatCurrency, formatStorage } from "@/lib/utils/format";

export function Navbar() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();
  
  const setUser = useAuthStore((s) => s.setUser);
  const balance = useCreditsStore((s) => s.balance);
  const loadBalance = useCreditsStore((s) => s.loadBalance);

  // Загружаем баланс и обновляем user data при монтировании
  useEffect(() => {
    if (user) {
      loadBalance();
      authApi.getMe().then(setUser).catch(() => {});
    }
  }, [user?.id, loadBalance, setUser]);

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : "??";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/60">
      <div className="flex h-12 items-center justify-between px-4">
        {/* Logo */}
        <Link
          href="/projects"
          className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity"
        >
          <Clapperboard className="h-5 w-5 text-primary" strokeWidth={1.75} />
          <span className="font-semibold text-sm tracking-tight hidden sm:block">
            Раскадровка
          </span>
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Баланс */}
          {user && (
            <div className="flex items-center gap-1.5 h-7 px-3 rounded bg-success/10 border border-success/20">
              <ChargeIcon size="sm" />
              <span className="text-xs font-medium text-foreground">{formatCurrency(balance)}</span>
            </div>
          )}
          
          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full font-medium text-xs"
                aria-label="Меню пользователя"
              >
                {user ? (
                  <span className="text-xs font-semibold">{initials}</span>
                ) : (
                  <User className="h-4 w-4" strokeWidth={1.75} />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="font-normal py-2">
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-medium leading-none">
                    {user?.username ?? "Пользователь"}
                  </p>
                  {user?.email && (
                    <p className="text-xs leading-none text-muted-foreground truncate mt-1">
                      {user.email}
                    </p>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {user?.quota && (
                <>
                  <DropdownMenuLabel className="font-normal px-3 py-3">
                    <div className="flex items-start gap-3 text-xs text-muted-foreground">
                      <HardDrive className="h-3.5 w-3.5 shrink-0 mt-0.5" strokeWidth={1.75} />
                      <div className="flex-1 min-w-0 flex flex-col gap-2">
                        <div className="text-foreground text-xs whitespace-nowrap">
                          {formatStorage(user.quota.storage_used_bytes ?? 0)}{" "}
                          <span className="text-muted-foreground">/ {formatStorage(user.quota.storage_limit_bytes ?? 0)}</span>
                        </div>
                        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              (user.quota.storage_used_bytes ?? 0) / (user.quota.storage_limit_bytes || 1) >= 0.9
                                ? "bg-error"
                                : (user.quota.storage_used_bytes ?? 0) / (user.quota.storage_limit_bytes || 1) >= 0.7
                                  ? "bg-warning"
                                  : "bg-success"
                            }`}
                            style={{
                              width: `${Math.max(Math.min(Math.round(((user.quota.storage_used_bytes ?? 0) / (user.quota.storage_limit_bytes || 1)) * 100), 100), (user.quota.storage_used_bytes ?? 0) > 0 ? 4 : 0)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem className="cursor-pointer" asChild>
                <Link href="/cabinet">
                  <LayoutDashboard className="mr-2 h-4 w-4" strokeWidth={1.75} />
                  Личный кабинет
                </Link>
              </DropdownMenuItem>
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
