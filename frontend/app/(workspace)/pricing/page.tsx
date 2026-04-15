"use client";

import { useEffect, useState } from "react";
import { subscriptionsApi } from "@/lib/api/subscriptions";
import { useSubscriptionStore } from "@/lib/store/subscription";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Check,
  X,
  Star,
  Clock,
  FolderOpen,
  HardDrive,
  Coins,
  Sparkles,
  Zap,
  Building2,
} from "lucide-react";
import type { PlanInfo } from "@/lib/types";
import type { LucideIcon } from "lucide-react";

// ─── Static helpers ────────────────────────────────────────────────────────

const PLAN_DESCRIPTIONS: Record<string, string> = {
  free: "Для знакомства с платформой",
  creator: "Для начинающих создателей",
  creator_pro: "Максимум возможностей для продакшена",
  team: "Для студий и команд",
};

function formatPrice(price: number): { main: string; suffix: string } {
  if (price === 0) return { main: "Бесплатно", suffix: "" };
  return { main: price.toLocaleString("ru-RU"), suffix: "₽/мес" };
}

function getLimitLines(
  plan: PlanInfo
): { icon: LucideIcon; text: string }[] {
  return [
    {
      icon: FolderOpen,
      text:
        plan.max_projects === 0
          ? "Безлимит проектов"
          : `До ${plan.max_projects} проектов`,
    },
    {
      icon: HardDrive,
      text:
        plan.storage_limit_gb === 0
          ? "Безлимит хранилища"
          : `${plan.storage_limit_gb} ГБ хранилища`,
    },
    {
      icon: Coins,
      text:
        plan.credits_per_month === 0
          ? "Кадры не начисляются"
          : `${plan.credits_per_month} кадров/мес`,
    },
  ];
}

function getCtaConfig(
  plan: PlanInfo,
  currentPlanCode: string,
  isTrial: boolean
): { text: string; variant: "outline" | "default" | "secondary"; disabled: boolean; gradient: boolean } {
  const isCurrent = plan.code === currentPlanCode;

  if (isCurrent && !isTrial) {
    return { text: "Текущий тариф", variant: "outline", disabled: true, gradient: false };
  }
  if (plan.price === 0) {
    return { text: "Начать бесплатно", variant: "outline", disabled: false, gradient: false };
  }
  if (plan.is_recommended) {
    return { text: "Подключить", variant: "default", disabled: false, gradient: true };
  }
  return { text: "Подключить", variant: "secondary", disabled: false, gradient: false };
}

// ─── Comparison table ──────────────────────────────────────────────────────

interface TableRow {
  label: string;
  getValue: (plan: PlanInfo) => string | boolean;
}

const TABLE_ROWS: TableRow[] = [
  {
    label: "Цена",
    getValue: (p) => {
      const { main, suffix } = formatPrice(p.price);
      return suffix ? `${main} ${suffix}` : main;
    },
  },
  {
    label: "Проекты",
    getValue: (p) =>
      p.max_projects === 0 ? "Безлимит" : String(p.max_projects),
  },
  {
    label: "Хранилище",
    getValue: (p) =>
      p.storage_limit_gb === 0
        ? "Безлимит"
        : `${p.storage_limit_gb} ГБ`,
  },
  {
    label: "Кадры в месяц",
    getValue: (p) =>
      p.credits_per_month === 0
        ? "Не начисляются"
        : String(p.credits_per_month),
  },
];

function buildFeatureRows(plans: PlanInfo[]): TableRow[] {
  const seen = new Set<string>();
  const rows: TableRow[] = [];

  for (const plan of plans) {
    for (const f of plan.features) {
      if (!seen.has(f.code)) {
        seen.add(f.code);
        const code = f.code;
        const title = f.title;
        rows.push({
          label: title,
          getValue: (p) => p.features.some((pf) => pf.code === code),
        });
      }
    }
  }

  return rows;
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

function PlanBadge({
  plan,
  currentPlanCode,
  isTrial,
}: {
  plan: PlanInfo;
  currentPlanCode: string;
  isTrial: boolean;
}) {
  const isCurrent = plan.code === currentPlanCode;

  if (isCurrent && isTrial) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded-md">
        <Clock className="h-3.5 w-3.5" />
        Пробный период
      </span>
    );
  }

  if (isCurrent) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded-md">
        <Check className="h-3.5 w-3.5" />
        Ваш тариф
      </span>
    );
  }

  if (plan.is_recommended) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2.5 py-1 rounded-md">
        <Star className="h-3.5 w-3.5" />
        Рекомендуем
      </span>
    );
  }

  return null;
}

