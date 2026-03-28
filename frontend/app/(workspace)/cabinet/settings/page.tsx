"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun, Monitor, Trash2 } from "lucide-react";
import { useAuthStore } from "@/lib/store/auth";
import { changePassword } from "@/lib/api/cabinet";
import { apiClient } from "@/lib/api/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { theme, setTheme } = useTheme();

  const [name, setName] = useState(user?.username ?? "");
  const [saving, setSaving] = useState(false);

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [changingPwd, setChangingPwd] = useState(false);

  const handleSaveName = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { data } = await apiClient.patch("/api/auth/me/", { username: name.trim() });
      setUser(data);
      toast.success("Имя обновлено");
    } catch {
      toast.error("Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPwd || !newPwd) return;
    setChangingPwd(true);
    try {
      await changePassword(currentPwd, newPwd);
      toast.success("Пароль изменён");
      setCurrentPwd("");
      setNewPwd("");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      toast.error(msg ?? "Ошибка смены пароля");
    } finally {
      setChangingPwd(false);
    }
  };

  const THEMES = [
    { value: "dark", label: "Тёмная", icon: Moon },
    { value: "light", label: "Светлая", icon: Sun },
    { value: "system", label: "Системная", icon: Monitor },
  ] as const;

  return (
    <div className="space-y-8 max-w-md">
      <h1 className="text-xl font-bold">Настройки</h1>

      {/* Profile */}
      <section className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Имя</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Email</label>
          <input
            value={user?.email ?? ""}
            disabled
            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-muted-foreground cursor-not-allowed"
          />
          <p className="text-[11px] text-muted-foreground">Email нельзя изменить</p>
        </div>
        <button
          onClick={handleSaveName}
          disabled={saving || name === user?.username}
          className="px-5 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
        >
          {saving ? "Сохраняю..." : "Сохранить"}
        </button>
      </section>

      <hr className="border-border" />

      {/* Password */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold">Сменить пароль</h2>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Текущий пароль</label>
          <input
            type="password"
            value={currentPwd}
            onChange={(e) => setCurrentPwd(e.target.value)}
            className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Новый пароль</label>
          <input
            type="password"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground"
          />
        </div>
        <button
          onClick={handleChangePassword}
          disabled={changingPwd || !currentPwd || !newPwd}
          className="px-5 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
        >
          {changingPwd ? "Меняю..." : "Сменить пароль"}
        </button>
      </section>

      <hr className="border-border" />

      {/* Theme */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Тема</h2>
        <div className="flex gap-2">
          {THEMES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium border transition-colors",
                theme === value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-border hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </section>

      <hr className="border-border" />

      {/* Danger zone */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-destructive uppercase tracking-wider">Опасная зона</h2>
        <p className="text-xs text-muted-foreground">
          Все данные будут удалены безвозвратно. Это действие нельзя отменить.
        </p>
        <button
          disabled
          className="flex items-center gap-2 px-4 py-2 rounded-md border border-border text-muted-foreground text-xs font-medium cursor-not-allowed opacity-40"
          title="Скоро"
        >
          <Trash2 className="h-4 w-4" />
          Удалить аккаунт
        </button>
      </section>
    </div>
  );
}
