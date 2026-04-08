'use client';

import { ChargeIcon } from '@/components/ui/charge-icon';
import { useCreditsStore } from '@/lib/store/credits';

export function BalanceCard() {
  const { balance } = useCreditsStore();
  const numBalance = parseFloat(balance) || 0;
  const approxImages = Math.floor(numBalance / 5);
  const approxVideos = Math.floor(numBalance / 10);

  return (
    <div className="text-center rounded-xl border border-border/50 bg-gradient-to-br from-[#151530] to-[#1E2545] p-6">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">
        Текущий баланс
      </p>
      <div className="mt-2 flex items-center justify-center gap-2">
        <ChargeIcon size="xl" />
        <span className="text-4xl font-extrabold text-foreground">
          {numBalance.toLocaleString('ru-RU')}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        ≈ {approxImages.toLocaleString('ru-RU')} изображений или{' '}
        {approxVideos.toLocaleString('ru-RU')} видео
      </p>
    </div>
  );
}
