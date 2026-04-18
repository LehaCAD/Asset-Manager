"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Clapperboard,
  Eye,
  EyeOff,
  Loader2,
  ArrowRight,
  FolderOpen,
  Share2,
  Layers,
} from "lucide-react";
import { useAuthStore } from "@/lib/store/auth";
import { authApi } from "@/lib/api/auth";

type FieldErrors = {
  username?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  form?: string;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1.5 text-[12px] leading-snug text-red-400">{message}</p>
  );
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [tosAccepted, setTosAccepted] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);

  const setTokens = useAuthStore((s) => s.setTokens);
  const setUser = useAuthStore((s) => s.setUser);
  const router = useRouter();

  function validate(): FieldErrors {
    const e: FieldErrors = {};
    if (!username.trim()) {
      e.username = "Придумайте логин";
    } else if (username.trim().length < 3) {
      e.username = "Логин должен быть не менее 3 символов";
    } else if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      e.username = "Только латиница, цифры и «_»";
    }
    if (!email.trim()) {
      e.email = "Введите email";
    } else if (!validateEmail(email.trim())) {
      e.email = "Введите корректный email";
    }
    if (!password) {
      e.password = "Введите пароль";
    } else if (password.length < 8) {
      e.password = "Пароль должен быть не менее 8 символов";
    }
    if (!confirmPassword) {
      e.confirmPassword = "Подтвердите пароль";
    } else if (password && confirmPassword !== password) {
      e.confirmPassword = "Пароли не совпадают";
    }
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
      const tokens = await authApi.register({
        username: username.trim(),
        email: email.trim(),
        password,
        tos_accepted: tosAccepted,
      });
      setTokens(tokens.access, tokens.refresh);

      // getMe is best-effort — don't block redirect if it fails
      try {
        const user = await authApi.getMe();
        setUser(user);
      } catch {
        // user profile will be fetched by AuthGuard later
      }

      router.replace(`/check-email?email=${encodeURIComponent(email.trim())}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Ошибка регистрации";
      // Try to map server field errors to inline
      const lower = message.toLowerCase();
      if (lower.includes("email") && (lower.includes("существует") || lower.includes("already") || lower.includes("unique"))) {
        setErrors({ email: "Этот email уже зарегистрирован" });
      } else if (lower.includes("username") && (lower.includes("существует") || lower.includes("already") || lower.includes("unique"))) {
        setErrors({ username: "Такой логин уже занят" });
      } else {
        setErrors({ form: message });
      }
    } finally {
      setIsLoading(false);
    }
  }

  // Live validation after first submit attempt
  function onFieldChange(field: keyof FieldErrors, value: string) {
    if (field === "username") setUsername(value);
    if (field === "email") setEmail(value);
    if (field === "password") setPassword(value);
    if (field === "confirmPassword") setConfirmPassword(value);

    if (submitted) {
      // Clear this field's error on change, will re-validate on submit
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
      className="flex flex-1 flex-col justify-center py-6"
      style={{ paddingLeft: "clamp(24px, 5vw, 64px)", paddingRight: "clamp(24px, 5vw, 64px)" }}
    >
      {/* Logo */}
      <div className="mb-6 flex items-center gap-3.5">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
          <Clapperboard className="h-6 w-6 text-white" />
        </div>
        <span className="text-[32px] font-extrabold tracking-tight text-white">
          Раскадровка
        </span>
      </div>

      {/* Mobile feature pills */}
      <div className="mb-8 flex flex-wrap gap-2 lg:hidden">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/10 px-3 py-1.5 text-[11px] font-medium text-purple-400">
          <FolderOpen className="h-3.5 w-3.5" />
          Проекты
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1.5 text-[11px] font-medium text-blue-400">
          <Share2 className="h-3.5 w-3.5" />
          Шеринг
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-500/10 px-3 py-1.5 text-[11px] font-medium text-pink-400">
          <Layers className="h-3.5 w-3.5" />
          Группы
        </span>
      </div>

      {/* Title */}
      <div className="mb-5">
        <h1 className="text-[30px] font-extrabold leading-tight tracking-tight text-white">
          Начните создавать
        </h1>
      </div>

      {/* Form-level error */}
      {errors.form && (
        <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-[13px] text-red-400">
          {errors.form}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Логин */}
        <div>
          <label
            htmlFor="username"
            className="mb-1.5 block text-[14px] font-medium text-[#9CA3AF]"
          >
            Логин
          </label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => onFieldChange("username", e.target.value.toLowerCase())}
            disabled={isLoading}
            className={`h-[50px] w-full rounded-xl border ${errors.username ? borderError : borderNormal} bg-[#13131D] px-4 text-[15px] text-white outline-none transition-colors placeholder:text-[#4A4A6A] focus:border-primary/60 disabled:opacity-50`}
          />
          {errors.username ? (
            <FieldError message={errors.username} />
          ) : (
            <p className="mt-1.5 text-[11px] leading-snug text-[#6B7280]">
              Латиница, цифры и «_»
            </p>
          )}
        </div>

        {/* Email */}
        <div>
          <label
            htmlFor="email"
            className="mb-1.5 block text-[14px] font-medium text-[#9CA3AF]"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => onFieldChange("email", e.target.value)}
            disabled={isLoading}
            className={`h-[50px] w-full rounded-xl border ${errors.email ? borderError : borderNormal} bg-[#13131D] px-4 text-[15px] text-white outline-none transition-colors placeholder:text-[#4A4A6A] focus:border-primary/60 disabled:opacity-50`}
          />
          <FieldError message={errors.email} />
        </div>

        {/* Пароль */}
        <div>
          <label
            htmlFor="password"
            className="mb-1.5 block text-[14px] font-medium text-[#9CA3AF]"
          >
            Пароль
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
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

        {/* Подтверждение пароля */}
        <div>
          <label
            htmlFor="confirm-password"
            className="mb-1.5 block text-[14px] font-medium text-[#9CA3AF]"
          >
            Подтверждение пароля
          </label>
          <div className="relative">
            <input
              id="confirm-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => onFieldChange("confirmPassword", e.target.value)}
              disabled={isLoading}
              className={`h-[50px] w-full rounded-xl border ${errors.confirmPassword ? borderError : borderNormal} bg-[#13131D] px-4 pr-12 text-[15px] text-white outline-none transition-colors placeholder:text-[#4A4A6A] focus:border-primary/60 disabled:opacity-50`}
            />
            <button
              type="button"
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6B7280] transition-colors hover:text-white"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="h-[18px] w-[18px]" />
              ) : (
                <Eye className="h-[18px] w-[18px]" />
              )}
            </button>
          </div>
          <FieldError message={errors.confirmPassword} />
        </div>

        {/* ToS checkbox */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="tos"
            checked={tosAccepted}
            onChange={(e) => setTosAccepted(e.target.checked)}
            className="h-[18px] w-[18px] shrink-0 cursor-pointer rounded border-2 border-primary bg-transparent accent-primary"
            disabled={isLoading}
          />
          <label
            htmlFor="tos"
            className="cursor-pointer text-[13px] leading-snug text-[#8B8BA3]"
          >
            Принимаю{" "}
            <Link
              href="/terms"
              className="text-white underline hover:no-underline"
              target="_blank"
            >
              условия использования
            </Link>{" "}
            и{" "}
            <Link
              href="/privacy"
              className="text-white underline hover:no-underline"
              target="_blank"
            >
              политику конфиденциальности
            </Link>
          </label>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={!tosAccepted || isLoading}
          className="flex h-[54px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-primary to-purple-800 text-[16px] font-bold text-white shadow-[0_6px_24px_rgba(124,58,237,0.25)] transition-all hover:shadow-[0_8px_32px_rgba(124,58,237,0.35)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Создаём аккаунт...
            </>
          ) : (
            <>
              <ArrowRight className="h-[18px] w-[18px]" />
              Создать аккаунт
            </>
          )}
        </button>
      </form>

      {/* Login link */}
      <p className="mt-5 text-[14px] text-[#6B7280]">
        Уже есть аккаунт?{" "}
        <Link
          href="/login"
          className="font-semibold text-primary transition-colors hover:text-primary/80"
        >
          Войти
        </Link>
      </p>
    </div>
  );
}
