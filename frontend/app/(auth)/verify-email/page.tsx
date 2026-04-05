"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authApi } from "@/lib/api/auth";
import { useAuthStore } from "@/lib/store/auth";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
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
    authApi.verifyEmail(token)
      .then(() => {
        setStatus("success");
        // Update user in store if logged in
        if (user) {
          setUser({ ...user, is_email_verified: true });
        }
      })
      .catch((err) => {
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "Ссылка недействительна или устарела");
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
    <div className="w-full max-w-sm">
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="px-8 py-10 text-center">
          {status === "loading" && (
            <>
              <Loader2 className="mx-auto h-10 w-10 animate-spin text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Подтверждаем email...</p>
            </>
          )}
          {status === "success" && (
            <>
              <CheckCircle2 className="mx-auto h-10 w-10 text-green-500 mb-4" />
              <h1 className="text-xl font-semibold mb-2">Email подтверждён</h1>
              <p className="text-sm text-muted-foreground mb-6">Ваш аккаунт активирован. Можете начинать работу.</p>
              <Button asChild className="w-full">
                <Link href="/projects">Перейти к проектам</Link>
              </Button>
            </>
          )}
          {status === "error" && (
            <>
              <XCircle className="mx-auto h-10 w-10 text-destructive mb-4" />
              <h1 className="text-xl font-semibold mb-2">Ссылка недействительна</h1>
              <p className="text-sm text-muted-foreground mb-6">{errorMessage}</p>
              {user && !user.is_email_verified && (
                resendDone ? (
                  <p className="text-sm text-muted-foreground">Письмо отправлено, проверьте почту.</p>
                ) : (
                  <Button variant="outline" className="w-full" onClick={handleResend} disabled={resendLoading}>
                    {resendLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Отправить повторно
                  </Button>
                )
              )}
              <div className="mt-4">
                <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Вернуться к входу
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="px-8 py-10 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
