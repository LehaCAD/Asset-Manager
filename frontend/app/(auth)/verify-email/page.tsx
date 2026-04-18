"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Clapperboard,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { authApi } from "@/lib/api/auth";
import { useAuthStore } from "@/lib/store/auth";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading"
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendDone, setResendDone] = useState(false);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMessage("Ссылка недействительна");
      return;
    }
    authApi
      .verifyEmail(token)
      .then(() => {
        setStatus("success");
        if (user) {
          setUser({ ...user, is_email_verified: true });
        }
      })
      .catch((err) => {
        setStatus("error");
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Ссылка недействительна или устарела"
        );
      });
  }, [token]);

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

      <div className="space-y-6">
        {status === "loading" && (
          <div className="flex items-center gap-4 rounded-2xl border border-[#252538] bg-[#13131D] p-6">
            <Loader2 className="h-8 w-8 shrink-0 animate-spin text-primary" />
            <p className="text-[15px] text-[#8B8BA3]">Подтверждаем email...</p>
          </div>
        )}

        {status === "success" && (
          <>
            <div className="flex items-start gap-4 rounded-2xl border border-[#252538] bg-[#13131D] p-6">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              </div>
              <div className="space-y-1.5">
                <p className="text-[15px] font-semibold text-white">
                  Email подтверждён
                </p>
                <p className="text-[13px] leading-relaxed text-[#8B8BA3]">
                  Ваш аккаунт активирован. Можете начинать работу.
                </p>
              </div>
            </div>

            <Link
              href="/projects"
              className="flex h-[54px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-primary to-purple-800 text-[16px] font-bold text-white shadow-[0_6px_24px_rgba(124,58,237,0.25)] transition-all hover:shadow-[0_8px_32px_rgba(124,58,237,0.35)]"
            >
              <ArrowRight className="h-[18px] w-[18px]" />
              Перейти к проектам
            </Link>
          </>
        )}

        {status === "error" && (
          <>
            <div className="flex items-start gap-4 rounded-2xl border border-[#252538] bg-[#13131D] p-6">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-500/10">
                <XCircle className="h-5 w-5 text-red-400" />
              </div>
              <div className="space-y-1.5">
                <p className="text-[15px] font-semibold text-white">
                  Ссылка недействительна
                </p>
                <p className="text-[13px] leading-relaxed text-[#8B8BA3]">
                  {errorMessage}
                </p>
              </div>
            </div>

            {user && !user.is_email_verified && (
              resendDone ? (
                <p className="text-[13px] text-[#8B8BA3]">
                  Письмо отправлено, проверьте почту.
                </p>
              ) : (
                <button
                  onClick={handleResend}
                  disabled={resendLoading}
                  className="flex h-[54px] w-full items-center justify-center gap-2 rounded-xl border border-[#252538] text-[15px] font-semibold text-white transition-colors hover:bg-[#13131D] disabled:opacity-50"
                >
                  {resendLoading && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Отправить повторно
                </button>
              )
            )}

            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-[14px] text-[#6B7280] transition-colors hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Вернуться к входу
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#6B7280]" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
