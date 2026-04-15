"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuthStore } from "@/lib/store/auth";
import { authApi } from "@/lib/api/auth";

export function useRegisterForm() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [tosAccepted, setTosAccepted] = useState(false);

  const setTokens = useAuthStore((s) => s.setTokens);
  const setUser = useAuthStore((s) => s.setUser);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!username.trim() || !email.trim() || !password) {
      toast.error("Заполните все поля");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Пароли не совпадают");
      return;
    }
    if (password.length < 8) {
      toast.error("Пароль должен быть не менее 8 символов");
      return;
    }

    setIsLoading(true);
    try {
      const tokens = await authApi.register({
        username: username.trim(),
        email: email.trim(),
        password,
        tos_accepted: tosAccepted,
      });
      setTokens(tokens.access, tokens.refresh);
      const user = await authApi.getMe();
      setUser(user);
      toast.success("Аккаунт создан");
      router.replace("/projects");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Ошибка регистрации";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }

  return {
    username, setUsername,
    email, setEmail,
    password, setPassword,
    confirmPassword, setConfirmPassword,
    showPassword, setShowPassword,
    isLoading,
    tosAccepted, setTosAccepted,
    handleSubmit,
    canSubmit: tosAccepted && !isLoading,
  };
}
