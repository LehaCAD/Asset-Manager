"use client";

import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRegisterForm } from "./useRegisterForm";

export function RegisterContainer() {
  const f = useRegisterForm();

  return (
    <div className="flex w-full min-w-[380px] max-w-[560px] items-center justify-center p-10 lg:w-1/2">
      <div className="w-full max-w-[360px]">
        {/* Logo */}
        <div className="mb-10 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#6C5CE7] to-[#8B7CF7] shadow-md shadow-primary/25">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="white" strokeWidth="2">
              <rect x="2" y="2" width="20" height="20" rx="2" />
              <path d="M7 2v20M2 12h20" strokeWidth="1.5" />
            </svg>
          </div>
          <span className="text-[15px] font-bold tracking-tight">Раскадровка</span>
        </div>

        {/* Title */}
        <h1 className="text-[26px] font-extrabold tracking-tight">Создать аккаунт</h1>
        <p className="mb-7 mt-1.5 text-[13px] text-muted-foreground">
          Бесплатно. Без карты. <strong className="font-semibold text-primary">Генерации сразу.</strong>
        </p>

        {/* Form */}
        <form onSubmit={f.handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reg-username" className="text-xs text-muted-foreground">Логин</Label>
            <Input id="reg-username" type="text" placeholder="your_username" autoComplete="username" autoFocus
              value={f.username} onChange={(e) => f.setUsername(e.target.value)} disabled={f.isLoading} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reg-email" className="text-xs text-muted-foreground">Email</Label>
            <Input id="reg-email" type="email" placeholder="you@example.com" autoComplete="email"
              value={f.email} onChange={(e) => f.setEmail(e.target.value)} disabled={f.isLoading} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reg-password" className="text-xs text-muted-foreground">Пароль</Label>
            <div className="relative">
              <Input id="reg-password" type={f.showPassword ? "text" : "password"}
                placeholder="Минимум 8 символов" autoComplete="new-password" className="pr-10"
                value={f.password} onChange={(e) => f.setPassword(e.target.value)} disabled={f.isLoading} />
              <button type="button" tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                onClick={() => f.setShowPassword((v) => !v)}
                aria-label={f.showPassword ? "Скрыть пароль" : "Показать пароль"}>
                {f.showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reg-confirm" className="text-xs text-muted-foreground">Повторите пароль</Label>
            <Input id="reg-confirm" type={f.showPassword ? "text" : "password"}
              placeholder="••••••••" autoComplete="new-password"
              value={f.confirmPassword} onChange={(e) => f.setConfirmPassword(e.target.value)} disabled={f.isLoading} />
          </div>

          <div className="flex items-start gap-2.5">
            <input type="checkbox" id="reg-tos" checked={f.tosAccepted}
              onChange={(e) => f.setTosAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border accent-primary cursor-pointer"
              disabled={f.isLoading} />
            <label htmlFor="reg-tos" className="cursor-pointer text-[11px] leading-snug text-muted-foreground">
              Принимаю{" "}
              <Link href="/terms" className="text-primary hover:underline" target="_blank">Условия</Link>
              {" "}и{" "}
              <Link href="/privacy" className="text-primary hover:underline" target="_blank">Политику конфиденциальности</Link>
            </label>
          </div>

          <Button type="submit" disabled={!f.canSubmit}
            className="mt-2 w-full bg-gradient-to-r from-[#6C5CE7] to-[#8B7CF7] text-white shadow-lg shadow-primary/30 hover:opacity-93">
            {f.isLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Создаём аккаунт...</>) : "Зарегистрироваться"}
          </Button>
        </form>

        {/* Divider */}
        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-border/30" />
          <span className="text-[11px] text-muted-foreground/50">или</span>
          <div className="h-px flex-1 bg-border/30" />
        </div>

        {/* Google OAuth (stub) */}
        <button type="button"
          onClick={() => toast.info("Скоро будет доступно")}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border/40 bg-card/30 text-[13px] font-medium transition-colors hover:border-primary/40 hover:bg-card/50">
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Продолжить с Google
        </button>

        {/* Login link */}
        <div className="mt-6 border-t border-border/15 pt-5 text-center">
          <p className="text-[13px] text-muted-foreground">
            Уже есть аккаунт?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">Войти</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
