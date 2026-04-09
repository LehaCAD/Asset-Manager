"use client";

import { useEffect, useState } from "react";
import { subscriptionsApi } from "@/lib/api/subscriptions";
import { useSubscriptionStore } from "@/lib/store/subscription";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Crown, Star } from "lucide-react";
import type { PlanInfo } from "@/lib/types";

export default function PricingPage() {
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const currentPlanCode = useSubscriptionStore((s) => s.planCode);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await subscriptionsApi.getPlans();
        if (!cancelled) {
          setPlans(data.sort((a, b) => a.display_order - b.display_order));
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function formatPrice(price: number) {
    if (price === 0) return "0 ₽";
    return `${price.toLocaleString("ru-RU")} ₽/мес`;
  }

  function formatStorage(gb: number) {
    if (gb >= 1000) return `${(gb / 1000).toLocaleString("ru-RU")} ТБ`;
    return `${gb} ГБ`;
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold text-foreground">Тарифные планы</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Выберите подходящий тариф для вашей работы
          </p>
        </div>

        {/* Error state */}
        {error && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm font-medium text-foreground">Не удалось загрузить тарифы</p>
            <p className="text-xs text-muted-foreground mt-1">Попробуйте обновить страницу</p>
            <button
              onClick={() => { setError(false); setLoading(true); subscriptionsApi.getPlans().then(setPlans).catch(() => setError(true)).finally(() => setLoading(false)); }}
              className="mt-3 px-3 py-1.5 text-xs rounded-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Повторить
            </button>
          </div>
        )}

        {/* Loading skeletons */}
        {loading && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-md border border-border bg-card p-6 space-y-4">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        )}

        {/* Plans grid */}
        {!loading && !error && plans.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {plans.map((plan) => {
              const isCurrent = plan.code === currentPlanCode;
              const isRecommended = plan.is_recommended;

              return (
                <div
                  key={plan.code}
                  className={[
                    "relative rounded-md border bg-card p-6 flex flex-col transition-colors",
                    isRecommended
                      ? "border-primary/60 shadow-[0_0_0_1px_var(--primary)]"
                      : "border-border shadow-[var(--shadow-card)]",
                  ].join(" ")}
                >
                  {/* Badges */}
                  <div className="flex items-center gap-2 mb-4">
                    {isRecommended && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-sm">
                        <Star className="h-3 w-3" />
                        Рекомендуем
                      </span>
                    )}
                    {isCurrent && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-success bg-success/10 px-2 py-0.5 rounded-sm">
                        <Crown className="h-3 w-3" />
                        Ваш тариф
                      </span>
                    )}
                  </div>

                  {/* Name & price */}
                  <h2 className="text-lg font-bold text-foreground">{plan.name}</h2>
                  <p className="text-2xl font-bold font-mono text-foreground mt-1">
                    {formatPrice(plan.price)}
                  </p>

                  {/* Limits */}
                  <div className="mt-5 space-y-2.5 text-sm text-muted-foreground flex-1">
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary shrink-0" />
                      <span>
                        <strong className="text-foreground">{plan.credits_per_month}</strong> кадров в месяц
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary shrink-0" />
                      <span>
                        До <strong className="text-foreground">{plan.max_projects}</strong> проектов
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary shrink-0" />
                      <span>
                        До <strong className="text-foreground">{plan.max_scenes_per_project}</strong> групп в проекте
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary shrink-0" />
                      <span>
                        До <strong className="text-foreground">{plan.max_elements_per_scene}</strong> элементов в группе
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary shrink-0" />
                      <span>
                        <strong className="text-foreground">{formatStorage(plan.storage_limit_gb)}</strong> хранилища
                      </span>
                    </div>

                    {/* Features */}
                    {plan.features.length > 0 && (
                      <div className="pt-2 border-t border-border/50 mt-3 space-y-2">
                        {plan.features.map((f) => (
                          <div key={f.code} className="flex items-center gap-2">
                            <Check className="h-4 w-4 text-primary shrink-0" />
                            <span>{f.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && plans.length === 0 && (
          <div className="text-center py-16 text-muted-foreground text-sm">
            Нет доступных тарифных планов
          </div>
        )}

        {/* Footer CTA */}
        <div className="mt-10 text-center rounded-md border border-border bg-card/50 p-6">
          <p className="text-sm text-foreground font-medium">
            Для подключения тарифа напишите нам
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Это временная страница. Онлайн-оплата и автоматическое подключение тарифов будут доступны в ближайшее время.
          </p>
        </div>
      </div>
    </div>
  );
}
