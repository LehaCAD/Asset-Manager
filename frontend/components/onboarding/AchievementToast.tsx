"use client";

import { toast } from "sonner";
import { KadrIcon } from "@/components/ui/kadr-icon";
import { Trophy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { cancelPendingRegulars } from "@/lib/toast";

interface AchievementToastProps {
  taskTitle: string;
  taskIcon: string;
  reward: string;
  completedCount: number;
  totalCount: number;
}

function AchievementToastContent({
  taskTitle,
  reward,
  completedCount,
  totalCount,
}: AchievementToastProps) {
  const allDone = completedCount >= totalCount;
  const rewardNum = Math.round(Number(reward));

  return (
    <div className="relative w-[calc(100vw-1.5rem)] sm:w-[420px] max-w-[420px] overflow-hidden rounded-2xl bg-card border border-border">
      {/* Top accent bar */}
      <div
        className={cn(
          "absolute top-0 left-0 right-0 h-[3px]",
          allDone
            ? "bg-gradient-to-r from-warning via-warning/70 to-warning"
            : "bg-gradient-to-r from-primary via-primary/70 to-primary",
        )}
      />

      {/* Content */}
      <div className="relative p-3 sm:p-4 flex items-center gap-3">
        {/* Badge */}
        <div
          className={cn(
            "flex-shrink-0 flex items-center justify-center w-11 h-11 rounded-xl",
            allDone ? "bg-warning/15" : "bg-success/15",
          )}
        >
          {allDone ? (
            <Trophy size={22} strokeWidth={2} className="text-warning" />
          ) : (
            <Check size={24} strokeWidth={3} className="text-success" />
          )}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-[10px] font-bold uppercase tracking-wider",
              allDone ? "text-warning" : "text-primary",
            )}
          >
            {allDone ? "Все достижения" : "Достижение получено"}
          </p>
          <p className="text-sm font-semibold text-foreground leading-tight truncate mt-0.5">
            {taskTitle}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
            {completedCount} из {totalCount}
          </p>
        </div>

        {/* Reward pill */}
        {rewardNum > 0 && (
          <div className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-warning/10 border border-warning/30">
            <span className="text-sm font-bold tabular-nums text-warning">
              +{rewardNum}
            </span>
            <KadrIcon size="xs" />
          </div>
        )}
      </div>
    </div>
  );
}

export function showAchievementToast(props: AchievementToastProps) {
  // BF-02-01/02/07: luxury outranks any pending regular "создано" toast.
  cancelPendingRegulars();
  toast.custom(
    (id) => (
      <div
        onClick={() => toast.dismiss(id)}
        className="cursor-pointer origin-top scale-[0.77] sm:scale-100"
        style={{
          filter:
            "drop-shadow(0 8px 24px rgba(0, 0, 0, 0.45)) drop-shadow(0 0 16px rgba(139, 124, 247, 0.15))",
          animation: "achievement-in-bottom 400ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          maxWidth: "calc(100vw - 24px)",
        }}
      >
        <AchievementToastContent {...props} />
      </div>
    ),
    {
      duration: 5000,
      position: "top-center",
    }
  );
}
