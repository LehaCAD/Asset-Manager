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
import { VisuallyHidden } from "radix-ui";
import { Button } from "@/components/ui/button";
import { subscriptionsApi } from "@/lib/api/subscriptions";
import type { FeatureGateInfo } from "@/lib/types";
import { Loader2 } from "lucide-react";

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {isFeatureMode && (
          <>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <VisuallyHidden.Root><DialogTitle>Загрузка</DialogTitle></VisuallyHidden.Root>
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : gateInfo ? (
              <>
                <DialogHeader>
                  <DialogTitle>{gateInfo.title}</DialogTitle>
                  <DialogDescription className="mt-1">
                    {gateInfo.description}
                  </DialogDescription>
                </DialogHeader>
                <div className="pt-2">
                  <Button asChild className="w-full">
                    <Link href="/pricing">Посмотреть тарифы</Link>
                  </Button>
                </div>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>Доступно на расширенном тарифе</DialogTitle>
                  <DialogDescription className="mt-1">
                    Эта возможность входит в платный тариф.
                  </DialogDescription>
                </DialogHeader>
                <div className="pt-2">
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
              <DialogTitle>Достигнут лимит</DialogTitle>
              <DialogDescription className="mt-1">
                Текущий тариф ограничивает количество. Расширьте план, чтобы продолжить.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 pt-2">
              {limitUsed !== undefined && limitMax !== undefined && (
                <div className="flex items-baseline justify-center gap-1.5 py-3">
                  <span className="text-3xl font-bold tabular-nums">{limitUsed}</span>
                  <span className="text-lg text-muted-foreground">/</span>
                  <span className="text-3xl font-bold tabular-nums text-primary">{limitMax}</span>
                </div>
              )}
              <Button asChild className="w-full">
                <Link href="/pricing">Посмотреть тарифы</Link>
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
