'use client';

import { useCreditsStore } from '@/lib/store/credits';
import { cn } from '@/lib/utils';

const PRESETS = [
  { amount: 100, label: '₽\u2009100' },
  { amount: 500, label: '₽\u2009500' },
  { amount: 1000, label: '₽\u20091\u2009000' },
  { amount: 2000, label: '₽\u20092\u2009000' },
  { amount: 5000, label: '₽\u20095\u2009000' },
  { amount: 10000, label: '₽\u200910\u2009000' },
];

export function AmountPresets() {
  const { selectedAmount, customAmount, setSelectedAmount, setCustomAmount } =
    useCreditsStore();

  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-foreground">Сумма пополнения</p>

      <div className="grid grid-cols-3 gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.amount}
            onClick={() => setSelectedAmount(p.amount)}
            className={cn(
              'rounded-md border bg-[var(--bg-inset)] p-3 text-center transition-colors',
              selectedAmount === p.amount && !customAmount
                ? 'border-primary bg-primary/5'
                : 'border-border/50 hover:border-border',
            )}
          >
            <div
              className={cn(
                'text-base font-bold',
                selectedAmount === p.amount && !customAmount
                  ? 'text-primary'
                  : 'text-foreground',
              )}
            >
              {p.label}
            </div>
          </button>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-2 rounded-md border border-border/50 bg-[var(--bg-inset)] px-3 py-2.5">
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          Другая сумма:
        </span>
        <input
          type="number"
          min={100}
          placeholder="Введите сумму"
          value={customAmount}
          onChange={(e) => setCustomAmount(e.target.value)}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="text-[11px] text-muted-foreground/40 whitespace-nowrap">
          мин. ₽{'\u2009'}100
        </span>
      </div>
    </div>
  );
}
