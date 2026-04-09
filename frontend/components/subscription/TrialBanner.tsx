"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useSubscriptionStore } from "@/lib/store/subscription";

const DISMISSED_KEY = "trial-banner-dismissed";

export function TrialBanner() {
  const isTrial = useSubscriptionStore((s) => s.isTrial);
  const trialDaysLeft = useSubscriptionStore((s) => s.trialDaysLeft);
  const status = useSubscriptionStore((s) => s.status);

  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash

  useEffect(() => {
    const stored = localStorage.getItem(DISMISSED_KEY);
    setDismissed(stored === "true");
  }, []);

  const isExpired = status === "expired";
  const isTrialEnding = isTrial && trialDaysLeft !== null && trialDaysLeft <= 2;

  // Only show when relevant
  if (!isTrialEnding && !isExpired) return null;

  // Expired banner can be dismissed
  if (isExpired && dismissed) return null;

  function handleDismiss() {
    setDismissed(true);
    localStorage.setItem(DISMISSED_KEY, "true");
  }

  if (isExpired) {
    return (
      <div className="flex items-center gap-2 h-7 px-3 rounded bg-primary/10 border border-primary/20">
        <span className="text-xs text-primary font-medium whitespace-nowrap">
          Пробный период завершён
        </span>
        <Link
          href="/pricing"
          className="text-xs font-medium text-primary hover:text-primary/80 transition-colors underline underline-offset-2 whitespace-nowrap"
        >
          Выбрать тариф
        </Link>
        <button
          type="button"
          onClick={handleDismiss}
          className="ml-0.5 text-primary/60 hover:text-primary transition-colors"
          aria-label="Скрыть"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  // Trial ending (<=2 days left)
  return (
    <div className="flex items-center gap-1.5 h-7 px-3 rounded bg-primary/10 border border-primary/20">
      <span className="text-xs text-primary font-medium whitespace-nowrap">
        Пробный период: {trialDaysLeft} дн.
      </span>
    </div>
  );
}