function PlanCard({
  plan,
  currentPlanCode,
  isTrial,
}: {
  plan: PlanInfo;
  currentPlanCode: string;
  isTrial: boolean;
}) {
  const isRecommended = plan.is_recommended;
  const cta = getCtaConfig(plan, currentPlanCode, isTrial);
  const limits = getLimitLines(plan);
  const { main, suffix } = formatPrice(plan.price);
  const description = PLAN_DESCRIPTIONS[plan.code] ?? "";

  return (
    <div
      className={[
        "rounded-xl border bg-card p-6 flex flex-col relative",
        isRecommended
          ? "border-primary/60 shadow-[0_0_0_1px_hsl(var(--primary)/0.3)]"
          : "border-border",
      ].join(" ")}
    >
      {isRecommended && (
        <div className="absolute inset-0 rounded-xl bg-primary/5 pointer-events-none" />
      )}

      {/* Badge area */}
      <div className="min-h-[28px] mb-4 flex items-center">
        <PlanBadge
          plan={plan}
          currentPlanCode={currentPlanCode}
          isTrial={isTrial}
        />
      </div>

      {/* Name & description */}
      <h2 className="text-xl font-bold text-foreground">{plan.name}</h2>
      {description && (
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      )}

      {/* Price */}
      <div className="mt-4 mb-5">
        <span className="text-3xl font-bold font-mono text-foreground">
          {main}
        </span>
        {suffix && (
          <span className="text-base font-normal text-muted-foreground ml-1">
            {suffix}
          </span>
        )}
      </div>

      {/* CTA */}
      <Button
        variant={cta.gradient ? "default" : cta.variant}
        disabled={cta.disabled}
        className={[
          "w-full h-11",
          cta.gradient
            ? "bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground"
            : "",
          cta.disabled ? "cursor-not-allowed opacity-50" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {cta.text}
      </Button>

      {/* Divider */}
      <div className="border-t border-border/50 my-5" />

      {/* Limits */}
      <div className="space-y-2.5 flex-1">
        {limits.map(({ icon: Icon, text }, i) => (
          <div key={i} className="flex items-start gap-2.5 text-sm">
            <Icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span className="text-foreground">{text}</span>
          </div>
        ))}

        {/* Features */}
        {plan.features.length > 0 && (
          <>
            <div className="border-t border-border/50 my-2" />
            {plan.features.map((f) => (
              <div key={f.code} className="flex items-start gap-2.5 text-sm">
                <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span className="text-foreground">{f.title}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function ComparisonTable({ plans }: { plans: PlanInfo[] }) {
  const featureRows = buildFeatureRows(plans);
  const allRows = [...TABLE_ROWS, ...featureRows];

  return (
    <div className="mt-16 max-w-6xl mx-auto px-4">
      <h2 className="text-xl font-bold text-foreground text-center mb-8">
        Сравнение тарифов
      </h2>
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-card/50">
              <th className="py-3 px-4 text-left text-muted-foreground font-medium w-48">
                &nbsp;
              </th>
              {plans.map((plan) => (
                <th
                  key={plan.code}
                  className={[
                    "py-3 px-4 text-center text-muted-foreground font-medium",
                    plan.is_recommended ? "bg-primary/5" : "",
                  ].join(" ")}
                >
                  {plan.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allRows.map((row, rowIdx) => (
              <tr key={rowIdx} className="border-t border-border/50">
                <td className="py-3 px-4 text-left text-muted-foreground">
                  {row.label}
                </td>
                {plans.map((plan) => {
                  const value = row.getValue(plan);
                  return (
                    <td
                      key={plan.code}
                      className={[
                        "py-3 px-4 text-center text-foreground",
                        plan.is_recommended ? "bg-primary/5" : "",
                      ].join(" ")}
                    >
                      {typeof value === "boolean" ? (
                        value ? (
                          <Check className="h-4 w-4 text-primary mx-auto" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                        )
                      ) : (
                        value
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Loading skeleton ──────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-6 space-y-4">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-11 w-full" />
          <div className="border-t border-border/50 pt-4 space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const currentPlanCode = useSubscriptionStore((s) => s.planCode);
  const isTrial = useSubscriptionStore((s) => s.isTrial);

  function loadPlans() {
    setError(false);
    setLoading(true);
    subscriptionsApi
      .getPlans()
      .then((data) =>
        setPlans(data.sort((a, b) => a.display_order - b.display_order))
      )
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }

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
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-foreground">
            Тарифные планы
          </h1>
          <p className="text-base text-muted-foreground mt-3">
            Выберите тариф, который подходит вашему объёму работы
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 mt-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
              <span>Все модели генерации доступны на любом тарифе</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Zap className="h-4 w-4 text-amber-400 shrink-0" />
              <span>7 дней полного доступа + 50 Кадров новым пользователям</span>
            </div>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm font-medium text-foreground">
              Не удалось загрузить тарифы
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Попробуйте обновить страницу
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={loadPlans}
              className="mt-4"
            >
              Повторить
            </Button>
          </div>
        )}

        {/* Loading */}
        {loading && !error && <LoadingSkeleton />}

        {/* Plans grid */}
        {!loading && !error && plans.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan) => (
              <PlanCard
                key={plan.code}
                plan={plan}
                currentPlanCode={currentPlanCode ?? ""}
                isTrial={isTrial}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && plans.length === 0 && (
          <div className="text-center py-16 text-muted-foreground text-sm">
            Нет доступных тарифных планов
          </div>
        )}

        {/* Enterprise banner */}
        {!loading && !error && plans.length > 0 && (
          <div className="mt-6 rounded-xl border border-border bg-card p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Корпоративный</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Безлимитное хранилище, выделенный менеджер, индивидуальные условия
                </p>
              </div>
            </div>
            <Button variant="outline" className="shrink-0">
              Свяжитесь с нами
            </Button>
          </div>
        )}

        {/* Footer note */}
        {!loading && !error && plans.length > 0 && (
          <div className="mt-12 text-center">
            <p className="text-sm text-muted-foreground">
              Онлайн-оплата будет доступна в ближайшее время.{" "}
              Для подключения тарифа напишите нам.
            </p>
          </div>
        )}

        {/* Comparison table */}
        {!loading && !error && plans.length > 0 && (
          <ComparisonTable plans={plans} />
        )}
      </div>
    </div>
  );
}
