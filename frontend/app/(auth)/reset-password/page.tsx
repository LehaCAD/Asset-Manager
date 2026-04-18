"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Clapperboard,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";
import { authApi } from "@/lib/api/auth";

type FieldErrors = {
  password?: string;
  passwordConfirm?: string;
  form?: string;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1.5 text-[12px] leading-snug text-red-400">{message}</p>
  );
}

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [tokenExpired, setTokenExpired] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);

  function validate(): FieldErrors {
    const e: FieldErrors = {};
    if (!password) {
      e.password = "Введите пароль";
    } else if (password.length < 8) {
      e.password = "Пароль должен быть не менее 8 символов";
    }
    if (!passwordConfirm) {
      e.passwordConfirm = "Подтвердите пароль";
    } else if (password && passwordConfirm !== password) {
      e.passwordConfirm = "Пароли не совпадают";
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
      await authApi.resetPassword(token, password, passwordConfirm);
      setDone(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ошибка";
      if (
        message.toLowerCase().includes("истёк") ||
        message.toLowerCase().includes("недействительный")
      ) {
        setTokenExpired(true);
      } else {
        setErrors({ form: message });
      }
    } finally {
      setIsLoading(false);
    }
  }

  function onFieldChange(field: "password" | "passwordConfirm", value: string) {
    if (field === "password") setPassword(value);
    if (field === "passwordConfirm") setPasswordConfirm(value);
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

  if (done) {
    return (
      <div
        className="flex flex-1 flex-col justify-center py-10"
        style={{ paddingLeft: "clamp(24px, 5vw, 64px)", paddingRight: "clamp(24px, 5vw, 64px)" }}
      >
        <div className="mb-10 flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Clapperboard className="h-6 w-6 text-white" />
          </div>
          <span className="text-[32px] font-extrabold tracking-tight text-white">
            Раскадровка
          </span>
        </div>

        <div className="space-y-6">
          <div className="flex items-start gap-4 rounded-2xl border border-[#252538] bg-[#13131D] p-6">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="space-y-1.5">
              <p className="text-[15px] font-semibold text-white">
                Пароль изменён
              </p>
              <p className="text-[13px] leading-relaxed text-[#8B8BA3]">
                Теперь можете войти с новым паролем.
              </p>
            </div>
          </div>

          <Link
            href="/login"
            className="flex h-[54px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-primary to-purple-800 text-[16px] font-bold text-white shadow-[0_6px_24px_rgba(124,58,237,0.25)] transition-all hover:shadow-[0_8px_32px_rgba(124,58,237,0.35)]"
          >
            Войти
          </Link>
        </div>
      </div>
    );
  }

  if (tokenExpired) {
    return (
      <div
        className="flex flex-1 flex-col justify-center py-10"
        style={{ paddingLeft: "clamp(24px, 5vw, 64px)", paddingRight: "clamp(24px, 5vw, 64px)" }}
      >
        <div className="mb-10 flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Clapperboard className="h-6 w-6 text-white" />
          </div>
          <span className="text-[32px] font-extrabold tracking-tight text-white">
            Раскадровка
          </span>
        </div>

        <div className="space-y-6">
          <div className="flex items-start gap-4 rounded-2xl border border-[#252538] bg-[#13131D] p-6">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
            </div>
            <div className="space-y-1.5">
              <p className="text-[15px] font-semibold text-white">
                Ссылка устарела
              </p>
              <p className="text-[13px] leading-relaxed text-[#8B8BA3]">
                Ссылка для сброса пароля действительна только 1 час. Запросите
                новую.
              </p>
            </div>
          </div>

          <Link
            href="/forgot-password"
            className="flex h-[54px] w-full items-center justify-center rounded-xl border border-[#252538] text-[15px] font-semibold text-white transition-colors hover:bg-[#13131D]"
          >
            Запросить новую ссылку
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-1 flex-col justify-center py-10"
      style={{ paddingLeft: "clamp(24px, 5vw, 64px)", paddingRight: "clamp(24px, 5vw, 64px)" }}
    >
      <div className="mb-10 flex items-center gap-3.5">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
          <Clapperboard className="h-6 w-6 text-white" />
        </div>
        <span className="text-[32px] font-extrabold tracking-tight text-white">
          Раскадровка
        </span>
      </div>

      <div className="mb-8 space-y-2">
        <h1 className="text-[34px] font-extrabold leading-tight tracking-tight text-white">
          Новый пароль
        </h1>
        <p className="text-[15px] text-[#9CA3AF]">
          Придумайте надёжный пароль
        </p>
      </div>

      {/* Form-level error */}
      {errors.form && (
        <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-[13px] text-red-400">
          {errors.form}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label
            htmlFor="password"
            className="mb-1.5 block text-[14px] font-medium text-[#9CA3AF]"
          >
            Новый пароль
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              autoFocus
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

        <div>
          <label
            htmlFor="password-confirm"
            className="mb-1.5 block text-[14px] font-medium text-[#9CA3AF]"
          >
            Повторите пароль
          </label>
          <div className="relative">
            <input
              id="password-confirm"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={passwordConfirm}
              onChange={(e) => onFieldChange("passwordConfirm", e.target.value)}
              disabled={isLoading}
              className={`h-[50px] w-full rounded-xl border ${errors.passwordConfirm ? borderError : borderNormal} bg-[#13131D] px-4 pr-12 text-[15px] text-white outline-none transition-colors placeholder:text-[#4A4A6A] focus:border-primary/60 disabled:opacity-50`}
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
          <FieldError message={errors.passwordConfirm} />
        </div>

        <button
          type="submit"
          disabled={isLoading || !password || !passwordConfirm}
          className="flex h-[54px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-primary to-purple-800 text-[16px] font-bold text-white shadow-[0_6px_24px_rgba(124,58,237,0.25)] transition-all hover:shadow-[0_8px_32px_rgba(124,58,237,0.35)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Сохраняем...
            </>
          ) : (
            "Сохранить пароль"
          )}
        </button>

        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-[14px] text-[#6B7280] transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Вернуться к входу
        </Link>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#6B7280]" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
