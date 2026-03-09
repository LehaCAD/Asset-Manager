import { create } from "zustand";
import type { DisplayPreferences } from "@/lib/types";
import { DEFAULT_DISPLAY_PREFERENCES } from "@/lib/utils/constants";

const STORAGE_KEY = "display-preferences-v2";

function cloneDefaultPreferences(): DisplayPreferences {
  return { ...DEFAULT_DISPLAY_PREFERENCES };
}

function readPersistedPreferences(): DisplayPreferences | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const prefs = parsed as Partial<DisplayPreferences>;
    
    // Validate all fields
    if (
      (prefs.size !== "compact" && prefs.size !== "medium" && prefs.size !== "large") ||
      (prefs.aspectRatio !== "landscape" &&
        prefs.aspectRatio !== "square" &&
        prefs.aspectRatio !== "portrait") ||
      (prefs.fitMode !== "fill" && prefs.fitMode !== "fit")
    ) {
      return null;
    }

    return prefs as DisplayPreferences;
  } catch {
    return null;
  }
}

function persistPreferences(preferences: DisplayPreferences) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Ignore storage write failures; UI can still use in-memory state.
  }
}

interface DisplayState {
  preferences: DisplayPreferences;
  isHydrated: boolean;
  hydratePreferences: () => void;
  getPreferences: () => DisplayPreferences;
  setPreferences: (preferences: DisplayPreferences) => void;
  updatePreferences: (patch: Partial<DisplayPreferences>) => void;
  resetPreferences: () => void;
}

export const useDisplayStore = create<DisplayState>()((set, get) => ({
  preferences: cloneDefaultPreferences(),
  isHydrated: false,

  hydratePreferences: () => {
    const persisted = readPersistedPreferences();
    if (persisted) {
      set({ preferences: persisted, isHydrated: true });
    } else {
      set({ isHydrated: true });
    }
  },

  getPreferences: () => {
    return get().preferences;
  },

  setPreferences: (preferences) => {
    persistPreferences(preferences);
    set({ preferences });
  },

  updatePreferences: (patch) => {
    const newPreferences = { ...get().preferences, ...patch };
    persistPreferences(newPreferences);
    set({ preferences: newPreferences });
  },

  resetPreferences: () => {
    const defaults = cloneDefaultPreferences();
    persistPreferences(defaults);
    set({ preferences: defaults });
  },
}));

// Backward compatibility export
export const useProjectDisplayStore = useDisplayStore;
