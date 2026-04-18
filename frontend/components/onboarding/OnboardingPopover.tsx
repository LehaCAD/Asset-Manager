"use client";

import Link from "next/link";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useOnboardingStore } from "@/lib/store/onboarding";
import { KadrIcon } from "@/components/ui/kadr-icon";
import { OnboardingTaskRow } from "./OnboardingTaskRow";

interface Props {
  children: React.ReactNode;
}

export function OnboardingPopover({ children }: Props) {
  const { tasks, totalEarned, totalPossible, completedCount, totalCount } = useOnboardingStore();

  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const firstIncompleteIndex = tasks.findIndex((t) => !t.completed);

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="p-0 w-80 border-0 shadow-xl"
        style={{ background: '#1C1C1E', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* Header */}
        <div className="p-4 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-white">Достижения</h3>
            <div className="flex items-center gap-1">
              <span className="text-xs font-medium" style={{ color: '#FFD700' }}>{Math.round(Number(totalEarned))}</span>
              <KadrIcon size="sm" />
              <span className="text-xs text-zinc-500">/ {Math.round(Number(totalPossible))}</span>
            </div>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%`, background: 'linear-gradient(90deg, #8B7CF7, #6B5CE7)' }}
            />
          </div>
          <p className="text-xs mt-1" style={{ color: '#888' }}>{completedCount} из {totalCount}</p>
        </div>

        {/* Task list */}
        <div className="py-2 max-h-80 overflow-y-auto">
          {tasks.map((task, i) => (
            <OnboardingTaskRow
              key={task.code}
              task={task}
              isActive={i === firstIncompleteIndex}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="p-3 pt-0">
          <Link
            href="/cabinet/achievements"
            className="block text-xs text-center py-2 rounded-lg transition-colors"
            style={{ color: '#8B7CF7', background: 'rgba(139, 124, 247, 0.08)' }}
          >
            Все достижения →
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
