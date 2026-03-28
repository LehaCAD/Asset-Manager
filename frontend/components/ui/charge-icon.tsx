"use client";

import { cn } from "@/lib/utils";

interface ChargeIconProps {
  size?: "sm" | "md" | "lg" | "xl" | "auto";
  className?: string;
}

const SIZES = {
  sm: "h-3 w-3",
  md: "h-3.5 w-3.5",
  lg: "h-4.5 w-4.5",
  xl: "h-7 w-7",
  auto: "h-[1em] w-[1em]",
} as const;

export function ChargeIcon({ size = "sm", className }: ChargeIconProps) {
  return (
    <img
      src="/kadr-icon.svg"
      alt="К"
      className={cn(SIZES[size], "inline-block shrink-0", className)}
    />
  );
}
