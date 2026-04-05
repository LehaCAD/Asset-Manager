"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/lib/store/auth";
import { authApi } from "@/lib/api/auth";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [tosAccepted, setTosAccepted] = useState(false);

  const setTokens = useAuthStore((s) => s.setTokens);
  const setUser = useAuthStore((s) => s.setUser);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!username.trim() || !email.trim() || !password) {
      toast.error("Заполните все поля");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Пароли не совпадают");
      return;
    }

    if (password.length < 8) {
      toast.error("Пароль должен быть не менее 8 символов");
      return;
    }

    setIsLoading(true);
    try {
      const tokens = await authApi.register({
        username: username.trim(),
        email: email.trim(),
        password,
        tos_accepted: tosAccepted,
      });
      setTokens(tokens.access, tokens.refresh);

      const user = await authApi.getMe();
      setUser(user);

      toast.success("Аккаунт создан");
      router.replace("/projects");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Ошибка регистрации";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="px-8 pt-8 pb-6">
          <div className="mb-7 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              Создать аккаунт
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Зарегистрируйтесь, чтобы начать работу
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Логин</Label>
              <Input
                id="username"
                type="text"
                placeholder="your_username"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Пароль</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Минимум 8 символов"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors duration-150 cursor-pointer"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Повторите пароль</Label>
              <Input
                id="confirm-password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="flex items-start gap-2.5">
              <input
                type="checkbox"
                id="tos"
                checked={tosAccepted}
                onChange={(e) => setTosAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border accent-primary cursor-pointer"
                disabled={isLoading}
              />
              <label htmlFor="tos" className="text-sm text-muted-foreground cursor-pointer leading-snug">
                Я принимаю{' '}
                <Link href="/terms" className="text-foreground underline hover:no-underline" target="_blank">
                  Условия использования
                </Link>
                {' '}и{' '}
                <Link href="/privacy" className="text-foreground underline hover:no-underline" target="_blank">
                  Политику конфиденциальности
                </Link>
              </label>
            </div>

            <Button
              type="submit"
              className="w-full mt-2"
              disabled={!tosAccepted || isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Создаём аккаунт...
                </>
              ) : (
                "Зарегистрироваться"
              )}
            </Button>
          </form>
        </div>

        <div className="border-t border-border px-8 py-4 text-center">
          <p className="text-sm text-muted-foreground">
            Уже есть аккаунт?{" "}
            <Link
              href="/login"
              className="text-primary hover:underline font-medium transition-colors"
            >
              Войти
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
