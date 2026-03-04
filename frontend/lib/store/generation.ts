import { create } from "zustand";
import type {
  AIModel,
  ImageInputSchemaItem,
} from "@/lib/types";

export interface ImageInput {
  key: string;
  label: string;
  required: boolean;
  min: number;
  max: number;
  files: string[];  // URLs or object URLs of selected images
}

interface GenerationState {
  // Data
  availableModels: AIModel[];
  selectedModel: AIModel | null;
  parameters: Record<string, unknown>;
  prompt: string;
  imageInputs: ImageInput[];
  isGenerating: boolean;

  // UI
  configPanelOpen: boolean;
  modelSelectorOpen: boolean;

  // Actions
  loadModels: () => Promise<void>;
  selectModel: (model: AIModel) => void;
  setParameter: (key: string, value: unknown) => void;
  setPrompt: (text: string) => void;
  setImageInput: (key: string, files: string[]) => void;
  clearImageInput: (key: string) => void;
  generate: (sceneId: number) => Promise<void>;
  canGenerate: () => boolean;

  // UI actions
  toggleConfigPanel: () => void;
  setConfigPanelOpen: (open: boolean) => void;
  openModelSelector: () => void;
  closeModelSelector: () => void;
}

const notImplemented = (name: string) => {
  throw new Error(`generationStore.${name} not implemented — see TASK_7_1`);
};

export const useGenerationStore = create<GenerationState>()((set, get) => ({
  availableModels: [],
  selectedModel: null,
  parameters: {},
  prompt: "",
  imageInputs: [],
  isGenerating: false,
  configPanelOpen: true,
  modelSelectorOpen: false,

  // TODO: TASK_7_1 implements all actions below
  loadModels: async () => notImplemented("loadModels"),
  selectModel: () => notImplemented("selectModel"),
  setParameter: () => notImplemented("setParameter"),
  setPrompt: () => notImplemented("setPrompt"),
  setImageInput: () => notImplemented("setImageInput"),
  clearImageInput: () => notImplemented("clearImageInput"),
  generate: async () => notImplemented("generate"),
  canGenerate: () => false,
  toggleConfigPanel: () => set((s) => ({ configPanelOpen: !s.configPanelOpen })),
  setConfigPanelOpen: (open) => set({ configPanelOpen: open }),
  openModelSelector: () => set({ modelSelectorOpen: true }),
  closeModelSelector: () => set({ modelSelectorOpen: false }),
}));
