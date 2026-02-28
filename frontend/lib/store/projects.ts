import { create } from "zustand";
import { projectsApi } from "@/lib/api/projects";
import type { Project, CreateProjectPayload, UpdateProjectPayload } from "@/lib/types";

interface ProjectsState {
  projects: Project[];
  isLoading: boolean;
  error: string | null;

  loadProjects: () => Promise<void>;
  createProject: (payload: CreateProjectPayload) => Promise<Project>;
  updateProject: (id: number, payload: UpdateProjectPayload) => Promise<void>;
  deleteProject: (id: number) => Promise<void>;
}

export const useProjectsStore = create<ProjectsState>()((set, get) => ({
  projects: [],
  isLoading: false,
  error: null,

  loadProjects: async () => {
    set({ isLoading: true, error: null });
    try {
      const projects = await projectsApi.getAll();
      set({ projects, isLoading: false });
    } catch (err) {
      set({ error: String(err), isLoading: false });
    }
  },

  createProject: async (payload) => {
    const project = await projectsApi.create(payload);
    set((s) => ({ projects: [project, ...s.projects] }));
    return project;
  },

  updateProject: async (id, payload) => {
    const updated = await projectsApi.update(id, payload);
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? updated : p)),
    }));
  },

  deleteProject: async (id) => {
    await projectsApi.delete(id);
    set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
  },
}));
