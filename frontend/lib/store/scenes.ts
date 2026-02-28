import { create } from "zustand";
import { scenesApi } from "@/lib/api/scenes";
import type { Scene, CreateScenePayload, UpdateScenePayload } from "@/lib/types";

interface ScenesState {
  scenes: Scene[];
  projectId: number | null;
  isLoading: boolean;
  error: string | null;

  loadScenes: (projectId: number) => Promise<void>;
  createScene: (payload: CreateScenePayload) => Promise<Scene>;
  updateScene: (id: number, payload: UpdateScenePayload) => Promise<void>;
  deleteScene: (id: number) => Promise<void>;
  reorderScenes: (projectId: number, sceneIds: number[]) => Promise<void>;
  setScenes: (scenes: Scene[]) => void;
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
      const sorted = [...scenes].sort((a, b) => a.order_index - b.order_index);
      set({ scenes: sorted, isLoading: false });
    } catch (err) {
      set({ error: String(err), isLoading: false });
    }
  },

  createScene: async (payload) => {
    const scene = await scenesApi.create(payload);
    set((s) => ({ scenes: [...s.scenes, scene] }));
    return scene;
  },

  updateScene: async (id, payload) => {
    const updated = await scenesApi.update(id, payload);
    set((s) => ({
      scenes: s.scenes.map((sc) => (sc.id === id ? updated : sc)),
    }));
  },

  deleteScene: async (id) => {
    await scenesApi.delete(id);
    set((s) => ({ scenes: s.scenes.filter((sc) => sc.id !== id) }));
  },

  reorderScenes: async (projectId, sceneIds) => {
    await scenesApi.reorder(projectId, { scene_ids: sceneIds });
  },

  setScenes: (scenes) => set({ scenes }),
}));
