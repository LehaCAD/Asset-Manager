"use client";

import { useEffect, useState, useCallback } from "react";
import { getTransactions } from "@/lib/api/cabinet";
import { formatDateTime, formatCurrency } from "@/lib/utils/format";
import { useCreditsStore } from "@/lib/store/credits";
import type { CabinetTransaction, PaginatedResponse } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

const REASONS = [
  { value: "", label: "Все типы" },
  { value: "generation_debit", label: "Генерация" },
  { value: "generation_refund", label: "Возврат" },
  { value: "admin_topup", label: "Пополнение" },
  { value: "refund_provider_error", label: "Ошибка провайдера" },
];

const REASON_COLORS: Record<string, string> = {
  generation_debit: "text-destructive",
  generation_refund: "text-green-500",
  admin_topup: "text-primary",
  admin_adjustment: "text-primary",
  refund_provider_error: "text-green-500",
  refund_pricing_failure: "text-green-500",
};

export default function BalancePage() {
  const [data, setData] = useState<PaginatedResponse<CabinetTransaction> | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [reason, setReason] = useState("");
  const balance = useCreditsStore((s) => s.balance);
  const pricingPercent = useCreditsStore((s) => s.pricingPercent);
  const loadBalance = useCreditsStore((s) => s.loadBalance);

  useEffect(() => { loadBalance(); }, [loadBalance]);

  const load = useCallback(() => {
    setLoading(true);
    getTransactions({ page, reason: reason || undefined })
      .then(setData)
      .finally(() => setLoading(false));
  }, [page, reason]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [reason]);

  const totalPages = data ? Math.ceil(data.count / 20) : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Баланс и операции</h1>

      {/* Balance cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-gradient-to-br from-card to-background p-6 space-y-2">
          <div className="text-3xl font-bold font-mono">{balance ? formatCurrency(balance) : "..."} ⚡</div>
          <div className="text-sm text-muted-foreground">Ваш баланс в Зарядах</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 space-y-2">
          <div className="text-3xl font-bold font-mono text-green-500">
            {pricingPercent !== null ? `${pricingPercent}%` : "..."}
          </div>
          <div className="text-sm text-muted-foreground">
            {pricingPercent !== null && pricingPercent < 100
              ? `Ваша ставка (скидка ${100 - pricingPercent}%)`
              : "Ваша ставка"}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 flex flex-col items-center justify-center gap-2 opacity-50">
          <Plus className="h-6 w-6 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Пополнить</span>
          <span className="text-[10px] text-muted-foreground/60">Скоро</span>
        </div>
      </div>

      {/* Transactions */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">История операций</h2>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="bg-muted border border-border rounded-md px-3 py-1.5 text-xs text-foreground"
        >
          {REASONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Дата</th>
              <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Тип</th>
              <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Модель</th>
              <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Сумма</th>
              <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Баланс</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="border-b border-border">
                  {[...Array(5)].map((_, j) => (
                    <td key={j} className="px-4 py-2.5"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : data && data.results.length > 0 ? (
              data.results.map((tx) => {
                const amountNum = parseFloat(tx.amount);
                return (
                  <tr key={tx.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-muted-foreground whitespace-nowrap">
                      {formatDateTime(tx.created_at)}
                    </td>
                    <td className={`px-4 py-2.5 ${REASON_COLORS[tx.reason] ?? "text-foreground"}`}>
                      {tx.reason_display}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{tx.ai_model_name ?? "—"}</td>
                    <td className={`px-4 py-2.5 text-right font-mono ${amountNum >= 0 ? "text-green-500" : "text-destructive"}`}>
                      {amountNum >= 0 ? "+" : ""}{formatCurrency(tx.amount)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">
                      {formatCurrency(tx.balance_after)}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  Нет операций
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="p-1.5 rounded-md bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs text-muted-foreground">{page} из {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="p-1.5 rounded-md bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
