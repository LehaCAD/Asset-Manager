"use client";

import { KadrIcon } from "@/components/ui/kadr-icon";
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

  const reward = Math.round(Number(task.reward));

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
      {/* Composition: ghost cards flank the clickable main folder */}
      <div className="relative flex items-center justify-center gap-5 mb-10">
        {/* Ghost card far-left */}
        <div
          aria-hidden
          className="hidden xl:block rounded-2xl opacity-25"
          style={{
            width: 320,
            height: 200,
            background:
              "linear-gradient(180deg, rgba(139, 124, 247, 0.04), transparent)",
            border: "1px solid rgba(139, 124, 247, 0.12)",
          }}
        />

        {/* Ghost card left */}
        <div
          aria-hidden
          className="hidden lg:block rounded-2xl opacity-50"
          style={{
            width: 340,
            height: 212,
            background:
              "linear-gradient(180deg, rgba(139, 124, 247, 0.06), transparent)",
            border: "1px solid rgba(139, 124, 247, 0.18)",
          }}
        />

        {/* Main clickable folder — the CTA */}
        <button
          type="button"
          onClick={onAction}
          aria-label={es.cta || es.title}
          className="group relative flex items-center justify-center rounded-2xl transition-all duration-300 hover:-translate-y-1"
          style={{
            width: 380,
            height: 240,
            background:
              "linear-gradient(135deg, rgba(139, 124, 247, 0.16), rgba(107, 92, 231, 0.08))",
            border: "1.5px dashed rgba(139, 124, 247, 0.55)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "rgba(139, 124, 247, 1)";
            e.currentTarget.style.borderStyle = "solid";
            e.currentTarget.style.boxShadow =
              "0 0 64px rgba(139, 124, 247, 0.45), 0 0 0 1px rgba(139, 124, 247, 0.4) inset";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "rgba(139, 124, 247, 0.55)";
            e.currentTarget.style.borderStyle = "dashed";
            e.currentTarget.style.boxShadow = "";
          }}
        >
          {/* Pulsing ambient glow */}
          <div
            aria-hidden
            className="absolute -inset-8 rounded-[32px] pointer-events-none animate-pulse-slow"
            style={{
              background:
                "radial-gradient(closest-side, rgba(139, 124, 247, 0.22), transparent 75%)",
              filter: "blur(8px)",
            }}
          />

          {/* Hover-intensified inner glow */}
          <div
            aria-hidden
            className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle at center, rgba(139, 124, 247, 0.3), transparent 70%)",
            }}
          />

          <Icon
            size={120}
            strokeWidth={1.25}
            color="#8B7CF7"
            className="relative transition-transform duration-300 group-hover:scale-110"
          />
        </button>

        {/* Ghost card right */}
        <div
          aria-hidden
          className="hidden lg:block rounded-2xl opacity-50"
          style={{
            width: 340,
            height: 212,
            background:
              "linear-gradient(180deg, rgba(139, 124, 247, 0.06), transparent)",
            border: "1px solid rgba(139, 124, 247, 0.18)",
          }}
        />

        {/* Ghost card far-right */}
        <div
          aria-hidden
          className="hidden xl:block rounded-2xl opacity-25"
          style={{
            width: 320,
            height: 200,
            background:
              "linear-gradient(180deg, rgba(139, 124, 247, 0.04), transparent)",
            border: "1px solid rgba(139, 124, 247, 0.12)",
          }}
        />
      </div>

      {/* Title */}
      <h2 className="text-[26px] font-semibold text-white mb-4 tracking-tight">
        {es.title}
      </h2>

      {/* Reward badge — hidden when task is already completed */}
      {reward > 0 && !task.completed && (
        <div
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-medium"
          style={{
            background: "rgba(255, 215, 0, 0.1)",
            border: "1px solid rgba(255, 215, 0, 0.2)",
            color: "#FFD700",
          }}
        >
          <KadrIcon size="xs" />
          <span>+{reward} кадров за выполнение</span>
        </div>
      )}
    </div>
  );
}
