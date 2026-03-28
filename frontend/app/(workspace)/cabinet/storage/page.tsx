"use client";

import { useEffect, useState } from "react";
import { getStorage } from "@/lib/api/cabinet";
import { formatStorage } from "@/lib/utils/format";
import type { CabinetStorage } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";

export default function StoragePage() {
  const [data, setData] = useState<CabinetStorage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStorage().then(setData).finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const usagePercent = data.storage_limit_bytes > 0
    ? Math.round((data.storage_used_bytes / data.storage_limit_bytes) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Хранилище</h1>

      {/* Progress card */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-base font-semibold">
            {formatStorage(data.storage_used_bytes)} из {formatStorage(data.storage_limit_bytes)}
          </span>
          <span className="text-lg font-bold font-mono text-yellow-500">{usagePercent}%</span>
        </div>
        <div className="h-3 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70 transition-all"
            style={{ width: `${Math.min(usagePercent, 100)}%` }}
          />
        </div>
      </div>

      {/* Projects table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Проект</th>
              <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Файлов</th>
              <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Объём</th>
              <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">% лимита</th>
            </tr>
          </thead>
          <tbody>
            {data.by_project.length > 0 ? (
              data.by_project.map((p) => {
                const pct = data.storage_limit_bytes > 0
                  ? ((p.storage_bytes / data.storage_limit_bytes) * 100).toFixed(1)
                  : "0";
                return (
                  <tr key={p.project_id} className="border-b border-border hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-foreground">{p.project_name}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{p.elements_count}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-foreground">{formatStorage(p.storage_bytes)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-yellow-500">{pct}%</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                  Нет проектов с файлами
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
