'use client';

import { KadrIcon } from '@/components/ui/kadr-icon';
import { useCreditsStore } from '@/lib/store/credits';
import { formatRubles } from '@/lib/utils/format';
import { Loader2 } from 'lucide-react';

const METHOD_LABELS: Record<string, string> = {
  sbp: 'СБП',
  bank_card: 'Банковская карта',
};

export function TopUpSummary() {
  const {
    selectedAmount,
    customAmount,
    paymentMethod,
    isTopUpProcessing,
    createTopUp,
  } = useCreditsStore();

  const amount = customAmount ? parseInt(customAmount, 10) : selectedAmount;
  const isValid = amount >= 100;
  const formatted = amount ? formatRubles(amount) : '—';

  return (
    <>
      <div>
        <div className="flex justify-between text-sm py-1">
          <span className="text-muted-foreground">Сумма пополнения</span>
          <span className="font-medium">₽{'\u2009'}{formatted}</span>
        </div>
        <div className="flex justify-between items-center text-sm py-1">
          <span className="text-muted-foreground">Получите</span>
          <span className="flex items-center gap-1 font-semibold">
            <KadrIcon size="md" />
            {formatted}
          </span>
        </div>
        <div className="flex justify-between text-sm py-1">
          <span className="text-muted-foreground">Способ оплаты</span>
          <span className="font-medium">{METHOD_LABELS[paymentMethod]}</span>
        </div>

        <hr className="my-2 border-border/50" />

        <button
          onClick={createTopUp}
          disabled={!isValid || isTopUpProcessing}
          className="w-full rounded-md bg-gradient-to-r from-primary to-primary/80 py-3.5 text-center text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isTopUpProcessing ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Переход к оплате...
            </span>
          ) : (
            `Оплатить ₽\u2009${formatted}`
          )}
        </button>

        {!isValid && customAmount && (
          <p className="mt-2 text-center text-xs text-destructive">
            Минимальная сумма — ₽{'\u2009'}100
          </p>
        )}
      </div>

    </>
  );
}
