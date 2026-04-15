'use client';

import { KadrIcon } from '@/components/ui/kadr-icon';
import { useCreditsStore } from '@/lib/store/credits';

export function BalanceCard() {
  const { balance } = useCreditsStore();
  const numBalance = parseFloat(balance) || 0;

  return (
    <div className="text-center rounded-lg border border-border/50 bg-gradient-to-br from-[#151530] to-[#1E2545] p-6">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">
        Текущий баланс
      </p>
      <div className="mt-2 flex items-center justify-center gap-2">
        <KadrIcon size="xl" />
        <span className="text-4xl font-extrabold text-foreground">
          {numBalance.toLocaleString('ru-RU')}
        </span>
      </div>
    </div>
  );
}
