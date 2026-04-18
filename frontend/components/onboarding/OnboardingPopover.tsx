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
        className="p-0 w-80 bg-card border border-border rounded-xl shadow-xl"
      >
        {/* Header */}
        <div className="p-4 pb-3 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-foreground">Достижения</h3>
            <div className="flex items-center gap-1">
              <span className="text-xs font-medium text-warning">{Math.round(Number(totalEarned))}</span>
              <KadrIcon size="sm" />
              <span className="text-xs text-muted-foreground">/ {Math.round(Number(totalPossible))}</span>
            </div>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 rounded-full overflow-hidden bg-muted">
            <div
              className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-primary to-[oklch(0.48_0.19_281)]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-xs mt-1 text-muted-foreground">{completedCount} из {totalCount}</p>
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
            className="block text-xs text-center py-2 rounded-lg transition-colors text-primary bg-primary/10 hover:bg-primary/15"
          >
            Все достижения →
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
