import { Check } from "lucide-react";
import { KadrIcon } from "@/components/ui/kadr-icon";
import { getOnboardingIcon } from "./icon-map";
import { cn } from "@/lib/utils";
import type { OnboardingTaskDTO } from "@/lib/types";

interface Props {
  task: OnboardingTaskDTO;
  isActive?: boolean;
}

export function OnboardingTaskRow({ task, isActive = false }: Props) {
  const Icon = getOnboardingIcon(task.icon);
  const reward = Math.round(Number(task.reward));
  const highlightActive = isActive && !task.completed;

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors",
        highlightActive && "bg-primary/10 border-l-[3px] border-primary pl-[10px]",
      )}
    >
      {/* Status icon */}
      <div className="flex-shrink-0 mt-0.5">
        {task.completed ? (
          <div className="w-5 h-5 rounded-full flex items-center justify-center bg-success/20">
            <Check size={12} strokeWidth={3} className="text-success" />
          </div>
        ) : (
          <div
            className={cn(
              "w-5 h-5 rounded-full flex items-center justify-center",
              isActive ? "bg-primary/20" : "bg-muted",
            )}
          >
            <Icon
              size={11}
              className={isActive ? "text-primary" : "text-muted-foreground"}
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-tight text-foreground">{task.title}</p>
        {!task.completed && (
          <p className="text-xs mt-0.5 text-muted-foreground">{task.description}</p>
        )}
      </div>

      {/* Reward */}
      {reward > 0 && (
        <div
          className={cn(
            "flex-shrink-0 flex items-center gap-1 ml-1",
            task.completed && "opacity-55",
          )}
        >
          <span className="text-xs font-semibold text-warning">
            {task.completed ? "" : "+"}{reward}
          </span>
          <KadrIcon size="xs" />
        </div>
      )}
    </div>
  );
}
