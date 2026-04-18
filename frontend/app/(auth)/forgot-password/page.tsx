"use client";

import { useState } from "react";
import Link from "next/link";
import { Clapperboard, Loader2, ArrowLeft, Mail } from "lucide-react";
import { authApi } from "@/lib/api/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setIsLoading(true);
    try {
      await authApi.forgotPassword(email.trim());
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setIsLoading(false);
    }
  }

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
      <div className="mb-8 space-y-2">
        <h1 className="text-[34px] font-extrabold leading-tight tracking-tight text-white">
          Забыли пароль?
        </h1>
        <p className="text-[15px] text-[#9CA3AF]">
          Введите email — пришлём инструкции по восстановлению
        </p>
      </div>

      {sent ? (
        <div className="space-y-6">
          <div className="flex items-start gap-4 rounded-2xl border border-[#252538] bg-[#13131D] p-6">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1.5">
              <p className="text-[15px] font-semibold text-white">
                Письмо отправлено
              </p>
              <p className="text-[13px] leading-relaxed text-[#8B8BA3]">
                Если этот email зарегистрирован, мы отправили письмо с
                инструкциями по восстановлению пароля. Проверьте почту.
              </p>
            </div>
          </div>

          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-[14px] font-medium text-primary transition-colors hover:text-primary/80"
          >
            <ArrowLeft className="h-4 w-4" />
            Вернуться к входу
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label
              htmlFor="email"
              className="block text-[14px] font-medium text-[#9CA3AF]"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              className="h-[50px] w-full rounded-xl border border-[#252538] bg-[#13131D] px-4 text-[15px] text-white outline-none transition-colors placeholder:text-[#4A4A6A] focus:border-primary/60 disabled:opacity-50"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !email.trim()}
            className="flex h-[54px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-primary to-purple-800 text-[16px] font-bold text-white shadow-[0_6px_24px_rgba(124,58,237,0.25)] transition-all hover:shadow-[0_8px_32px_rgba(124,58,237,0.35)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Отправляем...
              </>
            ) : (
              "Отправить инструкции"
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
      )}
    </div>
  );
}
