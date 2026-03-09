import { create } from "zustand";
import type { ProjectDisplayPreferences } from "@/lib/types";
import { DEFAULT_PROJECT_DISPLAY_PREFERENCES } from "@/lib/utils/constants";

const STORAGE_KEY = "project-display-preferences";

type ProjectDisplayMap = Record<number, ProjectDisplayPreferences>;

function cloneDefaultPreferences(): ProjectDisplayPreferences {
  return { ...DEFAULT_PROJECT_DISPLAY_PREFERENCES };
}

function readPersistedPreferences(): ProjectDisplayMap {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const entries = Object.entries(parsed as Record<string, unknown>);
    return Object.fromEntries(
      entries
        .map(([projectId, value]) => {
          if (!value || typeof value !== "object") {
            return null;
          }

          const prefs = value as Partial<ProjectDisplayPreferences>;
          if (
            (prefs.size !== "compact" && prefs.size !== "medium" && prefs.size !== "large") ||
            (prefs.aspectRatio !== "landscape" &&
              prefs.aspectRatio !== "square" &&
              prefs.aspectRatio !== "portrait") ||
            (prefs.fitMode !== "fill" && prefs.fitMode !== "fit")
          ) {
            return null;
          }

          return [Number(projectId), prefs as ProjectDisplayPreferences] as const;
        })
        .filter((entry): entry is readonly [number, ProjectDisplayPreferences] => entry !== null)
    );
  } catch {
    return {};
  }
}

function persistPreferences(preferencesByProject: ProjectDisplayMap) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferencesByProject));
  } catch {
    // Ignore storage write failures; UI can still use in-memory state.
  }
}

interface ProjectDisplayState {
  preferencesByProject: ProjectDisplayMap;
  hydratePreferences: () => void;
  getProjectPreferences: (projectId: number) => ProjectDisplayPreferences;
  setProjectPreferences: (projectId: number, preferences: ProjectDisplayPreferences) => void;
  updateProjectPreferences: (
    projectId: number,
    patch: Partial<ProjectDisplayPreferences>
  ) => void;
  clearProjectPreferences: (projectId?: number) => void;
}

export const useProjectDisplayStore = create<ProjectDisplayState>()((set, get) => ({
  preferencesByProject: {},

  hydratePreferences: () => {
    set({ preferencesByProject: readPersistedPreferences() });
  },

  getProjectPreferences: (projectId) => {
    return get().preferencesByProject[projectId] ?? cloneDefaultPreferences();
  },

  setProjectPreferences: (projectId, preferences) => {
    set((state) => {
      const preferencesByProject = {
        ...state.preferencesByProject,
        [projectId]: preferences,
      };
      persistPreferences(preferencesByProject);
      return { preferencesByProject };
    });
  },

  updateProjectPreferences: (projectId, patch) => {
    set((state) => {
      const current = state.preferencesByProject[projectId] ?? cloneDefaultPreferences();
      const preferencesByProject = {
        ...state.preferencesByProject,
        [projectId]: { ...current, ...patch },
      };
      persistPreferences(preferencesByProject);
      return { preferencesByProject };
    });
  },

  clearProjectPreferences: (projectId) => {
    set((state) => {
      const preferencesByProject =
        typeof projectId === "number"
          ? Object.fromEntries(
              Object.entries(state.preferencesByProject).filter(
                ([key]) => Number(key) !== projectId
              )
            )
          : {};

      persistPreferences(preferencesByProject);
      return { preferencesByProject };
    });
  },
}));
