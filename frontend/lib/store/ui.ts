import { create } from "zustand";

interface UIState {
  // Modal open state for blocking scene dropzone
  isElementSelectionModalOpen: boolean;
  setElementSelectionModalOpen: (isOpen: boolean) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  isElementSelectionModalOpen: false,
  setElementSelectionModalOpen: (isOpen) => set({ isElementSelectionModalOpen: isOpen }),
}));
