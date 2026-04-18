"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Clapperboard, Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { useAuthStore } from "@/lib/store/auth";
import { authApi } from "@/lib/api/auth";

type FieldErrors = {
  username?: string;
  password?: string;
  form?: string;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1.5 text-[12px] leading-snug text-red-400">{message}</p>
  );
}

function LoginPageContent() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);

  const setTokens = useAuthStore((s) => s.setTokens);
  const setUser = useAuthStore((s) => s.setUser);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("next") || "/projects";

  function validate(): FieldErrors {
    const e: FieldErrors = {};
    if (!username.trim()) e.username = "Введите логин или email";
    if (!password) e.password = "Введите пароль";
    return e;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);

    const fieldErrors = validate();
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;

    setIsLoading(true);
    setErrors({});
    try {
      const tokens = await authApi.login({
        username: username.trim(),
        password,
      });
      setTokens(tokens.access, tokens.refresh);

      const user = await authApi.getMe();
      setUser(user);

      router.replace(redirectTo);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Ошибка входа";
      const lower = raw.toLowerCase();
      const message =
        lower.includes("no active account") || lower.includes("credentials")
          ? "Неверный логин или пароль"
          : raw;
      setErrors({ form: message });
    } finally {
      setIsLoading(false);
    }
  }

  function onFieldChange(field: "username" | "password", value: string) {
    if (field === "username") setUsername(value);
    if (field === "password") setPassword(value);
    if (submitted) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        delete next.form;
        return next;
      });
    }
  }

  const borderError = "border-red-500/50";
  const borderNormal = "border-[#252538]";

  return (
    <div
      className="flex flex-1 flex-col justify-center py-10"
      style={{ paddingLeft: "clamp(24px, 5vw, 64px)", paddingRight: "clamp(24px, 5vw, 64px)" }}
    >
      {/* Logo */}
      <div className="mb-10 flex items-center gap-3.5">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
          <Clapperboard className="h-6 w-6 text-white" />
        </div>
        <span className="text-[32px] font-extrabold tracking-tight text-white">
          Раскадровка
        </span>
      </div>

      {/* Title */}
      <div className="mb-8">
        <h1 className="text-[34px] font-extrabold leading-tight tracking-tight text-white">
          Войти в аккаунт
        </h1>
      </div>

      {/* Form-level error */}
      {errors.form && (
        <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-[13px] text-red-400">
          {errors.form}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Логин */}
        <div>
          <label
            htmlFor="username"
            className="mb-1.5 block text-[14px] font-medium text-[#9CA3AF]"
          >
            Логин или email
          </label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => onFieldChange("username", e.target.value)}
            disabled={isLoading}
            className={`h-[50px] w-full rounded-xl border ${errors.username ? borderError : borderNormal} bg-[#13131D] px-4 text-[15px] text-white outline-none transition-colors placeholder:text-[#4A4A6A] focus:border-primary/60 disabled:opacity-50`}
          />
          <FieldError message={errors.username} />
        </div>

        {/* Пароль */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label
              htmlFor="password"
              className="block text-[14px] font-medium text-[#9CA3AF]"
            >
              Пароль
            </label>
            <Link
              href="/forgot-password"
              className="text-[13px] font-medium text-primary transition-colors hover:text-primary/80"
            >
              Забыли пароль?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => onFieldChange("password", e.target.value)}
              disabled={isLoading}
              className={`h-[50px] w-full rounded-xl border ${errors.password ? borderError : borderNormal} bg-[#13131D] px-4 pr-12 text-[15px] text-white outline-none transition-colors placeholder:text-[#4A4A6A] focus:border-primary/60 disabled:opacity-50`}
            />
            <button
              type="button"
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6B7280] transition-colors hover:text-white"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
              aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
            >
              {showPassword ? (
                <EyeOff className="h-[18px] w-[18px]" />
              ) : (
                <Eye className="h-[18px] w-[18px]" />
              )}
            </button>
          </div>
          <FieldError message={errors.password} />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading}
          className="flex h-[54px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-primary to-purple-800 text-[16px] font-bold text-white shadow-[0_6px_24px_rgba(124,58,237,0.25)] transition-all hover:shadow-[0_8px_32px_rgba(124,58,237,0.35)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Входим...
            </>
          ) : (
            <>
              <LogIn className="h-[18px] w-[18px]" />
              Войти
            </>
          )}
        </button>
      </form>

      {/* Register link */}
      <p className="mt-8 text-[14px] text-[#6B7280]">
        Нет аккаунта?{" "}
        <Link
          href="/register"
          className="font-semibold text-primary transition-colors hover:text-primary/80"
        >
          Зарегистрироваться
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#6B7280]" />
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
