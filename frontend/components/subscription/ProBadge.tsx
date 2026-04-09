"use client";

import { cn } from "@/lib/utils";

interface ProBadgeProps {
  className?: string;
}

export function ProBadge({ className }: ProBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-bold leading-none text-white bg-gradient-to-r from-indigo-500 to-violet-500 select-none",
        className
      )}
    >
      PRO
    </span>
  );
}
