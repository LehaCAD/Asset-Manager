"use client";

import { useEffect, useState } from "react";
import { getStorage } from "@/lib/api/cabinet";
import { formatStorage } from "@/lib/utils/format";
import type { CabinetStorage } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { HardDrive, FolderOpen } from "lucide-react";

export default function StoragePage() {
  const [data, setData] = useState<CabinetStorage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStorage().then(setData).finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const usagePercent = data.storage_limit_bytes > 0
    ? Math.round((data.storage_used_bytes / data.storage_limit_bytes) * 100)
    : 0;

  const totalUsed = data.storage_used_bytes;
  const totalFiles = data.by_project.reduce((sum, p) => sum + p.elements_count, 0);

  /* Progress bar color: green normally, orange >70%, red >90% */
  const barColor = usagePercent >= 90
    ? "bg-destructive"
    : usagePercent >= 70
      ? "bg-warning"
      : "bg-primary";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Хранилище</h1>
        <p className="text-sm text-muted-foreground mt-1">Место, занимаемое вашими файлами</p>
      </div>

      {/* Usage card */}
      <div className="rounded-xl border border-border bg-card/80 p-6 space-y-4">
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
        <div className="h-2.5 rounded-full bg-muted/60 overflow-hidden">
          <div
            className={`h-full rounded-full ${barColor} transition-all`}
            style={{ width: `${Math.max(Math.min(usagePercent, 100), totalUsed > 0 ? 1 : 0)}%` }}
          />
        </div>
        {usagePercent >= 90 && (
          <p className="text-[11px] text-destructive">Хранилище почти заполнено. Удалите ненужные файлы или обратитесь в поддержку.</p>
        )}
      </div>

      {/* Projects breakdown */}
      <h2 className="text-base font-semibold text-foreground">По проектам</h2>

      {data.by_project.length > 0 ? (
        <div className="rounded-xl border border-border bg-card/80 overflow-hidden divide-y divide-border/50">
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
                <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/70 transition-all"
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
        <div className="rounded-xl border border-border bg-card/80 px-4 py-16 text-center text-muted-foreground">
          Нет проектов с файлами
        </div>
      )}
    </div>
  );
}
