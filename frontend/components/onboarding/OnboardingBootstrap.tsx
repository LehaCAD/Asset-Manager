"use client";

import { useEffect } from "react";
import { useOnboardingStore } from "@/lib/store/onboarding";
import { WelcomeModal } from "./WelcomeModal";

export function OnboardingBootstrap() {
  const fetchOnboarding = useOnboardingStore((s) => s.fetchOnboarding);

  useEffect(() => {
    fetchOnboarding();
  }, [fetchOnboarding]);

  return <WelcomeModal />;
}
