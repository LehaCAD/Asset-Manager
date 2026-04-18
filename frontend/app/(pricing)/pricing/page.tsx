"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { subscriptionsApi } from "@/lib/api/subscriptions";
import { useSubscriptionStore } from "@/lib/store/subscription";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Check, Clock, Building2, ArrowLeft } from "lucide-react";
import type { Tier } from "@/components/subscription/TierBadge";
import type { PlanInfo } from "@/lib/types";

// ─── Static helpers ────────────────────────────────────────────────────────

const PLAN_TIER: Record<string, Tier> = {
  creator: "plus",
  creator_pro: "pro",
  team: "team",
};

/** Rank for comparing plans — higher = better */
const PLAN_RANK: Record<string, number> = {
  free: 0,
  creator: 1,
  creator_pro: 2,
  team: 3,
};

const PLAN_DISPLAY: Record<string, { base: string; badge?: string }> = {
  free: { base: "Старт" },
  creator: { base: "Создатель", badge: "PLUS" },
  creator_pro: { base: "Создатель", badge: "PRO" },
  team: { base: "Команда", badge: "TEAM" },
};

const PLAN_AUDIENCE: Record<string, string> = {
  free: "Для тех, кто хочет попробовать платформу",
  creator: "Для начинающих создателей контента",
  creator_pro: "Для профессионалов и активных продакшенов",
  team: "Для студий, агентств и команд",
};

function formatPrice(price: number): string {
  return Math.round(price)
    .toLocaleString("ru-RU")
    .replace(/\s/g, "\u2009");
}

function getLimitLines(plan: PlanInfo): string[] {
  return [
    plan.max_projects === 0
      ? "Безлимит проектов"
      : `До ${plan.max_projects} проектов`,
    plan.storage_limit_gb === 0
      ? "Безлимит хранилища"
      : `${plan.storage_limit_gb} ГБ хранилища`,
    plan.credits_per_month === 0
      ? "Кадры не начисляются"
      : `${plan.credits_per_month} кадров/мес`,
  ];
}

/** Inline tier pill for table headers */
function InlineBadge({ text }: { text: string }) {
  return (
    <span className="ml-1.5 text-[10px] font-bold tracking-wide text-white bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full px-2 py-0.5 align-middle">
      {text}
    </span>
  );
}

// ─── Comparison table ──────────────────────────────────────────────────────

interface TableRow {
  label: string;
  getValue: (plan: PlanInfo) => string | boolean;
}

const TABLE_ROWS: TableRow[] = [
  {
    label: "Цена",
    getValue: (p) =>
      Number(p.price) === 0 ? "Бесплатно" : `₽ ${formatPrice(p.price)}`,
  },
  {
    label: "Проекты",
    getValue: (p) =>
      p.max_projects === 0 ? "Безлимит" : String(p.max_projects),
  },
  {
    label: "Хранилище",
    getValue: (p) =>
      p.storage_limit_gb === 0 ? "Безлимит" : `${p.storage_limit_gb} ГБ`,
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
        rows.push({
          label: f.title,
          getValue: (p) => p.features.some((pf) => pf.code === code),
        });
      }
    }
  }
  return rows;
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

