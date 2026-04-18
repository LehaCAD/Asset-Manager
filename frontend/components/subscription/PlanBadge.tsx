"use client";

import { cn } from "@/lib/utils";

/**
 * Inline pill showing the user's current plan tier.
 * Same shape across all states; only gradient color changes.
 * Covers: TRIAL (overrides plan), free, creator (PLUS), creator_pro (PRO), team (TEAM), enterprise (ENT).
 */

interface PlanBadgeProps {
  planCode: string;
  isTrial: boolean;
  className?: string;
}

const BASE = "inline-flex items-center justify-center rounded-full h-[18px] px-2 text-[9px] font-bold leading-none tracking-wide select-none text-white";

const LABEL_BY_CODE: Record<string, string> = {
  free: "FREE",
  creator: "PLUS",
  creator_pro: "PRO",
  team: "TEAM",
  enterprise: "ENT",
};

const GRADIENT_BY_CODE: Record<string, string> = {
  // FREE keeps a distinct teal/emerald — it's the "not paid" state.
  free: "bg-gradient-to-r from-teal-500 to-emerald-500",
  // All paid tiers share the canonical TierBadge gradient. Tier is communicated
  // by the label (PLUS/PRO/TEAM/ENT), not by colour.
  creator: "bg-gradient-to-r from-indigo-500 to-violet-500",
  creator_pro: "bg-gradient-to-r from-indigo-500 to-violet-500",
  team: "bg-gradient-to-r from-indigo-500 to-violet-500",
  enterprise: "bg-gradient-to-r from-indigo-500 to-violet-500",
};

export function PlanBadge({ planCode, isTrial, className }: PlanBadgeProps) {
  if (isTrial) {
    return (
      <span
        className={cn(
          BASE,
          "bg-gradient-to-r from-amber-400 to-pink-500",
          className,
        )}
      >
        TRIAL
      </span>
    );
  }

  const label = LABEL_BY_CODE[planCode] ?? planCode.toUpperCase();
  const gradient =
    GRADIENT_BY_CODE[planCode] ?? "bg-gradient-to-r from-indigo-500 to-violet-500";

  return <span className={cn(BASE, gradient, className)}>{label}</span>;
}
