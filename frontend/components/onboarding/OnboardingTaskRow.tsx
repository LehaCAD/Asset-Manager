import { Check } from "lucide-react";
import { ChargeIcon } from "@/components/ui/charge-icon";
import { getOnboardingIcon } from "./icon-map";
import type { OnboardingTaskDTO } from "@/lib/types";

interface Props {
  task: OnboardingTaskDTO;
  isActive?: boolean;
}

export function OnboardingTaskRow({ task, isActive = false }: Props) {
  const Icon = getOnboardingIcon(task.icon);

  return (
    <div
      className="flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors"
      style={{
        ...(task.completed
          ? { opacity: 0.45 }
          : isActive
          ? { background: 'rgba(139, 124, 247, 0.08)', borderLeft: '3px solid #8B7CF7', paddingLeft: '10px' }
          : {}),
      }}
    >
      {/* Status icon */}
      <div className="flex-shrink-0 mt-0.5">
        {task.completed ? (
          <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(34, 197, 94, 0.2)' }}>
            <Check size={11} color="#22c55e" />
          </div>
        ) : (
          <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: isActive ? 'rgba(139, 124, 247, 0.2)' : 'rgba(255,255,255,0.06)' }}>
            <Icon size={11} color={isActive ? '#8B7CF7' : '#888'} />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium leading-tight"
          style={{
            color: task.completed ? '#888' : '#fff',
            textDecoration: task.completed ? 'line-through' : 'none',
          }}
        >
          {task.title}
        </p>
        {!task.completed && (
          <p className="text-xs mt-0.5" style={{ color: '#888' }}>{task.description}</p>
        )}
      </div>

      {/* Reward */}
      {!task.completed && task.reward > 0 && (
        <div className="flex-shrink-0 flex items-center gap-1 ml-1">
          <span className="text-xs font-medium" style={{ color: '#FFD700' }}>+{task.reward}</span>
          <ChargeIcon size="xs" />
        </div>
      )}
    </div>
  );
}
