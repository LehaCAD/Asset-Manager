"use client";

import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChargeIconProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
} as const;

const GLOW_SIZES = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
} as const;

/**
 * Premium currency icon for "Заряд" (Charge).
 * Golden filled lightning bolt with warm glow.
 */
export function ChargeIcon({ size = "sm", className }: ChargeIconProps) {
  return (
    <span className={cn("relative inline-flex items-center justify-center shrink-0", className)}>
      {/* Glow layer */}
      <span
        className={cn(
          "absolute inset-0 rounded-full blur-[3px] opacity-50",
          "bg-gradient-to-br from-yellow-400 to-amber-500",
          GLOW_SIZES[size]
        )}
        aria-hidden
      />
      {/* Icon */}
      <Zap
        className={cn(
          SIZES[size],
          "relative",
          "fill-amber-400 text-amber-500",
          "drop-shadow-[0_0_3px_rgba(251,191,36,0.6)]"
        )}
      />
    </span>
  );
}
