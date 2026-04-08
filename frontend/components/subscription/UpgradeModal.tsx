"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LimitBar } from "./LimitBar";
import { subscriptionsApi } from "@/lib/api/subscriptions";
import type { FeatureGateInfo } from "@/lib/types";
import {
  Sparkles,
  Share2,
  Palette,
  Layers,
  Zap,
  Crown,
  Loader2,
  type LucideIcon,
} from "lucide-react";

// Icon mapping for feature codes → Lucide icons
const ICON_MAP: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  share: Share2,
  palette: Palette,
  layers: Layers,
  zap: Zap,
  crown: Crown,
};

function resolveIcon(iconName: string): LucideIcon {
  return ICON_MAP[iconName] ?? Sparkles;
}

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featureCode?: string;
  limitTitle?: string;
  limitUsed?: number;
  limitMax?: number;
}

export function UpgradeModal({
  open,
  onOpenChange,
  featureCode,
  limitTitle,
  limitUsed,
  limitMax,
}: UpgradeModalProps) {
  const isFeatureMode = !!featureCode;
  const isLimitMode = !!limitTitle;

  const [gateInfo, setGateInfo] = useState<FeatureGateInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !featureCode) {
      setGateInfo(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    subscriptionsApi
      .getFeatureGate(featureCode)
      .then((data) => {
        if (!cancelled) setGateInfo(data);
      })
      .catch(() => {
        // Silently fail — modal will show fallback
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, featureCode]);

  const Icon = gateInfo ? resolveIcon(gateInfo.icon) : Sparkles;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {isFeatureMode && (
          <>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : gateInfo ? (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <DialogTitle>{gateInfo.title}</DialogTitle>
                      <DialogDescription className="mt-1">
                        {gateInfo.description}
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>
                <div className="flex flex-col gap-3 pt-2">
                  <Button asChild className="w-full">
                    <Link href="/pricing">
                      Подключить {gateInfo.min_plan_name} —{" "}
                      {gateInfo.min_plan_price}₽/мес
                    </Link>
                  </Button>
                  <Link
                    href="/pricing"
                    className="text-sm text-center text-primary hover:text-primary/80 transition-colors"
                    onClick={() => onOpenChange(false)}
                  >
                    Сравнить тарифы →
                  </Link>
                </div>
              </>
            ) : (
              // Fallback when API fails
              <>
                <DialogHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Sparkles className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <DialogTitle>Функция доступна на PRO</DialogTitle>
                      <DialogDescription className="mt-1">
                        Перейдите на расширенный тариф, чтобы использовать эту
                        возможность.
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>
                <div className="flex flex-col gap-3 pt-2">
                  <Button asChild className="w-full">
                    <Link href="/pricing">Посмотреть тарифы</Link>
                  </Button>
                </div>
              </>
            )}
          </>
        )}

        {isLimitMode && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Layers className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <DialogTitle>Достигнут лимит</DialogTitle>
                  <DialogDescription className="mt-1">
                    Вы использовали максимум на текущем тарифе. Перейдите на
                    расширенный план, чтобы продолжить.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="flex flex-col gap-3 pt-2">
              {limitUsed !== undefined && limitMax !== undefined && (
                <LimitBar
                  used={limitUsed}
                  max={limitMax}
                  label={limitTitle}
                />
              )}
              <Button asChild className="w-full">
                <Link href="/pricing">Посмотреть тарифы</Link>
              </Button>
              <Link
                href="/pricing"
                className="text-sm text-center text-primary hover:text-primary/80 transition-colors"
                onClick={() => onOpenChange(false)}
              >
                Сравнить тарифы →
              </Link>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
