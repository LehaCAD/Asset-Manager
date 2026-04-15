'use client';

import { useCreditsStore } from '@/lib/store/credits';
import { cn } from '@/lib/utils';

const PRESETS = [
  { amount: 100, label: '100 ₽' },
  { amount: 500, label: '500 ₽' },
  { amount: 1000, label: '1 000 ₽' },
  { amount: 2000, label: '2 000 ₽' },
  { amount: 5000, label: '5 000 ₽' },
  { amount: 10000, label: '10 000 ₽' },
];

export function AmountPresets() {
  const { selectedAmount, customAmount, setSelectedAmount, setCustomAmount } =
    useCreditsStore();

  return (
    <div className="rounded-lg border border-border/50 bg-card p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
          1
        </span>
        <span className="text-sm font-semibold">Выберите сумму</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.amount}
            onClick={() => setSelectedAmount(p.amount)}
            className={cn(
              'rounded-lg border bg-background p-3 text-center transition-colors',
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

      <div className="mt-2 flex items-center gap-2 rounded-lg border border-border/50 bg-background px-3 py-2.5">
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
          мин. 100 ₽
        </span>
      </div>
    </div>
  );
}
