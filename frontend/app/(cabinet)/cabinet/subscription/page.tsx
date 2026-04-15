"use client";

import { useEffect, useState, useCallback, type ComponentType } from "react";
import { useSubscriptionStore } from "@/lib/store/subscription";
import { useAuthStore } from "@/lib/store/auth";
import { subscriptionsApi } from "@/lib/api/subscriptions";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CircleCheck,
  Lock,
  ArrowRight,
  Calendar,
  ArrowUpRight,
  Folder,
  HardDrive,
  AlertCircle,
} from "lucide-react";
import { TierBadge } from "@/components/subscription/TierBadge";
import type { Tier } from "@/components/subscription/TierBadge";
import Link from "next/link";
import { toast } from "sonner";

/* ── helpers ─────────────────────────────────────────────── */

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatStorage(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 0 : 1)} ГБ`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} МБ`;
}

function limitDisplay(used: number, max: number): string {
  return `${used} / ${max === 0 ? "∞" : max}`;
}

function storageDisplay(usedBytes: number, limitBytes: number): string {
  const usedStr = formatStorage(usedBytes);
  const limitStr = limitBytes === 0 ? "∞" : formatStorage(limitBytes);
  return `${usedStr} / ${limitStr}`;
}

function usagePercent(used: number, max: number): number {
  if (max === 0) return 0;
  return Math.min(100, Math.round((used / max) * 100));
}

/* ── types ───────────────────────────────────────────────── */

interface FeatureDisplay {
  code: string;
  title: string;
  description: string;
  available: boolean;
  tier: Tier;
}

/** Determine minimum tier for a feature by finding the cheapest plan that includes it. */
function inferFeatureTier(
  featureCode: string,
  plans: { code: string; price: number; features: { code: string }[] }[],
): Tier {
  const sorted = [...plans].sort((a, b) => Number(a.price) - Number(b.price));
  for (const plan of sorted) {
    if (plan.features.some((f) => f.code === featureCode)) {
      if (plan.code === "creator") return "plus";
      if (plan.code === "creator_pro") return "pro";
      if (plan.code === "team") return "team";
    }
  }
  return "pro";
}

/* ── page ────────────────────────────────────────────────── */

