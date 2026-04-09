"use client";

import { ChargeIcon } from "@/components/ui/charge-icon";
import { getOnboardingIcon } from "./icon-map";
import type { OnboardingTaskDTO } from "@/lib/types";

interface Props {
  task: OnboardingTaskDTO;
  onAction: () => void;
}

export function OnboardingEmptyState({ task, onAction }: Props) {
  const Icon = getOnboardingIcon(task.icon);
  const es = task.empty_state;
  if (!es) return null;

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-4">
      {/* Icon */}
      <div
        className="flex items-center justify-center w-20 h-20 rounded-2xl mb-5"
        style={{ background: 'rgba(139, 124, 247, 0.12)' }}
      >
        <Icon size={36} color="#8B7CF7" />
      </div>

      {/* Text */}
      <h2 className="text-xl font-semibold text-white mb-2">{es.title}</h2>
      <p className="text-sm text-zinc-400 mb-4 max-w-xs">{es.description}</p>

      {/* Reward badge */}
      {task.reward > 0 && (
        <div
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full mb-5 text-xs font-medium"
          style={{ background: 'rgba(255, 215, 0, 0.1)', border: '1px solid rgba(255, 215, 0, 0.2)', color: '#FFD700' }}
        >
          <ChargeIcon size="xs" />
          <span>+{task.reward} кадров за выполнение</span>
        </div>
      )}

      {/* CTA button */}
      {es.cta && (
        <button
          type="button"
          onClick={onAction}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg, #8B7CF7, #6B5CE7)' }}
        >
          {es.cta}
        </button>
      )}
    </div>
  );
}
