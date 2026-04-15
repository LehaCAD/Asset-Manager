"use client";

import { useEffect, useState, useCallback } from "react";
import { format, subDays } from "date-fns";
import type { DateRange } from "react-day-picker";
import { getTransactions } from "@/lib/api/cabinet";
import { formatDateTime, formatCurrency } from "@/lib/utils/format";
import { useCreditsStore } from "@/lib/store/credits";
import type { CabinetTransaction, PaginatedResponse } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Download } from "lucide-react";
import { KadrIcon } from "@/components/ui/kadr-icon";
import { toast } from "sonner";
import { BalanceCard } from "@/components/cabinet/BalanceCard";
import { AmountPresets } from "@/components/cabinet/AmountPresets";
import { PaymentMethods } from "@/components/cabinet/PaymentMethods";
import { TopUpSummary } from "@/components/cabinet/TopUpSummary";
import { cn } from "@/lib/utils";

type Tab = "payment" | "history";

function defaultRange(): DateRange {
  const now = new Date();
  return { from: subDays(now, 89), to: now };
}

function dateRangeToParams(range: DateRange | undefined) {
  if (!range?.from) return {};
  const from = format(range.from, "yyyy-MM-dd");
  const to = range.to ? format(range.to, "yyyy-MM-dd") : from;
  return { date_from: from, date_to: to };
}

export default function BalancePage() {
  const [activeTab, setActiveTab] = useState<Tab>("payment");
  const [data, setData] = useState<PaginatedResponse<CabinetTransaction> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(defaultRange);
  const loadBalance = useCreditsStore((s) => s.loadBalance);

  useEffect(() => { loadBalance(); }, [loadBalance]);

  const load = useCallback(async () => {
    setLoading(true);
    if (page === 1) setError(false);
    try {
      const result = await getTransactions({
        page,
        reason: "admin_topup",
        ...dateRangeToParams(dateRange),
      });
      setData(result);
    } catch {
      if (page === 1) {
        setError(true);
      } else {
        toast.error("Не удалось загрузить данные");
      }
    } finally {
      setLoading(false);
    }
  }, [page, dateRange]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [dateRange]);

  const totalPages = data ? Math.ceil(data.count / 20) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Платежи</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Управляйте балансом и просматривайте историю пополнений
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border">
        {([
          { id: "payment" as Tab, label: "Оплата" },
          { id: "history" as Tab, label: "История операций" },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors -mb-px",
              activeTab === tab.id
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Payment */}
      {activeTab === "payment" && (
        <div className="space-y-5">
          {/* Balance hero — standalone */}
          <BalanceCard />

          {/* Unified payment form — one card */}
          <div className="rounded-lg border border-border bg-[var(--card-bg)] p-6 space-y-6">
            <AmountPresets />
            <hr className="border-border/50" />
            <PaymentMethods />
            <hr className="border-border/50" />
            <TopUpSummary />
          </div>
        </div>
      )}

      {/* Tab: History */}
      {activeTab === "history" && (
        <>
          {/* History header with filters */}
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">
              История операций
            </h2>
            <div className="flex items-center gap-2">
              <DateRangePicker value={dateRange} onChange={setDateRange} />
              <button
                disabled
                title="Скоро"
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground opacity-50 cursor-not-allowed"
              >
                <Download className="h-3.5 w-3.5" />
                Скачать
              </button>
            </div>
          </div>

          {error ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-10 w-10 rounded-md bg-destructive/10 flex items-center justify-center mb-3">
                <AlertCircle className="h-5 w-5 text-destructive" />
              </div>
              <p className="text-sm font-medium text-foreground">Не удалось загрузить данные</p>
              <p className="text-xs text-muted-foreground mt-1">Попробуйте обновить страницу</p>
              <button
                onClick={() => { setError(false); load(); }}
                className="mt-3 px-3 py-1.5 text-xs rounded-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Повторить
              </button>
            </div>
          ) : (
            <>
              {/* Transactions table — 4 columns (removed "Способ") */}
              <div className="rounded-lg border border-border bg-[var(--card-bg)] shadow-[var(--shadow-card)] overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-[11px] uppercase tracking-wider">Дата</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-[11px] uppercase tracking-wider">Описание</th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground text-[11px] uppercase tracking-wider">Сумма</th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground text-[11px] uppercase tracking-wider">Статус</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {loading ? (
                      [...Array(3)].map((_, i) => (
                        <tr key={i}>
                          {[...Array(4)].map((_, j) => (
                            <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                          ))}
                        </tr>
                      ))
                    ) : data && data.results.length > 0 ? (
                      data.results.map((tx) => (
                        <tr key={tx.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 font-mono text-muted-foreground whitespace-nowrap text-[11px]">
                            {formatDateTime(tx.created_at)}
                          </td>
                          <td className="px-4 py-3 text-foreground">
                            Пополнение баланса
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center gap-1 font-mono font-medium text-success">
                              +{formatCurrency(tx.amount)}
                              <KadrIcon size="xs" />
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center gap-1 text-[10px] text-success font-medium">
                              <CheckCircle2 className="h-3 w-3" />
                              Оплачено
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-4 py-16 text-center text-muted-foreground">
                          Нет операций за выбранный период
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {data && data.count > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    {`${(page - 1) * 20 + 1}–${Math.min(page * 20, data.count)} из ${data.count}`}
                  </span>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="p-2 rounded-md bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="text-xs text-muted-foreground font-mono">{page} / {totalPages}</span>
                      <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className="p-2 rounded-md bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
