"use client";

import { useOnboardingStore } from "@/lib/store/onboarding";
import { OnboardingPopover } from "./OnboardingPopover";
import { Trophy } from "lucide-react";

export function OnboardingProgress() {
  const { completedCount, totalCount, isLoaded } = useOnboardingStore();

  if (!isLoaded || totalCount === 0) return null;

  const allDone = completedCount >= totalCount;
  const progress = completedCount / totalCount;
  const circumference = 2 * Math.PI * 13; // radius 13
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <OnboardingPopover>
      <button
        className="relative flex items-center justify-center w-9 h-9 rounded-full transition-opacity hover:opacity-80"
        aria-label="Прогресс онбординга"
      >
        {allDone ? (
          <Trophy size={18} color="#8B7CF7" />
        ) : (
          <>
            <svg width="32" height="32" viewBox="0 0 32 32" className="absolute">
              {/* Track */}
              <circle
                cx="16" cy="16" r="13"
                fill="none"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="2.5"
              />
              {/* Progress arc */}
              <circle
                cx="16" cy="16" r="13"
                fill="none"
                stroke="#8B7CF7"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                transform="rotate(-90 16 16)"
                style={{ transition: 'stroke-dashoffset 0.5s ease' }}
              />
            </svg>
            <span className="text-[10px] font-bold text-white z-10">{completedCount}</span>
          </>
        )}
      </button>
    </OnboardingPopover>
  );
}
