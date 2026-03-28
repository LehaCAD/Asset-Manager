"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { TrendingUp, Image, Layers, Wallet } from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { useTheme } from "next-themes";
import { getAnalytics } from "@/lib/api/cabinet";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { formatCurrency, formatStorage } from "@/lib/utils/format";
import type { CabinetAnalytics, AIModel, Project } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { SelectDropdown } from "@/components/ui/select-dropdown";
import { apiClient } from "@/lib/api/client";

/* ── Colors ─────────────────────────────────────────────── */
/* SVG fill/stroke attrs don't resolve CSS vars — we read   */
/* actual computed values from the DOM at runtime instead.  */
const BAR_COLOR = "#7C8CF5"; /* accent bar — intentionally fixed */

function resolveCssVar(varName: string): string {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  if (!raw) return "";
  /* Feed the raw value (e.g. oklch(...)) into a temp element so the
     browser converts it to a serializable rgb(...) string. */
  const el = document.createElement("span");
  el.style.color = raw;
  document.body.appendChild(el);
  const resolved = getComputedStyle(el).color;
  document.body.removeChild(el);
  return resolved;
}

function useChartColors() {
  const { resolvedTheme } = useTheme();
  const [colors, setColors] = useState({ axis: "", grid: "" });

  useEffect(() => {
    setColors({
      axis: resolveCssVar("--muted-foreground"),
      grid: resolveCssVar("--border"),
    });
  }, [resolvedTheme]);

  return colors;
}

/* ── Helpers ────────────────────────────────────────────── */

/** Parse "YYYY-MM-DD" as local date (not UTC midnight) to avoid off-by-one in UTC+ zones. */
function parseDateLocal(s: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + "T12:00:00");
  return new Date(s);
}

function dateRangeToParams(range: DateRange | undefined) {
  if (!range?.from) return {};
  const from = format(range.from, "yyyy-MM-dd");
  const to = range.to ? format(range.to, "yyyy-MM-dd") : from;
  return { date_from: from, date_to: to };
}

function defaultRange(): DateRange {
  const now = new Date();
  return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29), to: now };
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const d = parseDateLocal(label ?? "");
  const dateStr = isNaN(d.getTime()) ? label : d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg">
      <p className="text-[11px] text-muted-foreground mb-1">{dateStr}</p>
      <p className="text-sm font-semibold text-foreground font-mono">{payload[0].value}</p>
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────── */