const CTA_GRADIENT = [
  "bg-gradient-to-r from-[oklch(0.72_0.17_281)] to-primary",
  "dark:from-primary dark:to-[oklch(0.72_0.17_281)]",
  "shadow-md shadow-primary/30",
  "hover:shadow-lg hover:shadow-primary/40 hover:brightness-110",
  "text-primary-foreground",
].join(" ");

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
  const isCurrent = plan.code === currentPlanCode && !isTrial;
  const isCurrentTrial = plan.code === currentPlanCode && isTrial;
  const isFree = Number(plan.price) === 0;
  const limits = getLimitLines(plan);
  const price = formatPrice(plan.price);
  const audience = PLAN_AUDIENCE[plan.code] ?? "";
  const display = PLAN_DISPLAY[plan.code] ?? { base: plan.name };

  const currentRank = PLAN_RANK[currentPlanCode] ?? 0;
  const thisRank = PLAN_RANK[plan.code] ?? 0;
  const isDowngrade = !isCurrent && thisRank < currentRank;

  const ctaText = isCurrent
    ? "Текущий тариф"
    : isDowngrade
      ? "Включён в ваш тариф"
      : isFree
        ? "Начать бесплатно"
        : "Подключить";
  const ctaDisabled = isCurrent || isDowngrade;

  const showCurrentBanner = isCurrent;
  const showRecommendedBanner = isRecommended && !isCurrent && thisRank > currentRank;
  const hasBanner = showCurrentBanner || showRecommendedBanner;
  const bannerText = showCurrentBanner ? "Ваш тариф" : "Лучший выбор";
  const bannerGradient = showCurrentBanner
    ? "bg-gradient-to-r from-[var(--success)] to-emerald-500"
    : "bg-gradient-to-r from-[oklch(0.72_0.17_281)] to-primary dark:from-primary dark:to-[oklch(0.72_0.17_281)]";
  const borderColor = showCurrentBanner
    ? "border-[var(--success)]/40"
    : showRecommendedBanner
      ? "border-primary/60"
      : "border-border";

  // Unified glow — covers both banner and card
  const glowColor = showCurrentBanner
    ? "rgba(34,197,94,0.25)"
    : showRecommendedBanner
      ? "rgba(139,92,246,0.35)"
      : "";
  const shadowStyle = glowColor
    ? `shadow-[0_0_20px_0px_${glowColor}]`
    : "";

  return (
    <div
      className={[
        "relative h-full",
        hasBanner ? "mt-0" : "",
      ].join(" ")}
      style={glowColor ? { filter: `drop-shadow(0 0 12px ${glowColor})` } : undefined}
    >
      {/* Floating banner */}
      {hasBanner && (
        <div
          className={[
            "absolute -top-[38px] left-0 right-0 text-white text-center py-2.5 text-[11px] font-bold uppercase tracking-[0.15em] rounded-t-lg",
            bannerGradient,
          ].join(" ")}
        >
          {bannerText}
        </div>
      )}

      <div
        className={[
          "bg-card flex flex-col h-full transition-all duration-200",
          hasBanner
            ? `rounded-b-lg rounded-t-none border-[3px] border-t-0 ${borderColor}`
            : `rounded-lg border ${borderColor} hover:border-[var(--border-strong)]`,
        ].join(" ")}
      >
        <div className="p-5 sm:p-6 pb-7 flex flex-col flex-1 items-center text-center">
          {/* Row 1: Status badge (trial) */}
          <div className="h-5 mb-2 flex items-center justify-center">
            {isCurrentTrial && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-400">
                <Clock className="h-3 w-3" />
                Пробный период
              </span>
            )}
          </div>

          {/* Row 2: Plan name */}
          <h2 className="text-2xl font-extrabold text-foreground tracking-tight whitespace-nowrap h-[32px] flex items-baseline justify-center gap-2">
            <span>{display.base}</span>
            {display.badge && (
              <span className="text-2xl font-extrabold tracking-tight text-white bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full px-3 py-0.5">
                {display.badge}
              </span>
            )}
          </h2>

          {/* Row 3: Price — fixed height so buttons align across cards */}
          <div className="mt-10 mb-10 h-[44px] flex items-center justify-center gap-0">
            {isFree ? (
              <span className="text-3xl font-extrabold text-foreground leading-none uppercase tracking-wider">
                Бесплатно
              </span>
            ) : (
              <div className="flex items-baseline">
                <span className="text-4xl font-extrabold font-mono text-foreground leading-none tracking-tight">
                  ₽&#8198;{price}
                </span>
                <span className="text-base text-muted-foreground ml-1 font-normal">
                  /мес
                </span>
              </div>
            )}
          </div>

          {/* Row 4: CTA */}
          <Button
            disabled={ctaDisabled}
            className={[
              "w-full h-11 text-sm font-semibold transition-all duration-150",
              ctaDisabled
                ? "bg-muted text-muted-foreground cursor-not-allowed border-0"
                : CTA_GRADIENT,
            ].join(" ")}
          >
            {ctaText}
          </Button>

          {/* Row 5: Audience — fixed height so feature wraps align */}
          {audience && (
            <div className="mt-10 w-full text-left">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Кому подойдёт
              </p>
              <p className="text-sm text-foreground/80 leading-snug min-h-[2.6em]">
                {audience}
              </p>
            </div>
          )}

          {/* Row 6: Features */}
          <div className="mt-6 w-full rounded-lg bg-[var(--bg-elevated-hover)]/50 border border-border/20 p-4 space-y-3 flex-1 text-left">
            {limits.map((text, i) => (
              <div key={i} className="flex items-start gap-2.5 text-sm">
                <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span className="text-foreground/90">{text}</span>
              </div>
            ))}
            {plan.features.map((f) => (
              <div key={f.code} className="flex items-start gap-2.5 text-sm">
                <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span className="text-foreground/90">{f.title}</span>
              </div>
            ))}
          </div>
        </div>
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
      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="bg-card/50">
              <th className="py-3 px-4 text-left text-muted-foreground font-medium w-40 sticky left-0 bg-card/95 backdrop-blur-sm z-10">
                &nbsp;
              </th>
              {plans.map((plan) => {
                const d = PLAN_DISPLAY[plan.code];
                const badge = d?.badge;
                return (
                  <th
                    key={plan.code}
                    className={[
                      "py-3 px-4 text-center font-semibold whitespace-nowrap",
                      plan.is_recommended
                        ? "bg-primary/8 text-primary"
                        : "text-muted-foreground",
                    ].join(" ")}
                  >
                    {d?.base ?? plan.name}
                    {badge && <InlineBadge text={badge} />}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {allRows.map((row, rowIdx) => (
              <tr key={rowIdx} className="border-t border-border/50">
                <td className="py-3 px-4 text-left text-muted-foreground sticky left-0 bg-card/95 backdrop-blur-sm z-10">
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
                          <span className="text-muted-foreground/40">—</span>
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

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-6 space-y-4">
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
  const router = useRouter();
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
      <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Назад</span>
        </button>

        {/* Header */}
        <div className="text-center mb-10 sm:mb-14">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
            Выберите свой уровень
          </h1>
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

        {loading && !error && <LoadingSkeleton />}

        {/* Plans grid — mobile: 1 col with extra top gap for banners */}
        {!loading && !error && plans.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-y-12 md:gap-y-6 gap-x-6 pt-10">
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

        {!loading && !error && plans.length === 0 && (
          <div className="text-center py-16 text-muted-foreground text-sm">
            Нет доступных тарифных планов
          </div>
        )}

        {/* Enterprise banner */}
        {!loading && !error && plans.length > 0 && (
          <div className="mt-8 rounded-lg border border-border bg-card p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3 sm:gap-4">
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
            <Button
              variant="outline"
              className="shrink-0 border-primary/40 text-primary hover:bg-primary/10 hover:border-primary/60 w-full sm:w-auto"
            >
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
