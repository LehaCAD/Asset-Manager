"use client";

import { useEffect, useState, useCallback } from "react";
import { getStorage } from "@/lib/api/cabinet";
import { formatStorage } from "@/lib/utils/format";
import type { CabinetStorage } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { HardDrive, FolderOpen, AlertCircle } from "lucide-react";

export default function StoragePage() {
  const [data, setData] = useState<CabinetStorage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await getStorage();
      setData(result);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="h-10 w-10 rounded-md bg-destructive/10 flex items-center justify-center mb-3">
          <AlertCircle className="h-5 w-5 text-destructive" />
        </div>
        <p className="text-sm font-medium text-foreground">Не удалось загрузить данные</p>
        <p className="text-xs text-muted-foreground mt-1">Попробуйте обновить страницу</p>
        <button
          onClick={() => { setError(false); loadData(); }}
          className="mt-3 px-3 py-1.5 text-xs rounded-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Повторить
        </button>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-32 rounded-md" />
        <Skeleton className="h-64 rounded-md" />
      </div>
    );
  }

  const usagePercent = data.storage_limit_bytes > 0
    ? Math.round((data.storage_used_bytes / data.storage_limit_bytes) * 100)
    : 0;

  const totalUsed = data.storage_used_bytes;
  const totalFiles = data.by_project.reduce((sum, p) => sum + p.elements_count, 0);

  const barColor = "bg-primary";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Хранилище</h1>
        <p className="text-sm text-muted-foreground mt-1">Место, занимаемое вашими файлами</p>
      </div>

      {/* Usage card */}
      <div className="rounded-md border border-border bg-card shadow-[var(--shadow-card)] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <HardDrive className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-lg font-bold text-foreground">
                {formatStorage(data.storage_used_bytes)}
                <span className="text-muted-foreground font-normal text-sm ml-1.5">
                  из {formatStorage(data.storage_limit_bytes)}
                </span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {totalFiles} файлов в {data.by_project.length} проектах
              </p>
            </div>
          </div>
          <span className="text-2xl font-bold font-mono text-foreground">{usagePercent}%</span>
        </div>
        <div className="h-3 rounded-full bg-border/40 dark:bg-muted/40 overflow-hidden">
          <div
            className={`h-full rounded-full ${barColor} transition-all`}
            style={{ width: `${Math.max(Math.min(usagePercent, 100), totalUsed > 0 ? 1 : 0)}%` }}
          />
        </div>
        {usagePercent >= 90 && (
          <p className="text-[11px] text-muted-foreground">Хранилище почти заполнено. Удалите ненужные файлы или обратитесь в поддержку.</p>
        )}
      </div>

      {/* Projects breakdown */}
      <h2 className="text-base font-semibold text-foreground">По проектам</h2>

      {data.by_project.length > 0 ? (
        <div className="rounded-md border border-border bg-card shadow-[var(--shadow-card)] overflow-hidden divide-y divide-border/50">
          {data.by_project.map((p) => {
            const sharePercent = totalUsed > 0
              ? (p.storage_bytes / totalUsed) * 100
              : 0;
            const limitPercent = data.storage_limit_bytes > 0
              ? (p.storage_bytes / data.storage_limit_bytes) * 100
              : 0;

            return (
              <div key={p.project_id} className="px-5 py-4 hover:bg-muted/20 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium text-foreground truncate">{p.project_name}</span>
                    <span className="text-[11px] text-muted-foreground shrink-0">{p.elements_count} файлов</span>
                  </div>
                  <span className="text-sm font-mono text-foreground shrink-0 ml-4">
                    {formatStorage(p.storage_bytes)}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-border/50 dark:bg-muted/50 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.max(limitPercent, 0.5)}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  {sharePercent.toFixed(0)}% от использованного пространства
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-md border border-border bg-card shadow-[var(--shadow-card)] px-4 py-16 text-center text-muted-foreground">
          Нет проектов с файлами
        </div>
      )}
    </div>
  );
}
