"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authApi } from "@/lib/api/auth";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [tokenExpired, setTokenExpired] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || !passwordConfirm) return;
    if (password !== passwordConfirm) {
      toast.error("Пароли не совпадают");
      return;
    }
    if (password.length < 8) {
      toast.error("Пароль должен быть не менее 8 символов");
      return;
    }
    setIsLoading(true);
    try {
      await authApi.resetPassword(token, password, passwordConfirm);
      setDone(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ошибка";
      if (message.toLowerCase().includes("истёк") || message.toLowerCase().includes("недействительный")) {
        setTokenExpired(true);
      } else {
        toast.error(message);
      }
    } finally {
      setIsLoading(false);
    }
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="px-8 py-10 text-center">
            <h1 className="text-xl font-semibold mb-2">Пароль изменён</h1>
            <p className="text-sm text-muted-foreground mb-6">Теперь можете войти с новым паролем.</p>
            <Button asChild className="w-full">
              <Link href="/login">Войти</Link>
            </Button>
          </div>
        </div>
      </div>
      </div>
    );
  }

  if (tokenExpired) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="px-8 py-10 text-center">
            <h1 className="text-xl font-semibold mb-2">Ссылка устарела</h1>
            <p className="text-sm text-muted-foreground mb-6">Ссылка для сброса пароля действительна только 1 час.</p>
            <Button asChild variant="outline" className="w-full">
              <Link href="/forgot-password">Запросить новую ссылку</Link>
            </Button>
          </div>
        </div>
      </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
    <div className="w-full max-w-sm">
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="px-8 pt-8 pb-6">
          <div className="mb-7 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Новый пароль</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">Придумайте надёжный пароль</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">Новый пароль</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Минимум 8 символов"
                  autoComplete="new-password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password-confirm">Повторите пароль</Label>
              <Input
                id="password-confirm"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                autoComplete="new-password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <Button type="submit" className="w-full mt-2" disabled={isLoading || !password || !passwordConfirm}>
              {isLoading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Сохраняем...</>
              ) : (
                "Сохранить пароль"
              )}
            </Button>
          </form>
        </div>
        <div className="border-t border-border px-8 py-4 text-center">
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Вернуться к входу
          </Link>
        </div>
      </div>
    </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
    <Suspense fallback={
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="px-8 py-10 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </div>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
    </div>
  );
}
