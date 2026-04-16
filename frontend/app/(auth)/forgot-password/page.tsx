"use client";

import { useState } from "react";
import Link from "next/link";
import { Clapperboard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
      // Always show success to not reveal email existence
      setSent(true);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
    <div className="w-full max-w-sm">
      {/* Logo */}
      <div className="mb-8 flex items-center justify-center gap-2">
        <Clapperboard className="h-6 w-6 text-primary" />
        <span className="text-lg font-semibold tracking-tight">Раскадровка</span>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="px-8 pt-8 pb-6">
          <div className="mb-7 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Забыли пароль?</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Введите email — пришлём инструкции
            </p>
          </div>

          {sent ? (
            <div className="text-center py-2">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Если этот email зарегистрирован, мы отправили письмо с инструкциями по восстановлению пароля.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <Button type="submit" className="w-full mt-2" disabled={isLoading || !email.trim()}>
                {isLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Отправляем...</>
                ) : (
                  "Отправить инструкции"
                )}
              </Button>
            </form>
          )}
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
