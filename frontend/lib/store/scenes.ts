import { create } from "zustand";
import { scenesApi } from "@/lib/api/scenes";
import type {
  Scene,
  CreateScenePayload,
  UpdateScenePayload,
  SceneNeighbors,
} from "@/lib/types";

function sortScenes(scenes: Scene[]): Scene[] {
  return [...scenes].sort((a, b) => a.order_index - b.order_index);
}

function getSceneNeighborsFromList(scenes: Scene[], sceneId: number): SceneNeighbors {
  const sortedScenes = sortScenes(scenes);
  const currentIndex = sortedScenes.findIndex((scene) => scene.id === sceneId);

  if (currentIndex === -1) {
    return {
      currentScene: null,
      previousScene: null,
      nextScene: null,
      currentIndex: -1,
      total: sortedScenes.length,
    };
  }

  return {
    currentScene: sortedScenes[currentIndex] ?? null,
    previousScene: currentIndex > 0 ? sortedScenes[currentIndex - 1] : null,
    nextScene: currentIndex < sortedScenes.length - 1 ? sortedScenes[currentIndex + 1] : null,
    currentIndex,
    total: sortedScenes.length,
  };
}

interface ScenesState {
  scenes: Scene[];
  projectId: number | null;
  isLoading: boolean;
  error: string | null;

  loadScenes: (projectId: number) => Promise<void>;
  ensureScenesLoaded: (projectId: number) => Promise<void>;
  createScene: (payload: CreateScenePayload) => Promise<Scene>;
  updateScene: (id: number, payload: UpdateScenePayload) => Promise<void>;
  deleteScene: (id: number) => Promise<void>;
  reorderScenes: (projectId: number, sceneIds: number[]) => Promise<void>;
  getSceneById: (sceneId: number) => Scene | null;
  getSceneNeighbors: (sceneId: number) => SceneNeighbors;
  setScenes: (scenes: Scene[]) => void;
  reset: () => void;
}

export const useScenesStore = create<ScenesState>()((set, get) => ({
  scenes: [],
  projectId: null,
  isLoading: false,
  error: null,

  loadScenes: async (projectId) => {
    set({ isLoading: true, error: null, projectId });
    try {
      const scenes = await scenesApi.getByProject(projectId);
      const sorted = sortScenes(scenes);
      set({ scenes: sorted, isLoading: false });
    } catch (err) {
      set({ error: String(err), isLoading: false });
    }
  },

  ensureScenesLoaded: async (projectId) => {
    const state = get();
    if (state.projectId === projectId && state.scenes.length > 0) {
      return;
    }

    await state.loadScenes(projectId);
  },

  createScene: async (payload) => {
    const scene = await scenesApi.create(payload);
    set((s) => ({ scenes: sortScenes([...s.scenes, scene]) }));
    return scene;
  },

  updateScene: async (id, payload) => {
    const updated = await scenesApi.update(id, payload);
    set((s) => ({
      scenes: sortScenes(s.scenes.map((sc) => (sc.id === id ? updated : sc))),
    }));
  },

  deleteScene: async (id) => {
    await scenesApi.delete(id);
    set((s) => ({ scenes: s.scenes.filter((sc) => sc.id !== id) }));
  },

  reorderScenes: async (projectId, sceneIds) => {
    await scenesApi.reorder(projectId, { scene_ids: sceneIds });
  },

  getSceneById: (sceneId) => {
    return get().scenes.find((scene) => scene.id === sceneId) ?? null;
  },

  getSceneNeighbors: (sceneId) => {
    return getSceneNeighborsFromList(get().scenes, sceneId);
  },

  setScenes: (scenes) => set({ scenes: sortScenes(scenes) }),

  reset: () => set({ scenes: [], projectId: null, isLoading: false, error: null }),
}));
