"use client";

import { useEffect, useState, useCallback } from "react";
import { format, subDays } from "date-fns";
import type { DateRange } from "react-day-picker";
import { getTransactions } from "@/lib/api/cabinet";
import { formatDateTime, formatCurrency } from "@/lib/utils/format";
import { useCreditsStore } from "@/lib/store/credits";
import { ChargeIcon } from "@/components/ui/charge-icon";
import type { CabinetTransaction, PaginatedResponse } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";

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
  const [data, setData] = useState<PaginatedResponse<CabinetTransaction> | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(defaultRange);
  const balance = useCreditsStore((s) => s.balance);
  const loadBalance = useCreditsStore((s) => s.loadBalance);

  useEffect(() => { loadBalance(); }, [loadBalance]);

  /* Only fetch top-up transactions */
  const load = useCallback(() => {
    setLoading(true);
    getTransactions({
      page,
      reason: "admin_topup",
      ...dateRangeToParams(dateRange),
    })
      .then(setData)
      .finally(() => setLoading(false));
  }, [page, dateRange]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [dateRange]);

  const totalPages = data ? Math.ceil(data.count / 20) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Платежи</h1>
        <p className="text-sm text-muted-foreground mt-1">Управляйте балансом и просматривайте историю пополнений</p>
      </div>

      {/* Balance + Top up */}
      <div className="rounded-xl border border-border bg-card/80 p-6">
        <p className="text-sm text-muted-foreground mb-2">Баланс</p>
        <div className="flex items-center gap-3 mb-5">
          <ChargeIcon size="xl" />
          <span className="text-4xl font-bold font-mono text-foreground">{formatCurrency(balance)}</span>
        </div>
        <button
          disabled
          className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold opacity-40 cursor-not-allowed"
        >
          Пополнить баланс
        </button>
        <p className="text-[11px] text-muted-foreground/50 mt-2">Онлайн-оплата будет доступна в ближайшее время</p>
      </div>

      {/* Payment history */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">История пополнений</h2>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      <div className="rounded-xl border border-border bg-card/80 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground text-[11px] uppercase tracking-wider">Дата</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground text-[11px] uppercase tracking-wider">Описание</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground text-[11px] uppercase tracking-wider">Способ</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground text-[11px] uppercase tracking-wider">Сумма</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground text-[11px] uppercase tracking-wider">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {loading ? (
              [...Array(3)].map((_, i) => (
                <tr key={i}>
                  {[...Array(5)].map((_, j) => (
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
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    —
                  </td>
                  <td className="px-4 py-3 text-center font-mono font-medium text-success">
                    +{formatCurrency(tx.amount)}
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
                <td colSpan={5} className="px-4 py-16 text-center text-muted-foreground">
                  Нет пополнений за выбранный период
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
                className="p-2 rounded-lg bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-muted-foreground font-mono">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 rounded-lg bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
