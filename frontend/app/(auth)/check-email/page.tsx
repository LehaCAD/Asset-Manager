"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import {
  Clapperboard,
  Loader2,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import { authApi } from "@/lib/api/auth";

function CheckEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";

  const [resendLoading, setResendLoading] = useState(false);
  const [resendDone, setResendDone] = useState(false);

  async function handleResend() {
    setResendLoading(true);
    try {
      await authApi.resendVerification();
      setResendDone(true);
    } catch {
      // ignore
    } finally {
      setResendLoading(false);
    }
  }

  return (
    <div
      className="flex flex-1 flex-col justify-center py-10"
      style={{
        paddingLeft: "clamp(24px, 5vw, 64px)",
        paddingRight: "clamp(24px, 5vw, 64px)",
      }}
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
      <div className="mb-3">
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-white">
          Подтвердите email
        </h1>
      </div>

      {/* Description */}
      <p className="mb-2 text-[15px] leading-relaxed text-[#9CA3AF]">
        Мы отправили письмо со ссылкой для подтверждения на адрес
      </p>
      {email && (
        <p className="mb-6 text-[15px] font-semibold text-white">{email}</p>
      )}
      {!email && <div className="mb-6" />}

      <p className="mb-8 text-[13px] leading-relaxed text-[#6B7280]">
        Перейдите по ссылке в письме, чтобы активировать аккаунт.
        Если письма нет — проверьте папку «Спам».
      </p>

      {/* Actions */}
      <div className="space-y-3">
        {/* Resend */}
        {resendDone ? (
          <div className="flex h-[50px] items-center justify-center gap-2 rounded-xl border border-[#252538] text-[14px] text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Письмо отправлено повторно
          </div>
        ) : (
          <button
            onClick={handleResend}
            disabled={resendLoading}
            className="flex h-[50px] w-full items-center justify-center gap-2 rounded-xl border border-[#252538] text-[14px] font-medium text-[#9CA3AF] transition-colors hover:border-[#353548] hover:text-white disabled:opacity-50"
          >
            {resendLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Отправить письмо повторно
          </button>
        )}

        {/* Continue to projects */}
        <Link
          href="/projects"
          className="flex h-[54px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-primary to-purple-800 text-[16px] font-bold text-white shadow-[0_6px_24px_rgba(124,58,237,0.25)] transition-all hover:shadow-[0_8px_32px_rgba(124,58,237,0.35)]"
        >
          Продолжить
          <ArrowRight className="h-[18px] w-[18px]" />
        </Link>
      </div>

      {/* Help text */}
      <p className="mt-8 text-center text-[13px] text-[#4A4A6A]">
        Подтвердить email можно позже в настройках аккаунта
      </p>
    </div>
  );
}

export default function CheckEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#6B7280]" />
        </div>
      }
    >
      <CheckEmailContent />
    </Suspense>
  );
}
