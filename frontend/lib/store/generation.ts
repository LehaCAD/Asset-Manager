import { create } from "zustand";
import { toast } from "sonner";
import { aiModelsApi } from "@/lib/api/ai-models";
import { scenesApi } from "@/lib/api/scenes";
import { projectsApi } from "@/lib/api/projects";
import { useSceneWorkspaceStore } from "@/lib/store/scene-workspace";
import { useCreditsStore } from "@/lib/store/credits";
import type {
  AIModel,
  GeneratePayload,
  GenerationSubmitResult,
  GenerationSubmitState,
  ImageInputGroup,
  ImageInputGroupsSchema,
} from "@/lib/types";
import { isGroupsSchema } from "@/lib/types";

export interface ImageFileEntry {
  displayUrl: string; // Для PromptThumbnail: thumbnail_url || file_url
  apiUrl: string; // Для API-запроса: file_url
  elementId?: number; // ID элемента для pre-select в модалке
}

export interface ImageInput {
  key: string;
  label: string;
  required: boolean;
  min: number;
  max: number;
  files: ImageFileEntry[];
}

interface GenerationState {
  // Data
  availableModels: AIModel[];
  selectedModel: AIModel | null;
  parameters: Record<string, unknown>;
  prompt: string;
  imageInputs: ImageInput[];
  selectedGroup: ImageInputGroup | null;
  isGenerating: boolean;
  submitState: GenerationSubmitState;
  lastSubmitResult: GenerationSubmitResult | null;

  // UI
  configPanelOpen: boolean;
  modelSelectorOpen: boolean;

  // Actions
  loadModels: () => Promise<void>;
  selectModel: (model: AIModel) => void;
  selectGroup: (groupKey: string) => void;
  clearGroup: () => void;
  setParameter: (key: string, value: unknown) => void;
  setPrompt: (text: string) => void;
  setImageInput: (key: string, files: ImageFileEntry[]) => void;
  clearImageInput: (key: string) => void;
  generate: (projectId: number, groupId?: number) => Promise<GenerationSubmitResult>;
  canGenerate: () => boolean;
  clearSubmitResult: () => void;

  // Internal
  _requestEstimate: () => void;

  // UI actions
  toggleConfigPanel: () => void;
  setConfigPanelOpen: (open: boolean) => void;
  openModelSelector: () => void;
  closeModelSelector: () => void;
}

