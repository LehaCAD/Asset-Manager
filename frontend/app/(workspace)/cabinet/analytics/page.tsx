"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Zap, TrendingUp, Image, HardDrive } from "lucide-react";
import { getAnalytics } from "@/lib/api/cabinet";
import { formatCurrency, formatStorage } from "@/lib/utils/format";
import type { CabinetAnalytics, AIModel } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api/client";

const PERIODS = [
  { value: "7d", label: "7 дней" },
  { value: "30d", label: "30 дней" },
  { value: "90d", label: "90 дней" },
  { value: "all", label: "Всё время" },
];

export default function AnalyticsPage() {
  const [data, setData] = useState<CabinetAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("30d");
  const [modelId, setModelId] = useState<number | undefined>();
  const [models, setModels] = useState<AIModel[]>([]);

  useEffect(() => {
    apiClient.get("/api/ai-models/").then((r) => setModels(r.data));
  }, []);

  useEffect(() => {
    setLoading(true);
    getAnalytics({ period, ai_model_id: modelId })
      .then(setData)
      .finally(() => setLoading(false));
  }, [period, modelId]);

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const { summary, spending_by_day, spending_by_model, spending_by_project, generation_stats } = data;
  const storagePercent = summary.storage_limit_bytes > 0
    ? Math.round((summary.storage_used_bytes / summary.storage_limit_bytes) * 100)
    : 0;

  const maxModelAmount = spending_by_model.length > 0
    ? Math.max(...spending_by_model.map((m) => parseFloat(m.amount)))
    : 1;
  const maxProjectAmount = spending_by_project.length > 0
    ? Math.max(...spending_by_project.map((p) => parseFloat(p.amount)))
    : 1;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Аналитика</h1>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              period === p.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
        <select
          value={modelId ?? ""}
          onChange={(e) => setModelId(e.target.value ? Number(e.target.value) : undefined)}
          className="bg-muted border border-border rounded-md px-3 py-1.5 text-xs text-foreground"
        >
          <option value="">Все модели</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard
          icon={<Zap className="h-4 w-4 text-primary" />}
          label="Баланс"
          value={formatCurrency(summary.balance)}
          sub="Зарядов"
        />
        <SummaryCard
          icon={<TrendingUp className="h-4 w-4 text-destructive" />}
          label="Потрачено"
          value={formatCurrency(summary.total_spent)}
          sub={`за ${PERIODS.find((p) => p.value === period)?.label ?? period}`}
        />
        <SummaryCard
          icon={<Image className="h-4 w-4 text-green-500" />}
          label="Генераций"
          value={String(summary.total_generations)}
          sub={`${summary.success_rate}% успешных`}
          subColor="text-green-500"
        />
        <SummaryCard
          icon={<HardDrive className="h-4 w-4 text-yellow-500" />}
          label="Хранилище"
          value={`${storagePercent}%`}
          sub={`${formatStorage(summary.storage_used_bytes)} / ${formatStorage(summary.storage_limit_bytes)}`}
          progress={storagePercent}
        />
      </div>

      {/* Bar Chart — spending by day */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold mb-4">Траты по дням</h2>
        {spending_by_day.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Нет данных за период</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={spending_by_day} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(v: string) => {
                  const d = new Date(v);
                  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
                }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                width={50}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                  fontSize: "12px",
                }}
                formatter={(value: number) => [`${value} ⚡`, "Потрачено"]}
                labelFormatter={(label: string) => {
                  const d = new Date(label);
                  return d.toLocaleDateString("ru-RU");
                }}
              />
              <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Two columns: by model + by project */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <h2 className="text-sm font-semibold">По моделям</h2>
          {spending_by_model.map((m) => (
            <div key={m.model_id} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{m.model_name}</span>
                <span className="font-mono text-foreground">{formatCurrency(m.amount)} ⚡</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(parseFloat(m.amount) / maxModelAmount) * 100}%` }}
                />
              </div>
            </div>
          ))}
          {spending_by_model.length === 0 && (
            <p className="text-xs text-muted-foreground">Нет данных</p>
          )}
        </div>
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <h2 className="text-sm font-semibold">По проектам</h2>
          {spending_by_project.map((p) => (
            <div key={p.project_id} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{p.project_name}</span>
                <span className="font-mono text-foreground">{formatCurrency(p.amount)} ⚡</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{ width: `${(parseFloat(p.amount) / maxProjectAmount) * 100}%` }}
                />
              </div>
            </div>
          ))}
          {spending_by_project.length === 0 && (
            <p className="text-xs text-muted-foreground">Нет данных</p>
          )}
        </div>
      </div>

      {/* Stats footer */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4 flex flex-col items-center gap-1">
          <span className="text-lg font-bold font-mono text-primary">
            {generation_stats.avg_cost ? `${formatCurrency(generation_stats.avg_cost)} ⚡` : "—"}
          </span>
          <span className="text-xs text-muted-foreground">Средняя стоимость</span>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 flex flex-col items-center gap-1">
          <span className="text-base font-semibold">{generation_stats.top_model ?? "—"}</span>
          <span className="text-xs text-muted-foreground">Топ модель</span>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
  subColor,
  progress,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  subColor?: string;
  progress?: number;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold font-mono">{value}</div>
      {progress !== undefined && (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      )}
      <div className={`text-[11px] ${subColor ?? "text-muted-foreground"}`}>{sub}</div>
    </div>
  );
}
