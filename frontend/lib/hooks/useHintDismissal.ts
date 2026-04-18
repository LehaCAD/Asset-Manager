"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_PREFIX = "hint-dismissed:";

/**
 * Persists a "dismissed" flag for an onboarding hint in localStorage.
 * Returns whether the hint was dismissed and a function to dismiss it.
 * SSR-safe: hydrates from localStorage only after mount.
 *
 * Dev shortcut: append `?reset-hints=1` to the URL to wipe every dismissed hint.
 */
export function useHintDismissal(key: string) {
  const storageKey = STORAGE_PREFIX + key;
  const [dismissed, setDismissed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      // Dev shortcut: ?reset-hints=1 nukes every hint-dismissed:* key, then strips the param
      const url = new URL(window.location.href);
      if (url.searchParams.get("reset-hints") === "1") {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith(STORAGE_PREFIX)) localStorage.removeItem(k);
        }
        url.searchParams.delete("reset-hints");
        window.history.replaceState({}, "", url.toString());
      }
      setDismissed(localStorage.getItem(storageKey) === "1");
    } catch {
      // ignore storage errors (private mode, etc.)
    }
    setHydrated(true);
  }, [storageKey]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      // ignore
    }
    setDismissed(true);
  }, [storageKey]);

  return { dismissed, dismiss, hydrated };
}
