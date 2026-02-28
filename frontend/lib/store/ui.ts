import { create } from "zustand";

type ElementFilter = "all" | "favorites" | "images" | "videos";

interface UIState {
  configPanelOpen: boolean;
  lightboxElementId: number | null;
  selectedElementId: number | null;
  elementFilter: ElementFilter;

  toggleConfigPanel: () => void;
  setConfigPanelOpen: (open: boolean) => void;
  openLightbox: (elementId: number) => void;
  closeLightbox: () => void;
  selectElement: (id: number | null) => void;
  setElementFilter: (filter: ElementFilter) => void;
}

export const useUIStore = create<UIState>((set) => ({
  configPanelOpen: true,
  lightboxElementId: null,
  selectedElementId: null,
  elementFilter: "all",

  toggleConfigPanel: () =>
    set((state) => ({ configPanelOpen: !state.configPanelOpen })),

  setConfigPanelOpen: (open) => set({ configPanelOpen: open }),

  openLightbox: (elementId) =>
    set({ lightboxElementId: elementId, selectedElementId: elementId }),

  closeLightbox: () => set({ lightboxElementId: null }),

  selectElement: (id) => set({ selectedElementId: id }),

  setElementFilter: (filter) => set({ elementFilter: filter }),
}));
