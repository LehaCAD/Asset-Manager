import { create } from 'zustand';
import { apiClient, type Project, type Box } from '../api';

interface ProjectsState {
  // Projects
  projects: Project[];
  projectsLoading: boolean;
  projectsError: string | null;

  // Current project & boxes
  currentProject: Project | null;
  boxes: Box[];
  boxesLoading: boolean;
  boxesError: string | null;

  // Actions — Projects
  fetchProjects: () => Promise<void>;
  createProject: (name: string, aspectRatio?: '16:9' | '9:16') => Promise<Project>;
  updateProject: (id: number, data: Partial<Pick<Project, 'name' | 'status' | 'aspect_ratio'>>) => Promise<void>;
  deleteProject: (id: number) => Promise<void>;

  // Actions — Boxes
  fetchBoxes: (projectId: number) => Promise<void>;
  fetchProject: (projectId: number) => Promise<void>;
  createBox: (projectId: number, name: string) => Promise<Box>;
  updateBox: (id: number, data: Partial<Pick<Box, 'name' | 'status'>>) => Promise<void>;
  deleteBox: (id: number) => Promise<void>;
  reorderBoxes: (boxIds: number[]) => Promise<void>;
  optimisticallyReorderBoxes: (boxIds: number[]) => void;

  // Utilities
  clearCurrentProject: () => void;
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  projectsLoading: false,
  projectsError: null,

  currentProject: null,
  boxes: [],
  boxesLoading: false,
  boxesError: null,

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

  // ─── Boxes ───────────────────────────────────────────────

  fetchProject: async (projectId: number) => {
    try {
      const project = await apiClient.getProject(projectId);
      set({ currentProject: project });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Не удалось загрузить проект';
      set({ boxesError: msg });
    }
  },

  fetchBoxes: async (projectId: number) => {
    set({ boxesLoading: true, boxesError: null });
    try {
      const boxes = await apiClient.getBoxes(projectId);
      set({ boxes, boxesLoading: false });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Не удалось загрузить сцены';
      set({ boxesError: msg, boxesLoading: false });
    }
  },

  createBox: async (projectId: number, name: string) => {
    const box = await apiClient.createBox(projectId, name);
    set((state) => ({
      boxes: [...state.boxes, box],
      // Update project boxes_count in list
      projects: state.projects.map((p) =>
        p.id === projectId ? { ...p, boxes_count: p.boxes_count + 1 } : p
      ),
      currentProject: state.currentProject?.id === projectId
        ? { ...state.currentProject, boxes_count: state.currentProject.boxes_count + 1 }
        : state.currentProject,
    }));
    return box;
  },

  updateBox: async (id: number, data: Partial<Pick<Box, 'name' | 'status'>>) => {
    const updated = await apiClient.updateBox(id, data);
    set((state) => ({
      boxes: state.boxes.map((b) => (b.id === id ? updated : b)),
    }));
  },

  deleteBox: async (id: number) => {
    const box = get().boxes.find((b) => b.id === id);
    await apiClient.deleteBox(id);
    set((state) => ({
      boxes: state.boxes.filter((b) => b.id !== id),
      // Update project boxes_count
      projects: box
        ? state.projects.map((p) =>
            p.id === box.project ? { ...p, boxes_count: Math.max(0, p.boxes_count - 1) } : p
          )
        : state.projects,
      currentProject:
        state.currentProject && box && state.currentProject.id === box.project
          ? { ...state.currentProject, boxes_count: Math.max(0, state.currentProject.boxes_count - 1) }
          : state.currentProject,
    }));
  },

  reorderBoxes: async (boxIds: number[]) => {
    await apiClient.reorderBoxes(boxIds);
    // Refetch to ensure consistency
    const projectId = get().currentProject?.id;
    if (projectId) {
      await get().fetchBoxes(projectId);
    }
  },

  optimisticallyReorderBoxes: (boxIds: number[]) => {
    set((state) => {
      const boxesMap = new Map(state.boxes.map((b) => [b.id, b]));
      const reordered = boxIds.map((id) => boxesMap.get(id)).filter((b): b is Box => b !== undefined);
      return { boxes: reordered };
    });
  },

  clearCurrentProject: () => {
    set({ currentProject: null, boxes: [], boxesError: null });
  },
}));
