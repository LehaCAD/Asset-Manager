"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAuthStore } from "@/lib/store/auth";
import { authApi } from "@/lib/api/auth";

export function useLoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const setTokens = useAuthStore((s) => s.setTokens);
  const setUser = useAuthStore((s) => s.setUser);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("next") || "/projects";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!username.trim() || !password) {
      toast.error("Введите логин и пароль");
      return;
    }

    setIsLoading(true);
    try {
      const tokens = await authApi.login({ username: username.trim(), password });
      setTokens(tokens.access, tokens.refresh);
      const user = await authApi.getMe();
      setUser(user);
      router.replace(redirectTo);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Ошибка входа";
      const message =
        raw.toLowerCase().includes("no active account") ||
        raw.toLowerCase().includes("credentials")
          ? "Неверный логин или пароль"
          : raw;
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }

  return {
    username, setUsername,
    password, setPassword,
    showPassword, setShowPassword,
    isLoading,
    handleSubmit,
    canSubmit: !isLoading,
  };
}
