import { create } from 'zustand';
import { apiClient, type Project, type Scene } from '../api';

interface ProjectsState {
  // Projects
  projects: Project[];
  projectsLoading: boolean;
  projectsError: string | null;

  // Current project & scenes
  currentProject: Project | null;
  scenes: Scene[];
  scenesLoading: boolean;
  scenesError: string | null;

  // Actions — Projects
  fetchProjects: () => Promise<void>;
  createProject: (name: string, aspectRatio?: '16:9' | '9:16') => Promise<Project>;
  updateProject: (id: number, data: Partial<Pick<Project, 'name' | 'status' | 'aspect_ratio'>>) => Promise<void>;
  deleteProject: (id: number) => Promise<void>;

  // Actions — Scenes
  fetchScenes: (projectId: number) => Promise<void>;
  fetchProject: (projectId: number) => Promise<void>;
  createScene: (projectId: number, name: string) => Promise<Scene>;
  updateScene: (id: number, data: Partial<Pick<Scene, 'name' | 'status'>>) => Promise<void>;
  deleteScene: (id: number) => Promise<void>;
  reorderScenes: (sceneIds: number[]) => Promise<void>;
  optimisticallyReorderScenes: (sceneIds: number[]) => void;

  // Utilities
  clearCurrentProject: () => void;
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  projectsLoading: false,
  projectsError: null,

  currentProject: null,
  scenes: [],
  scenesLoading: false,
  scenesError: null,

  // ─── Projects ────────────────────────────────────────────

  fetchProjects: async () => {
    set({ projectsLoading: true, projectsError: null });
    try {
      const projects = await apiClient.getProjects();
      set({ projects, projectsLoading: false });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Не удалось загрузить проекты';
      set({ projectsError: msg, projectsLoading: false });
    }
  },

  createProject: async (name: string, aspectRatio?: '16:9' | '9:16') => {
    const project = await apiClient.createProject(name, aspectRatio);
    set((state) => ({ projects: [project, ...state.projects] }));
    return project;
  },

  updateProject: async (id: number, data: Partial<Pick<Project, 'name' | 'status' | 'aspect_ratio'>>) => {
    const updated = await apiClient.updateProject(id, data);
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? updated : p)),
      currentProject: state.currentProject?.id === id ? updated : state.currentProject,
    }));
  },

  deleteProject: async (id: number) => {
    await apiClient.deleteProject(id);
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
    }));
  },

  // ─── Scenes ──────────────────────────────────────────────

  fetchProject: async (projectId: number) => {
    try {
      const project = await apiClient.getProject(projectId);
      set({ currentProject: project });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Не удалось загрузить проект';
      set({ scenesError: msg });
    }
  },

  fetchScenes: async (projectId: number) => {
    set({ scenesLoading: true, scenesError: null });
    try {
      const scenes = await apiClient.getScenes(projectId);
      set({ scenes, scenesLoading: false });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Не удалось загрузить сцены';
      set({ scenesError: msg, scenesLoading: false });
    }
  },

  createScene: async (projectId: number, name: string) => {
    const scene = await apiClient.createScene(projectId, name);
    set((state) => ({
      scenes: [...state.scenes, scene],
      // Update project scenes_count in list
      projects: state.projects.map((p) =>
        p.id === projectId ? { ...p, scenes_count: p.scenes_count + 1 } : p
      ),
      currentProject: state.currentProject?.id === projectId
        ? { ...state.currentProject, scenes_count: state.currentProject.scenes_count + 1 }
        : state.currentProject,
    }));
    return scene;
  },

  updateScene: async (id: number, data: Partial<Pick<Scene, 'name' | 'status'>>) => {
    const updated = await apiClient.updateScene(id, data);
    set((state) => ({
      scenes: state.scenes.map((s) => (s.id === id ? updated : s)),
    }));
  },

  deleteScene: async (id: number) => {
    const scene = get().scenes.find((s) => s.id === id);
    await apiClient.deleteScene(id);
    set((state) => ({
      scenes: state.scenes.filter((s) => s.id !== id),
      // Update project scenes_count
      projects: scene
        ? state.projects.map((p) =>
            p.id === scene.project ? { ...p, scenes_count: Math.max(0, p.scenes_count - 1) } : p
          )
        : state.projects,
      currentProject:
        state.currentProject && scene && state.currentProject.id === scene.project
          ? { ...state.currentProject, scenes_count: Math.max(0, state.currentProject.scenes_count - 1) }
          : state.currentProject,
    }));
  },

  reorderScenes: async (sceneIds: number[]) => {
    await apiClient.reorderScenes(sceneIds);
    // Refetch to ensure consistency
    const projectId = get().currentProject?.id;
    if (projectId) {
      await get().fetchScenes(projectId);
    }
  },

  optimisticallyReorderScenes: (sceneIds: number[]) => {
    set((state) => {
      const scenesMap = new Map(state.scenes.map((s) => [s.id, s]));
      const reordered = sceneIds.map((id) => scenesMap.get(id)).filter((s): s is Scene => s !== undefined);
      return { scenes: reordered };
    });
  },

  clearCurrentProject: () => {
    set({ currentProject: null, scenes: [], scenesError: null });
  },
}));
