"use client";

import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

const TIER_LABELS: Record<string, string> = {
  plus: "PLUS",
  pro: "PRO",
  team: "TEAM",
};

/** Map feature code → minimum tier required. */
const FEATURE_TIER_MAP: Record<string, "plus" | "pro" | "team"> = {
  sharing: "plus",
  batch_download: "pro",
  ai_prompt: "pro",
  analytics_export: "team",
};

export type Tier = "plus" | "pro" | "team";

export function getTierForFeature(featureCode: string): Tier {
  return FEATURE_TIER_MAP[featureCode] ?? "pro";
}

interface TierBadgeProps {
  tier: Tier;
  variant?: "pill" | "icon";
  className?: string;
}

export function TierBadge({ tier, variant = "pill", className }: TierBadgeProps) {
  if (variant === "icon") {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full",
          "h-7 w-7 bg-violet-500/10 shadow-[0_0_12px_rgba(139,92,246,0.25)]",
          className
        )}
      >
        <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 shadow-[0_2px_6px_rgba(124,58,237,0.5)]">
          <ArrowUp className="h-3 w-3 text-white" />
        </span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full",
        "h-[18px] px-2 text-[9px] font-bold leading-none tracking-wide",
        "text-white bg-gradient-to-r from-indigo-500 to-violet-500 select-none",
        className
      )}
    >
      {TIER_LABELS[tier] ?? "PRO"}
    </span>
  );
}