export default function AnalyticsPage() {
  const chartColors = useChartColors();
  const [data, setData] = useState<CabinetAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(defaultRange);
  const [modelId, setModelId] = useState<number | undefined>();
  const [projectId, setProjectId] = useState<number | undefined>();
  const [models, setModels] = useState<AIModel[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    apiClient.get("/api/ai-models/").then((r) => setModels(r.data));
    apiClient.get("/api/projects/").then((r) => setProjects(r.data));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    getAnalytics({
      ...dateRangeToParams(dateRange),
      ai_model_id: modelId,
      project_id: projectId,
    })
      .then(setData)
      .finally(() => setLoading(false));
  }, [dateRange, modelId, projectId]);

  useEffect(() => { load(); }, [load]);

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-8 w-52 rounded-lg" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  const { summary, spending_by_day: rawSpendingByDay, spending_by_model, spending_by_project, generation_stats } = data;

  /* Parse amounts to numbers for Recharts — API returns strings */
  const spending_by_day = rawSpendingByDay.map((d) => ({
    ...d,
    amount: typeof d.amount === "string" ? parseFloat(d.amount) : d.amount,
  }));

  const maxModelAmount = spending_by_model.length > 0
    ? Math.max(...spending_by_model.map((m) => parseFloat(m.amount)))
    : 1;
  const maxProjectAmount = spending_by_project.length > 0
    ? Math.max(...spending_by_project.map((p) => parseFloat(p.amount)))
    : 1;

  /* Smart success display: hide if 100% or no data */
  const showSuccessRate = summary.success_rate < 100 && summary.total_generations > 0;

  return (
    <div className="space-y-6">
      {/* Header + controls */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Аналитика</h1>
        <div className="flex items-center gap-2">
          <SelectDropdown
            options={[
              { value: "", label: "Все модели" },
              ...models.map((m) => ({ value: String(m.id), label: m.name })),
            ]}
            value={modelId !== undefined ? String(modelId) : ""}
            onChange={(v) => setModelId(v ? Number(v) : undefined)}
          />
          <SelectDropdown
            options={[
              { value: "", label: "Все проекты" },
              ...projects.map((p) => ({ value: String(p.id), label: p.name })),
            ]}
            value={projectId !== undefined ? String(projectId) : ""}
            onChange={(v) => setProjectId(v ? Number(v) : undefined)}
          />
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>
      </div>

      {/* Summary Cards — 3 columns */}
      <div className="grid grid-cols-3 gap-4">
        {/* Balance */}
        <div className="rounded-xl border border-border bg-card/80 p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Wallet className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground font-medium">Баланс</p>
            <p className="text-xl font-bold font-mono text-foreground">{formatCurrency(summary.balance)}</p>
          </div>
        </div>

        {/* Spent */}
        <div className="rounded-xl border border-border bg-card/80 p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Layers className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground font-medium">Потрачено</p>
            <p className="text-xl font-bold font-mono text-foreground">
              {formatCurrency(summary.total_spent)}
            </p>
          </div>
        </div>

        {/* Generations */}
        <div className="rounded-xl border border-border bg-card/80 p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Image className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground font-medium">Генераций</p>
            <p className="text-xl font-bold font-mono text-foreground">{summary.total_generations}</p>
            {showSuccessRate && (
              <p className="text-[10px] text-muted-foreground">{summary.success_rate}% успешных</p>
            )}
          </div>
        </div>
      </div>

      {/* Main Chart */}
      <div className="rounded-xl border border-border bg-card/80 p-6">
        <div className="flex items-baseline justify-between mb-5">
          <div className="space-y-1">
            <h2 className="text-sm font-medium text-muted-foreground">Расходы за период</h2>
            <p className="text-3xl font-bold font-mono text-foreground">
              {formatCurrency(summary.total_spent)}
            </p>
          </div>
          {generation_stats.avg_cost && (
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">Средняя стоимость</p>
              <p className="text-sm font-semibold font-mono text-foreground">
                {formatCurrency(generation_stats.avg_cost)}
              </p>
            </div>
          )}
        </div>

        {spending_by_day.length === 0 ? (
          <p className="text-sm text-muted-foreground py-16 text-center">Нет данных за выбранный период</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={spending_by_day} barCategoryGap="20%">
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={chartColors.grid}
                vertical={false}
                opacity={0.5}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: chartColors.axis }}
                tickFormatter={(v: string) => {
                  const d = parseDateLocal(v);
                  if (isNaN(d.getTime())) return v;
                  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
                }}
                axisLine={false}
                tickLine={false}
                dy={8}
              />
              <YAxis
                tick={{ fontSize: 11, fill: chartColors.axis }}
                axisLine={false}
                tickLine={false}
                domain={[0, "auto"]}
                width={40}
                tickFormatter={(v: number) => (v === 0 ? "0" : String(v))}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ fill: "rgba(255,255,255,0.03)" }}
              />
              <Bar
                dataKey="amount"
                fill={BAR_COLOR}
                radius={[4, 4, 0, 0]}
                maxBarSize={48}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Two columns: by model + by project */}
      <div className="grid grid-cols-2 gap-4">
        <BreakdownCard
          title="По моделям"
          items={spending_by_model.map((m) => ({
            key: String(m.model_id),
            label: m.model_name,
            amount: m.amount,
          }))}
          maxAmount={maxModelAmount}
        />
        <BreakdownCard
          title="По проектам"
          items={spending_by_project.map((p) => ({
            key: String(p.project_id),
            label: p.project_name,
            amount: p.amount,
          }))}
          maxAmount={maxProjectAmount}
        />
      </div>

      {/* Stats footer */}
      {generation_stats.top_model && (
        <div className="rounded-xl border border-border bg-card/80 p-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground">Самая используемая модель</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">{generation_stats.top_model}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-muted-foreground">Генераций по ней</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">{generation_stats.completed}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Breakdown Card ─────────────────────────────────────── */

function BreakdownCard({
  title,
  items,
  maxAmount,
}: {
  title: string;
  items: { key: string; label: string; amount: string }[];
  maxAmount: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/80 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">Нет данных</p>
      ) : (
        items.map((item) => {
          const pct = (parseFloat(item.amount) / maxAmount) * 100;
          return (
            <div key={item.key} className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-foreground/80 font-medium truncate mr-2">{item.label}</span>
                <span className="font-mono text-foreground shrink-0">
                  {formatCurrency(item.amount)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.max(pct, 2)}%`, background: BAR_COLOR }}
                />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
