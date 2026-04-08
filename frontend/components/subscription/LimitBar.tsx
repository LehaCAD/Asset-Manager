"use client";

import { cn } from "@/lib/utils";

interface LimitBarProps {
  used: number;
  max: number;
  label: string;
  upgradeText?: string;
  onUpgrade?: () => void;
  className?: string;
}

export function LimitBar({
  used,
  max,
  label,
  upgradeText,
  onUpgrade,
  className,
}: LimitBarProps) {
  const isUnlimited = max === 0;
  const isExhausted = !isUnlimited && used >= max;
  const percentage = isUnlimited ? 0 : Math.min((used / max) * 100, 100);

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {label}: {used} из {isUnlimited ? "∞" : max}
        </span>
        {isExhausted && upgradeText && onUpgrade && (
          <button
            type="button"
            onClick={onUpgrade}
            className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
          >
            {upgradeText}
          </button>
        )}
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: isUnlimited ? "0%" : `${percentage}%` }}
        />
      </div>
    </div>
  );
}
