"use client";

import { useOnboardingStore } from "@/lib/store/onboarding";
import { KadrIcon } from "@/components/ui/kadr-icon";
import { getOnboardingIcon } from "@/components/onboarding/icon-map";
import { Check, Trophy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { OnboardingTaskDTO } from "@/lib/types";

function AchievementCard({ task }: { task: OnboardingTaskDTO }) {
  const Icon = getOnboardingIcon(task.icon);
  const completedDate = task.completed_at
    ? new Date(task.completed_at).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
      })
    : null;

  return (
    <div
      className={
        "rounded-md border bg-card shadow-[var(--shadow-card)] p-4 flex items-start gap-4 transition-colors " +
        (task.completed
          ? "border-success/30"
          : "border-border")
      }
    >
      {/* Icon */}
      <div
        className={
          "flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center " +
          (task.completed
            ? "bg-success/10"
            : "bg-primary/10")
        }
      >
        {task.completed ? (
          <Check className="h-5 w-5 text-success" />
        ) : (
          <Icon className="h-5 w-5 text-primary" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3
            className={
              "text-sm font-semibold " +
              (task.completed
                ? "text-muted-foreground"
                : "text-foreground")
            }
          >
            {task.title}
          </h3>
          {task.completed && completedDate && (
            <span className="text-[10px] text-muted-foreground shrink-0">
              {completedDate}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          {task.description}
        </p>
      </div>

      {/* Reward */}
      {task.reward > 0 && (
        <div
          className={
            "flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold " +
            (task.completed
              ? "bg-success/10 text-success"
              : "bg-primary/10 text-primary")
          }
        >
          {task.completed ? "" : "+"}
          {Math.round(Number(task.reward))}
          <KadrIcon size="xs" />
        </div>
      )}
    </div>
  );
}

export default function AchievementsPage() {
  const { tasks, totalEarned, totalPossible, completedCount, totalCount, isLoaded } =
    useOnboardingStore();

  if (!isLoaded) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-24 rounded-md" />
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  const progressPercent =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const allDone = completedCount >= totalCount && totalCount > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <h1 className="text-xl font-bold text-foreground">Достижения</h1>

      {/* Summary card */}
      <div className="rounded-md border border-border bg-card shadow-[var(--shadow-card)] p-4">
        <div className="flex items-center gap-4 mb-4">
          <div
            className={
              "flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center " +
              (allDone ? "bg-success/10" : "bg-primary/10")
            }
          >
            <Trophy
              className={
                "h-6 w-6 " + (allDone ? "text-success" : "text-primary")
              }
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between mb-1">
              <p className="text-sm font-medium text-foreground">
                {allDone
                  ? "Все достижения выполнены"
                  : `${completedCount} из ${totalCount}`}
              </p>
              <p className="text-xs text-muted-foreground">{progressPercent}%</p>
            </div>
            {/* Progress bar */}
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={
                  "h-full rounded-full transition-all duration-500 " +
                  (allDone ? "bg-success" : "bg-primary")
                }
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Earned stats */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <div className="flex items-center gap-2">
            <KadrIcon size="sm" />
            <span className="text-sm text-muted-foreground">Заработано</span>
          </div>
          <span className="text-sm font-bold font-mono text-foreground">
            {Math.round(Number(totalEarned))} / {Math.round(Number(totalPossible))}
          </span>
        </div>
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {tasks.map((task) => (
          <AchievementCard key={task.code} task={task} />
        ))}
      </div>

      {/* Empty hint if all done */}
      {allDone && (
        <div className="rounded-md border border-border bg-card shadow-[var(--shadow-card)] p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Вы освоили все базовые возможности платформы. Новые достижения появятся в будущих обновлениях.
          </p>
        </div>
      )}
    </div>
  );
}
