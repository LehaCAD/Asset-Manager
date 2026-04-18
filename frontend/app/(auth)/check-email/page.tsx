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
      <div className="mb-6 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
          <Clapperboard className="h-5 w-5 text-white" />
        </div>
        <span className="text-[22px] font-extrabold tracking-tight text-white">
          Раскадровка
        </span>
      </div>

      {/* Title */}
      <h1 className="mb-2 text-[20px] font-bold leading-tight tracking-tight text-white">
        Подтвердите email
      </h1>

      {/* Description — one compact line (+ email if known) */}
      <p className="mb-5 text-[13px] leading-snug text-[#9CA3AF]">
        Ссылка для подтверждения отправлена{email ? ' на ' : '.'}
        {email && <span className="font-semibold text-white">{email}</span>}
        {email ? '. ' : ' '}
        Проверьте входящие и папку «Спам».
      </p>

      {/* Actions */}
      <div className="space-y-2">
        {/* Resend */}
        {resendDone ? (
          <div className="flex h-10 items-center justify-center gap-2 rounded-lg border border-[#252538] text-[13px] text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Письмо отправлено повторно
          </div>
        ) : (
          <button
            onClick={handleResend}
            disabled={resendLoading}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#252538] text-[13px] font-medium text-[#9CA3AF] transition-colors hover:border-[#353548] hover:text-white disabled:opacity-50"
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
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-b from-primary to-purple-800 text-[14px] font-bold text-white shadow-[0_4px_16px_rgba(124,58,237,0.25)] transition-all hover:shadow-[0_6px_20px_rgba(124,58,237,0.35)]"
        >
          Продолжить
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Help text */}
      <p className="mt-5 text-center text-[12px] text-[#4A4A6A]">
        Подтвердить email можно позже в настройках
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
