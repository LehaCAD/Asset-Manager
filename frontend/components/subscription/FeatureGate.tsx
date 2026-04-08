"use client";

import { useState, type ReactNode } from "react";
import { useSubscriptionStore } from "@/lib/store/subscription";
import { ProBadge } from "./ProBadge";
import { UpgradeModal } from "./UpgradeModal";

interface FeatureGateProps {
  feature: string;
  children: ReactNode;
  fallback?: ReactNode;
}

export function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const hasFeature = useSubscriptionStore((s) => s.hasFeature);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const isAvailable = hasFeature(feature);

  if (isAvailable) {
    return <>{children}</>;
  }

  // Custom fallback
  if (fallback) {
    return (
      <>
        <div onClick={() => setUpgradeOpen(true)} className="cursor-pointer">
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

  // Default locked overlay
  return (
    <>
      <div
        className="relative cursor-pointer"
        onClick={() => setUpgradeOpen(true)}
      >
        <div className="pointer-events-none opacity-50 select-none">
          {children}
        </div>
        <ProBadge className="absolute top-1 right-1" />
      </div>
      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        featureCode={feature}
      />
    </>
  );
}