export const useGenerationStore = create<GenerationState>()((set, get) => ({
  availableModels: [],
  selectedModel: null,
  parameters: {},
  prompt: "",
  imageInputs: [],
  selectedGroup: null,
  isGenerating: false,
  submitState: "idle",
  lastSubmitResult: null,
  configPanelOpen: true,
  modelSelectorOpen: false,

  loadModels: async () => {
    try {
      const models = await aiModelsApi.getAll();
      set({ availableModels: models });

      // Auto-select first image model if no model is selected
      const { selectedModel } = get();
      if (!selectedModel && models.length > 0) {
        const firstImageModel = models.find((m) => m.model_type === "IMAGE");
        if (firstImageModel) {
          get().selectModel(firstImageModel);
        }
      }
    } catch {
      toast.error("Не удалось загрузить модели");
    }
  },

  selectModel: (model) => {
    // Revoke old blob URLs before replacing imageInputs
    for (const input of get().imageInputs) {
      const urlsToRevoke = input.files.flatMap((f) =>
        [f.displayUrl, f.apiUrl].filter((u) => u.startsWith("blob:"))
      );
      urlsToRevoke.forEach((u) => URL.revokeObjectURL(u));
    }

    // Build defaults from parameters_schema
    const defaults: Record<string, unknown> = {};
    for (const param of model.parameters_schema) {
      if (param.default !== undefined) {
        defaults[param.request_key] = param.default;
      }
    }

    // Build imageInputs from image_inputs_schema
    const rawSchema = model.image_inputs_schema;
    let inputs: ImageInput[] = [];

    if (Array.isArray(rawSchema)) {
      // Simple format: [{key, label, min, max}] — build inputs directly
      inputs = rawSchema.map((schema) => ({
        key: schema.key,
        label: schema.label,
        required: !!schema.required,
        min: schema.min,
        max: schema.max,
        files: [],
      }));
    }
    // Groups format: don't build inputs — wait for user to pick a slot in ModeSelector

    set({
      selectedModel: model,
      parameters: defaults,
      imageInputs: inputs,
      selectedGroup: null,
      modelSelectorOpen: false,
    });
    
    // Запрашиваем оценку стоимости для новой модели
    get()._requestEstimate();
  },

  selectGroup: (groupKey) => {
    const { selectedModel, selectedGroup: currentGroup, imageInputs } = get();
    if (!selectedModel) return;
    const rawSchema = selectedModel.image_inputs_schema;
    if (!isGroupsSchema(rawSchema)) return;

    const group = rawSchema.groups.find((g) => g.key === groupKey);
    if (!group) return;

    // If same group already selected — keep existing files, don't reset
    if (currentGroup?.key === groupKey) return;

    // Switching to different group — revoke old blob URLs
    for (const input of imageInputs) {
      const urlsToRevoke = input.files.flatMap((f) =>
        [f.displayUrl, f.apiUrl].filter((u) => u.startsWith("blob:"))
      );
      urlsToRevoke.forEach((u) => URL.revokeObjectURL(u));
    }

    // Build imageInputs from selected group's slots only
    const inputs: ImageInput[] = group.slots.map((slot) => ({
      key: slot.key,
      label: slot.label,
      required: slot.min > 0,
      min: slot.min,
      max: slot.max,
      files: [],
    }));

    set({ selectedGroup: group, imageInputs: inputs });
  },

  clearGroup: () => {
    const { imageInputs } = get();
    // Revoke blob URLs
    for (const input of imageInputs) {
      const urlsToRevoke = input.files.flatMap((f) =>
        [f.displayUrl, f.apiUrl].filter((u) => u.startsWith("blob:"))
      );
      urlsToRevoke.forEach((u) => URL.revokeObjectURL(u));
    }
    set({ selectedGroup: null, imageInputs: [] });
  },

  setParameter: (key, value) => {
    set((state) => ({
      parameters: { ...state.parameters, [key]: value },
    }));
    // Перезапрашиваем оценку при изменении параметров
    get()._requestEstimate();
  },

  setPrompt: (text) => {
    set({ prompt: text });
  },

  setImageInput: (key, files) => {
    const { imageInputs } = get();
    const input = imageInputs.find((i) => i.key === key);
    if (!input) return;

    // Revoke old blob URLs before replacing
    const urlsToRevoke = input.files.flatMap((f) =>
      [f.displayUrl, f.apiUrl].filter((u) => u.startsWith("blob:"))
    );
    urlsToRevoke.forEach((u) => URL.revokeObjectURL(u));

    // Validate max files
    let newFiles = files;
    if (files.length > input.max) {
      newFiles = files.slice(0, input.max);
      toast.warning(`Максимум ${input.max} изображений для ${input.label}`);
    }

    // If clearing a slot, promote dependent slot's files up (depends_on cascade)
    if (newFiles.length === 0) {
      const { selectedGroup } = get();
      if (selectedGroup) {
        const dependentSlot = selectedGroup.slots.find((s) => s.depends_on === key);
        if (dependentSlot) {
          const dependentInput = imageInputs.find((i) => i.key === dependentSlot.key);
          if (dependentInput && dependentInput.files.length > 0) {
            // Promote: dependent files → parent slot, clear dependent
            set((state) => ({
              imageInputs: state.imageInputs.map((i) => {
                if (i.key === key) return { ...i, files: dependentInput.files };
                if (i.key === dependentSlot.key) return { ...i, files: [] };
                return i;
              }),
            }));
            return;
          }
        }
      }
    }

    set((state) => ({
      imageInputs: state.imageInputs.map((i) =>
        i.key === key ? { ...i, files: newFiles } : i
      ),
    }));
  },

  clearImageInput: (key) => {
    const { imageInputs } = get();
    const input = imageInputs.find((i) => i.key === key);
    if (!input) return;

    // Revoke blob URLs before clearing
    const urlsToRevoke = input.files.flatMap((f) =>
      [f.displayUrl, f.apiUrl].filter((u) => u.startsWith("blob:"))
    );
    urlsToRevoke.forEach((u) => URL.revokeObjectURL(u));

    set((state) => ({
      imageInputs: state.imageInputs.map((i) =>
        i.key === key ? { ...i, files: [] } : i
      ),
    }));
  },

  generate: async (projectId, groupId?) => {
    if (!get().canGenerate()) {
      const result: GenerationSubmitResult = {
        ok: false,
        state: "rejected",
        errorMessage: "Заполните обязательные поля",
        optimisticId: null,
      };
      set({
        submitState: "rejected",
        lastSubmitResult: result,
      });
      toast.error(result.errorMessage);
      return result;
    }

    // Build generation config
    const imageInputsMap: Record<string, string[]> = {};
    const rawSchema = get().selectedModel?.image_inputs_schema;
    const { selectedGroup } = get();

    // Build collect_to mapping from selected group
    const collectToMap: Record<string, string> = {};
    if (selectedGroup?.collect_to) {
      for (const slot of selectedGroup.slots) {
        collectToMap[slot.key] = selectedGroup.collect_to;
      }
    }

    for (const input of get().imageInputs) {
      if (input.files.length > 0) {
        const targetKey = collectToMap[input.key] || input.key;
        const urls = input.files.map((f) => f.apiUrl);
        imageInputsMap[targetKey] = [...(imageInputsMap[targetKey] || []), ...urls];
      }
    }

    // Build extra_params from selected group or no_images_params
    let schemaExtraParams: Record<string, unknown> = {};
    if (rawSchema && isGroupsSchema(rawSchema)) {
      const hasAnyImages = Object.keys(imageInputsMap).length > 0;
      if (!hasAnyImages && rawSchema.no_images_params) {
        schemaExtraParams = { ...rawSchema.no_images_params };
      } else if (selectedGroup?.extra_params) {
        schemaExtraParams = { ...selectedGroup.extra_params };
      }
    }

    const generationConfig = {
      ...get().parameters,
      ...imageInputsMap,
      ...schemaExtraParams,
    };

    // Create optimistic generation item FIRST (before API call)
    // Use groupId as sceneId for optimistic element if inside a group, otherwise 0 (project root)
    const optimisticId = useSceneWorkspaceStore
      .getState()
      .createOptimisticGeneration({
        sceneId: groupId ?? 0,
        promptText: get().prompt,
        aiModelId: get().selectedModel!.id,
        generationConfig,
        elementType: get().selectedModel!.model_type === "VIDEO" ? "VIDEO" : "IMAGE",
      });

    set({
      isGenerating: true,
      submitState: "submitting",
      lastSubmitResult: null,
    });

    try {
      const payload: GeneratePayload = {
        prompt: get().prompt,
        ai_model_id: get().selectedModel!.id,
        generation_config: generationConfig,
      };

      let element;
      if (groupId) {
        element = await scenesApi.generate(groupId, payload);
      } else {
        element = await projectsApi.generateInProject(projectId, payload);
      }

      // Success: resolve optimistic generation to real element
      useSceneWorkspaceStore.getState().resolveOptimisticGeneration(optimisticId, element);

      const result: GenerationSubmitResult = {
        ok: true,
        state: "accepted",
        element,
        optimisticId,
      };

      set({
        submitState: "accepted",
        lastSubmitResult: result,
      });
      toast.success("Генерация запущена");
      // Обновляем баланс после успешной генерации
      useCreditsStore.getState().loadBalance();
      return result;
    } catch (error) {
      // Request-level fail: discard optimistic item and show error
      useSceneWorkspaceStore.getState().discardOptimisticGeneration(optimisticId);

      const result: GenerationSubmitResult = {
        ok: false,
        state: "rejected",
        errorMessage:
          error instanceof Error ? error.message : "Не удалось запустить генерацию",
        optimisticId,
      };
      set({
        submitState: "rejected",
        lastSubmitResult: result,
      });
      toast.error(result.errorMessage);
      return result;
    } finally {
      set({ isGenerating: false });
    }
  },

  canGenerate: () => {
    const { selectedModel, prompt, imageInputs, isGenerating } = get();

    // Check model selected
    if (!selectedModel) return false;

    // Check prompt not empty
    if (prompt.trim().length === 0) return false;

    // Check all required image inputs have at least min files
    const allRequiredFilled = imageInputs.every(
      (input) => !input.required || input.files.length >= input.min
    );
    if (!allRequiredFilled) return false;

    // Check not already generating
    if (isGenerating) return false;

    // Check credits: can afford and no estimate error
    const creditsState = useCreditsStore.getState();
    if (creditsState.estimateError) return false;
    if (creditsState.estimateCost !== null && !creditsState.canAfford) return false;

    return true;
  },
  
  _requestEstimate: () => {
    const { selectedModel, parameters, imageInputs } = get();
    if (!selectedModel) return;
    
    // Формируем generation_config
    const imageInputsMap: Record<string, string[]> = {};
    for (const input of imageInputs) {
      if (input.files.length > 0) {
        imageInputsMap[input.key] = input.files.map((f) => f.apiUrl);
      }
    }
    
    const generationConfig = {
      ...parameters,
      ...imageInputsMap,
    };
    
    // Запрашиваем оценку стоимости
    useCreditsStore.getState().estimateGeneration({
      ai_model_id: selectedModel.id,
      generation_config: generationConfig,
    });
  },

  clearSubmitResult: () => {
    set({
      submitState: "idle",
      lastSubmitResult: null,
    });
  },

  toggleConfigPanel: () =>
    set((s) => ({ configPanelOpen: !s.configPanelOpen })),
  setConfigPanelOpen: (open) => set({ configPanelOpen: open }),
  openModelSelector: () => set({ modelSelectorOpen: true }),
  closeModelSelector: () => set({ modelSelectorOpen: false }),
}));
