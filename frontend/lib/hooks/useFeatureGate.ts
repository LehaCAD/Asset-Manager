"use client";

import { useState, useCallback } from "react";
import { useSubscriptionStore } from "@/lib/store/subscription";
import { getTierForFeature, type Tier } from "@/components/subscription/TierBadge";

/**
 * Hook for feature gating in custom layouts (dropdown items, toggles, etc.).
 * For simple wrapping cases, use <FeatureGate> component instead.
 */
export function useFeatureGate(featureCode: string) {
  const hasFeature = useSubscriptionStore((s) => s.hasFeature);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const isLocked = !hasFeature(featureCode);
  const tier: Tier = getTierForFeature(featureCode);

  const openUpgrade = useCallback(() => {
    setUpgradeOpen(true);
  }, []);

  /** Call in onClick. Returns true if click was intercepted (feature locked). */
  const handleClick = useCallback(
    (e?: React.MouseEvent) => {
      if (!isLocked) return false;
      e?.preventDefault();
      e?.stopPropagation();
      setUpgradeOpen(true);
      return true;
    },
    [isLocked]
  );

  return {
    isLocked,
    tier,
    upgradeOpen,
    setUpgradeOpen,
    openUpgrade,
    handleClick,
  };
}
