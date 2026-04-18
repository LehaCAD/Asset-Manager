"use client";

import { toast } from "sonner";
import { KadrIcon } from "@/components/ui/kadr-icon";
import { Trophy, Check } from "lucide-react";

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
    <div className="relative w-[calc(100vw-1.5rem)] sm:w-[420px] max-w-[420px] overflow-hidden rounded-2xl">
      {/* Base surface */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, #1F1A2E 0%, #241B34 50%, #1A1526 100%)",
        }}
      />

      {/* Top accent bar */}
      <div
        className="absolute top-0 left-0 right-0"
        style={{
          height: "3px",
          background: allDone
            ? "linear-gradient(90deg, #FFD700, #FFA500, #FFD700)"
            : "linear-gradient(90deg, #8B7CF7, #C4A8FF, #8B7CF7)",
        }}
      />

      {/* Content */}
      <div className="relative p-3 sm:p-4 flex items-center gap-3">
        {/* Badge */}
        <div
          className="flex-shrink-0 flex items-center justify-center"
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: allDone
              ? "linear-gradient(135deg, rgba(255, 215, 0, 0.25), rgba(255, 165, 0, 0.15))"
              : "linear-gradient(135deg, rgba(34, 197, 94, 0.22), rgba(22, 163, 74, 0.12))",
          }}
        >
          {allDone ? (
            <Trophy size={22} color="#FFD700" strokeWidth={2} />
          ) : (
            <Check size={24} color="#22c55e" strokeWidth={3} />
          )}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p
            className="text-[10px] font-bold uppercase"
            style={{
              color: allDone ? "#FFD700" : "#8B7CF7",
              letterSpacing: "0.08em",
            }}
          >
            {allDone ? "Все достижения" : "Достижение получено"}
          </p>
          <p className="text-sm font-semibold text-white leading-tight truncate mt-0.5">
            {taskTitle}
          </p>
          <p className="text-[11px] text-zinc-500 mt-0.5 tabular-nums">
            {completedCount} из {totalCount}
          </p>
        </div>

        {/* Reward pill */}
        {rewardNum > 0 && (
          <div
            className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg"
            style={{
              background: "rgba(255, 215, 0, 0.12)",
              border: "1px solid rgba(255, 215, 0, 0.25)",
            }}
          >
            <span className="text-sm font-bold tabular-nums" style={{ color: "#FFD700" }}>
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
  toast.custom(
    (id) => (
      <div
        onClick={() => toast.dismiss(id)}
        className="cursor-pointer"
        style={{
          filter:
            "drop-shadow(0 8px 24px rgba(0, 0, 0, 0.45)) drop-shadow(0 0 16px rgba(139, 124, 247, 0.15))",
          animation: "achievement-in-bottom 400ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        <AchievementToastContent {...props} />
      </div>
    ),
    {
      duration: 6000,
      // Thumbs rest on the bottom half of mobile screens — show at top.
      position:
        typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches
          ? "top-center"
          : "bottom-center",
    }
  );
}
