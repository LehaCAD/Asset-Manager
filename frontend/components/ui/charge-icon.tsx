"use client";

import { Coins } from "lucide-react";
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

export function ChargeIcon({ size = "sm", className }: ChargeIconProps) {
  return (
    <Coins
      className={cn(
        SIZES[size],
        "text-charge fill-charge",
        className
      )}
      strokeWidth={2}
    />
  );
}
