"use client";

import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChargeIconProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  sm: "h-3 w-3",
  md: "h-3.5 w-3.5",
  lg: "h-4.5 w-4.5",
} as const;

/**
 * Premium currency icon for "Заряд" (Charge).
 * Thin golden lightning with soft warm glow.
 */
export function ChargeIcon({ size = "sm", className }: ChargeIconProps) {
  return (
    <Zap
      className={cn(
        SIZES[size],
        "text-amber-400 fill-amber-400/30",
        "drop-shadow-[0_0_4px_rgba(251,191,36,0.5)]",
        className
      )}
      strokeWidth={1.5}
    />
  );
}
