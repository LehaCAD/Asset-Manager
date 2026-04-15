'use client';

import { useCreditsStore } from '@/lib/store/credits';
import { cn } from '@/lib/utils';
import type { PaymentMethodType } from '@/lib/types';

const METHODS: {
  id: PaymentMethodType;
  name: string;
  icon: React.ReactNode;
  badge?: string;
}[] = [
  {
    id: 'sbp',
    name: 'Система быстрых платежей',
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-sky-400">
        <span className="text-[10px] font-bold text-white">СБП</span>
      </div>
    ),
    badge: 'Быстро',
  },
  {
    id: 'bank_card',
    name: 'Банковская карта',
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-slate-700 to-slate-500">
        <span className="text-base">💳</span>
      </div>
    ),
  },
];

export function PaymentMethods() {
  const { paymentMethod, setPaymentMethod } = useCreditsStore();

  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-foreground">Способ оплаты</p>

      <div className="flex flex-col gap-1.5">
        {METHODS.map((m) => (
          <button
            key={m.id}
            onClick={() => setPaymentMethod(m.id)}
            className={cn(
              'flex items-center gap-2.5 rounded-lg border bg-[var(--card-bg)] p-3 text-left transition-colors',
              paymentMethod === m.id
                ? 'border-primary bg-primary/5'
                : 'border-border/50 hover:border-border',
            )}
          >
            <div
              className={cn(
                'flex h-4 w-4 items-center justify-center rounded-full border-2',
                paymentMethod === m.id
                  ? 'border-primary'
                  : 'border-muted-foreground/30',
              )}
            >
              {paymentMethod === m.id && (
                <div className="h-2 w-2 rounded-full bg-primary" />
              )}
            </div>
            {m.icon}
            <div className="flex-1">
              <div className="text-sm font-medium">{m.name}</div>
            </div>
            {m.badge && (
              <span className="rounded-md bg-[var(--success-muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--success)]">
                {m.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
