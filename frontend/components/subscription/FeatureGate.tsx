"use client";

import { type ReactNode } from "react";
import { useFeatureGate } from "@/lib/hooks/useFeatureGate";
import { TierBadge } from "./TierBadge";
import { UpgradeModal } from "./UpgradeModal";

interface FeatureGateProps {
  feature: string;
  children: ReactNode;
  fallback?: ReactNode;
}

export function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const { isLocked, tier, upgradeOpen, setUpgradeOpen, openUpgrade } =
    useFeatureGate(feature);

  if (!isLocked) {
    return <>{children}</>;
  }

  // Custom fallback — render it with click handler
  if (fallback) {
    return (
      <>
        <div onClick={openUpgrade} className="cursor-pointer">
          {fallback}
        </div>
        <UpgradeModal
          open={upgradeOpen}
          onOpenChange={setUpgradeOpen}
          featureCode={feature}
        />
      </>
    );
  }

  // Default: normal appearance + badge + click → upgrade modal
  return (
    <>
      <div
        className="relative cursor-pointer"
        onClick={openUpgrade}
      >
        <div className="pointer-events-none select-none">
          {children}
        </div>
        <TierBadge tier={tier} className="absolute top-1 right-1" />
      </div>
      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        featureCode={feature}
      />
    </>
  );
}
