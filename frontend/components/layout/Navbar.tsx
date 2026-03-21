"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, User, Clapperboard } from "lucide-react";
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
import { formatCurrency } from "@/lib/utils/format";

export function Navbar() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();
  
  const balance = useCreditsStore((s) => s.balance);
  const loadBalance = useCreditsStore((s) => s.loadBalance);
  
  // Загружаем баланс при монтировании
  useEffect(() => {
    if (user) {
      loadBalance();
    }
  }, [user, loadBalance]);

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : "??";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center justify-between px-4">
        {/* Logo */}
        <Link
          href="/projects"
          className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity"
        >
          <Clapperboard className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm tracking-tight hidden sm:block">
            Раскадровка
          </span>
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Баланс */}
          {user && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/50 text-sm font-medium">
              <div className="flex items-center gap-1 text-sm">
                <ChargeIcon size="md" />
                <span>{formatCurrency(balance)}</span>
              </div>
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
                  <User className="h-4 w-4" />
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
              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                onClick={handleLogout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Выйти
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