export default function SubscriptionPage() {
  const { planCode, planName, status, isTrial, trialDaysLeft, trialTotalDays } =
    useSubscriptionStore();
  const user = useAuthStore((s) => s.user);
  const quota = user?.quota;
  const expiresAt = user?.subscription?.expires_at ?? null;

  const [allFeatures, setAllFeatures] = useState<FeatureDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [currentPlanPrice, setCurrentPlanPrice] = useState<number | null>(null);

  const loadFeatures = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const plans = await subscriptionsApi.getPlans();

      const featureMap = new Map<string, { title: string; description: string }>();
      for (const plan of plans) {
        for (const f of plan.features) {
          if (!featureMap.has(f.code)) {
            featureMap.set(f.code, { title: f.title, description: f.description });
          }
        }
      }

      const currentPlan = plans.find((p) => p.code === planCode);
      if (currentPlan) setCurrentPlanPrice(currentPlan.price);

      const userFeatures = useSubscriptionStore.getState().features;
      const features: FeatureDisplay[] = [];
      for (const [code, info] of featureMap) {
        features.push({
          code,
          title: info.title,
          description: info.description,
          available: userFeatures.includes(code),
          tier: inferFeatureTier(code, plans),
        });
      }

      const tierOrder = { plus: 0, pro: 1, team: 2 };
      features.sort((a, b) => {
        if (a.available !== b.available) return a.available ? -1 : 1;
        return tierOrder[a.tier] - tierOrder[b.tier];
      });

      setAllFeatures(features);
    } catch {
      setError(true);
      toast.error("Не удалось загрузить функции тарифа");
    } finally {
      setLoading(false);
    }
  }, [planCode]);

  useEffect(() => { loadFeatures(); }, [loadFeatures]);

  const isFree = planCode === "free";
  const isPaid = status === "active" && !isFree && !isTrial;
  const isExpired = status === "expired";
  const isCancelled = status === "cancelled";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Подписка</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Управляйте тарифом и отслеживайте использование ресурсов
        </p>
      </div>

      <div className={`rounded-lg border p-6 space-y-4 ${
        isPaid
          ? "border-primary/30 bg-gradient-to-br from-[var(--bg-elevated)] to-[var(--bg-surface)] shadow-[0_0_24px_-6px_hsl(var(--primary)/0.15)]"
          : isTrial
            ? "border-primary/20 bg-gradient-to-br from-[var(--bg-elevated)] to-primary/[0.03]"
            : "border-border bg-gradient-to-br from-[var(--bg-elevated)] to-[var(--bg-surface)]"
      }`}>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            {isTrial && (
              <p className="text-sm font-semibold text-primary">Пробный период</p>
            )}
            <h2 className="text-lg font-bold text-foreground">{planName}</h2>
            {isPaid && currentPlanPrice !== null && (
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-extrabold font-mono text-foreground">
                  {Math.round(currentPlanPrice).toLocaleString("ru-RU")}
                </span>
                <span className="text-sm text-muted-foreground">₽ / мес</span>
              </div>
            )}
            {isFree && !isTrial && (
              <p className="text-sm text-muted-foreground">Бесплатный тариф</p>
            )}
          </div>

          {isPaid && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--success-muted)] text-xs font-bold text-[var(--success)] shadow-[0_0_12px_-2px_var(--success)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)] animate-pulse" />
              Активна
            </span>
          )}
          {isTrial && trialDaysLeft !== null && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--primary-muted)] text-xs font-bold text-primary shadow-[0_0_12px_-2px_hsl(var(--primary)/0.3)]">
              {trialDaysLeft} {trialDaysLeft === 1 ? "день" : trialDaysLeft < 5 ? "дня" : "дней"} осталось
            </span>
          )}
          {isFree && !isTrial && (
            <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-primary/10 text-xs font-semibold text-primary">
              Бесплатно
            </span>
          )}
          {isExpired && (
            <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-[var(--warning-muted)] text-xs font-semibold text-[var(--warning)]">
              Истекла
            </span>
          )}
          {isCancelled && (
            <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-muted text-xs font-semibold text-muted-foreground">
              Отменена
            </span>
          )}
        </div>

        {isTrial && trialDaysLeft !== null && trialTotalDays !== null && trialTotalDays > 0 && (
          <div className="space-y-1.5">
            <div className="h-1.5 w-full rounded-full bg-muted">
              <div
                className="h-1.5 rounded-full bg-primary transition-all"
                style={{ width: `${Math.round(((trialTotalDays - trialDaysLeft) / trialTotalDays) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>{trialTotalDays - trialDaysLeft} из {trialTotalDays} дней использовано</span>
              <span className="text-primary">Истекает {formatDate(expiresAt)}</span>
            </div>
          </div>
        )}

        {isPaid && expiresAt && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            <span>Следующее списание: {formatDate(expiresAt)}</span>
          </div>
        )}

        <hr className="border-border" />

        <div className="flex items-center gap-3">
          {isPaid ? (
            <>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-primary to-primary/80 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_2px_12px_-2px_hsl(var(--primary)/0.4)] hover:opacity-90 transition-opacity"
              >
                <ArrowRight className="h-3.5 w-3.5" />
                Сменить тариф
              </Link>
              <button className="rounded-md border border-border px-5 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-[var(--border-strong)] transition-colors">
                Отменить подписку
              </button>
            </>
          ) : (
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-primary to-primary/80 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_2px_12px_-2px_hsl(var(--primary)/0.4)] hover:opacity-90 transition-opacity"
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
              {isTrial ? "Выбрать тариф" : "Улучшить тариф"}
            </Link>
          )}
        </div>
      </div>

      {quota && (
        <>
          <h2 className="text-[15px] font-semibold text-foreground">Использование</h2>
          <div className="grid grid-cols-2 gap-3">
            <UsageCard
              label="Проекты"
              icon={Folder}
              value={limitDisplay(quota.used_projects, quota.max_projects)}
              percent={usagePercent(quota.used_projects, quota.max_projects)}
            />
            <UsageCard
              label="Хранилище"
              icon={HardDrive}
              value={storageDisplay(quota.storage_used_bytes, quota.storage_limit_bytes)}
              percent={usagePercent(quota.storage_used_bytes, quota.storage_limit_bytes)}
            />
          </div>
        </>
      )}

      <h2 className="text-[15px] font-semibold text-foreground">
        Функции тарифа
        {isTrial && <span className="text-muted-foreground font-normal"> (пробный период)</span>}
      </h2>

      {error ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="h-10 w-10 rounded-md bg-destructive/10 flex items-center justify-center mb-3">
            <AlertCircle className="h-5 w-5 text-destructive" />
          </div>
          <p className="text-sm font-medium text-foreground">Не удалось загрузить данные</p>
          <button
            onClick={loadFeatures}
            className="mt-3 px-3 py-1.5 text-xs rounded-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Повторить
          </button>
        </div>
      ) : loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-md" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {allFeatures.map((feat) => (
            <div
              key={feat.code}
              className={`flex items-center justify-between rounded-md border px-3.5 py-2.5 transition-all duration-150 ${
                feat.available
                  ? "border-border bg-[var(--bg-elevated)]"
                  : "border-l-2 border-l-primary/30 border-t-border/60 border-r-border/60 border-b-border/60 bg-gradient-to-r from-primary/[0.04] to-[var(--bg-inset)] hover:from-primary/[0.08] hover:border-l-primary/50 cursor-pointer"
              }`}
            >
              <div className="flex items-center gap-2.5">
                {feat.available ? (
                  <CircleCheck className="h-4 w-4 shrink-0 text-[var(--success)]" />
                ) : (
                  <Lock className="h-4 w-4 shrink-0 text-primary/50" />
                )}
                <div>
                  <p className={`text-sm font-medium ${feat.available ? "text-foreground" : "text-foreground/80"}`}>
                    {feat.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-tight">{feat.description}</p>
                </div>
              </div>
              <TierBadge tier={feat.tier} />
            </div>
          ))}
        </div>
      )}

      {(() => {
        const isTopPlan = planCode === "team";
        const isPro = planCode === "creator_pro";
        const ctaTitle = isTopPlan
          ? "Управление тарифом"
          : isPro
            ? "Нужно больше? Тариф для команды"
            : isFree || isTrial
              ? "Откройте все возможности платформы"
              : "Получите ещё больше возможностей";
        const ctaDesc = isTopPlan
          ? "Просмотрите доступные тарифы и условия"
          : isPro
            ? "Безлимитное хранилище, совместная работа, приоритетная поддержка"
            : isFree || isTrial
              ? "Расширенные лимиты, эксклюзивные функции и приоритетная поддержка"
              : "Больше проектов, хранилища и доступ к PRO-функциям";
        return (
          <Link
            href="/pricing"
            className="flex items-center justify-between rounded-md border border-primary/20 bg-gradient-to-r from-primary/[0.06] to-[var(--bg-elevated)] px-5 py-4 hover:border-primary/40 hover:from-primary/[0.10] transition-all duration-150 group"
          >
            <div>
              <p className="text-sm font-semibold text-foreground">{ctaTitle}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{ctaDesc}</p>
            </div>
            <ArrowRight className="h-4 w-4 text-primary group-hover:translate-x-0.5 transition-transform" />
          </Link>
        );
      })()}
    </div>
  );
}

function UsageCard({
  label,
  icon: Icon,
  value,
  percent,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  value: string;
  percent: number;
}) {
  return (
    <div className="rounded-md border border-border bg-[var(--bg-elevated)] p-4 space-y-2.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" />
        {label}
      </div>
      <p className="text-lg font-bold text-foreground">{value}</p>
      <div className="h-1 w-full rounded-full bg-muted">
        <div
          className="h-1 rounded-full bg-primary transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
