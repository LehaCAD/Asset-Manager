import { create } from "zustand";
import { scenesApi } from "@/lib/api/scenes";
import { elementsApi } from "@/lib/api/elements";
import { projectsApi } from "@/lib/api/projects";
import { clientUploadFile, PresignOrphanError } from "@/lib/utils/client-upload";
import { toast } from "sonner";
import type {
  Scene,
  Element,
  ElementFilter,
  GridDensity,
  WorkspaceElement,
  CreateOptimisticGenerationInput,
  SectionCollapseState,
} from "@/lib/types";

const DENSITY_STORAGE_KEY = "scene-workspace-density";

function parsePersistedDensity(rawDensity: string | null): GridDensity | null {
  if (rawDensity === "sm" || rawDensity === "md" || rawDensity === "lg") {
    return rawDensity;
  }
  return null;
}

function getFirstFavoriteImageId(elements: WorkspaceElement[]): number | null {
  const firstFavoriteImage = [...elements]
    .sort((a, b) => a.order_index - b.order_index)
    .find((element) => element.element_type === "IMAGE" && element.is_favorite);
  return firstFavoriteImage?.id ?? null;
}

let activeLoadSceneController: AbortController | null = null;
let latestLoadSceneRequestId = 0;

function isAbortLikeError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return error.name === "CanceledError" || message.includes("aborted") || message.includes("canceled");
}

/**
 * Quick video frame capture for optimistic preview (data URL, 320px).
 * Separate from client-resize.ts which produces upload-ready JPEG blobs (256px + 800px).
 * This runs instantly when files are queued; client-resize runs during actual upload.
 */
function captureVideoFrame(file: File): Promise<string> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve("");
      return;
    }

    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const src = URL.createObjectURL(file);
    let settled = false;

    const cleanup = () => {
      URL.revokeObjectURL(src);
      video.removeAttribute("src");
      video.load();
    };

    const settle = (value: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    video.onloadeddata = () => {
      video.currentTime = Math.min(0.5, video.duration * 0.1);
    };

    video.onseeked = () => {
      try {
        const MAX = 320;
        let w = video.videoWidth;
        let h = video.videoHeight;
        if (w === 0 || h === 0) { settle(""); return; }
        if (w > MAX || h > MAX) {
          const scale = MAX / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h);
          settle(canvas.toDataURL("image/jpeg", 0.6));
        } else {
          settle("");
        }
      } catch {
        settle("");
      }
    };

    video.onerror = () => settle("");
    setTimeout(() => settle(""), 5000);
    video.src = src;
  });
}

// ── Upload queue (module-level, not in React) ──────────────────────────
interface QueuedUpload {
  sceneId: number; // 0 means project root
  projectId: number;
  file: File;
  tempId: number;
  objectUrl: string;
}

let uploadQueue: QueuedUpload[] = [];
let currentUploadController: AbortController | null = null;
let isProcessingQueue = false;

async function processUploadQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  while (uploadQueue.length > 0) {
    const item = uploadQueue[0];
    const controller = new AbortController();
    currentUploadController = controller;

    try {
      let element;
      // Track which ID to update — starts as tempId, switches to real after _replaceOptimistic
      let trackingId = item.tempId;
      try {
        // New presigned upload flow
        element = await clientUploadFile(
          item.file,
          {
            sceneId: item.sceneId > 0 ? item.sceneId : undefined,
            projectId: item.projectId,
            signal: controller.signal,
          },
          (thumbElement) => {
            // Replace optimistic element as soon as thumbnail is ready
            useSceneWorkspaceStore.getState()._replaceOptimistic(item.tempId, thumbElement);
            trackingId = thumbElement.id;
          },
          (phase, progress) => {
            useSceneWorkspaceStore.getState().updateElement(trackingId, {
              client_upload_phase: phase,
              client_upload_progress: Math.round(progress),
            });
          },
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw error; // Don't fallback on cancel
        }
        // Clean up orphaned presign element before fallback
        if (error instanceof PresignOrphanError) {
          elementsApi.delete(error.elementId).catch(() => {});
        }
        // Fallback to old FormData flow (with progress tracking)
        console.warn("Client upload failed, falling back to server upload:", error);
        const fallbackProgress = (pct: number) => {
          useSceneWorkspaceStore.getState().updateElement(trackingId, {
            client_upload_phase: "upload_full",
            client_upload_progress: Math.round(pct * 0.9), // 0–90%, last 10% = server processing
          });
        };
        element = item.sceneId > 0
          ? await scenesApi.upload(item.sceneId, item.file, { signal: controller.signal, onUploadProgress: fallbackProgress })
          : await projectsApi.uploadToProject(item.projectId, item.file, { signal: controller.signal, onUploadProgress: fallbackProgress });
      }
      // Use trackingId: after presigned thumbnail it's the real ID, otherwise still tempId
      useSceneWorkspaceStore.getState()._replaceOptimistic(trackingId, element);

      // Race condition fix: WS COMPLETED may have arrived while we waited for HTTP response
      // (element still had tempId → WS event was ignored), or WS event may be lost entirely.
      // Poll with increasing delays to catch up.
      if (element.status === "PROCESSING" || element.status === "UPLOADING") {
        const pollId = element.id;
        const delays = [500, 3000, 8000, 15000]; // escalating poll
        const pollOnce = (attempt: number) => {
          if (attempt >= delays.length) return;
          setTimeout(() => {
            const current = useSceneWorkspaceStore.getState().elements.find((e) => e.id === pollId);
            // Stop polling if element is already terminal or gone
            if (!current || current.status === "COMPLETED" || current.status === "FAILED") return;
            elementsApi.getById(pollId).then((fresh) => {
              if (fresh.status === "COMPLETED" || fresh.status === "FAILED") {
                useSceneWorkspaceStore.getState().updateElement(fresh.id, {
                  ...fresh,
                  client_upload_phase: undefined,
                  client_upload_progress: undefined,
                });
              } else {
                pollOnce(attempt + 1);
              }
            }).catch(() => pollOnce(attempt + 1));
          }, delays[attempt]);
        };
        pollOnce(0);
      }
      // Blob URL revocation is handled by the store (updateElement/removeElement)
    } catch (error) {
      if (isAbortLikeError(error)) {
        break;
      }
      useSceneWorkspaceStore.getState().removeElement(item.tempId);
      const message =
        error instanceof Error ? error.message : "Не удалось загрузить файл";
      toast.error(message);
    } finally {
      currentUploadController = null;
      uploadQueue.shift();
    }
  }

  isProcessingQueue = false;
}

function cancelUploadQueue() {
  const pendingItems = [...uploadQueue];
  uploadQueue = [];
  if (currentUploadController) {
    currentUploadController.abort();
    currentUploadController = null;
  }

  const store = useSceneWorkspaceStore.getState();
  for (const item of pendingItems) {
    store.removeElement(item.tempId);
  }
}
// ── End upload queue ────────────────────────────────────────────────────

interface SceneWorkspaceState {
  // Data
  scene: Scene | null;
  elements: WorkspaceElement[];
  groups: Scene[];
  projectId: number | null;

  // UI state
  selectedIds: Set<number>;
  isMultiSelectMode: boolean;
  filter: ElementFilter;
  density: GridDensity;
  lightboxOpen: boolean;
  lightboxElementId: number | null;
  collapsedSections: SectionCollapseState;

  // Loading
  isLoading: boolean;
  error: string | null;

  // Data actions
  loadWorkspace: (projectId: number, groupId?: number) => Promise<void>;
  loadScene: (sceneId: number) => Promise<void>;
  addElement: (element: WorkspaceElement) => void;
  updateElement: (id: number, updates: Partial<WorkspaceElement>) => void;
  removeElement: (id: number) => void;
  createOptimisticGeneration: (input: CreateOptimisticGenerationInput) => number;
  resolveOptimisticGeneration: (tempId: number, real: Element) => void;
  discardOptimisticGeneration: (tempId: number) => void;

  // Element actions (API)
  setHeadliner: (elementId: number) => Promise<void>;
  toggleFavorite: (elementId: number) => Promise<void>;
  deleteElements: (elementIds: number[], options?: { silent?: boolean }) => Promise<void>;
  deleteElement: (elementId: number, options?: { silent?: boolean }) => Promise<void>;
  deleteSelected: () => Promise<void>;
  reorderElements: (ids: number[]) => Promise<void>;
  enqueueUploads: (sceneId: number, files: File[], projectId?: number) => void;
  cancelUploads: () => void;
  resetWorkspace: () => void;

  /** @internal replace optimistic element with server response */
  _replaceOptimistic: (tempId: number, real: Element) => void;

  // Selection
  selectElement: (id: number, addToSelection?: boolean) => void;
  selectRange: (fromId: number, toId: number) => void;
  clearSelection: () => void;
  toggleSelectAll: () => void;
  toggleSectionCollapse: (section: 'groups' | 'elements') => void;
  selectAllInSection: (section: 'groups' | 'elements') => void;
  getVisibleElementsForLightbox: () => WorkspaceElement[];

  // UI
  setFilter: (filter: ElementFilter) => void;
  setDensity: (density: GridDensity) => void;
  hydrateDensityPreference: () => void;
  openLightbox: (elementId: number) => void;
  closeLightbox: () => void;
  navigateLightbox: (direction: "prev" | "next") => void;

  // Computed
  getFilteredElements: () => WorkspaceElement[];
}

export const useSceneWorkspaceStore = create<SceneWorkspaceState>()((set, get) => ({
  scene: null,
  elements: [],
  groups: [],
  projectId: null,
  selectedIds: new Set<number>(),
  isMultiSelectMode: false,
  filter: "all",
  density: "md",
  lightboxOpen: false,
  lightboxElementId: null,
  collapsedSections: { groups: false, elements: false },
  isLoading: false,
  error: null,

  loadWorkspace: async (projectId: number, groupId?: number) => {
    latestLoadSceneRequestId += 1;
    const requestId = latestLoadSceneRequestId;

    if (activeLoadSceneController) {
      activeLoadSceneController.abort();
    }
    const controller = new AbortController();
    activeLoadSceneController = controller;

    // Reset transient UI state when switching context to avoid stale selections/loading artifacts.
    set({
      scene: null,
      elements: [],
      groups: [],
      projectId,
      selectedIds: new Set<number>(),
      isMultiSelectMode: false,
      lightboxOpen: false,
      lightboxElementId: null,
      isLoading: true,
      error: null,
    });
    try {
      let elements: Element[];
      let scene: Scene | null = null;
      let groups: Scene[] = [];

      if (groupId) {
        // Inside a group
        [scene, elements, groups] = await Promise.all([
          scenesApi.getById(groupId, { signal: controller.signal }),
          elementsApi.getByScene(groupId, { signal: controller.signal }),
          scenesApi.getChildren(projectId, groupId),
        ]);
      } else {
        // Project root
        [elements, groups] = await Promise.all([
          elementsApi.getByProject(projectId, true, { signal: controller.signal }),
          scenesApi.getChildren(projectId, null),
        ]);
      }

      if (requestId !== latestLoadSceneRequestId) {
        return;
      }
      const sortedElements = elements.sort((a, b) => a.order_index - b.order_index);
      set({ scene, elements: sortedElements, groups, isLoading: false });

      // Hydrate collapsed sections from localStorage
      try {
        const stored = localStorage.getItem(`grid-sections-${projectId}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && typeof parsed.groups === 'boolean' && typeof parsed.elements === 'boolean') {
            set({ collapsedSections: parsed });
          }
        }
      } catch { /* ignore */ }
    } catch (error) {
      if (requestId !== latestLoadSceneRequestId) {
        return;
      }
      if (isAbortLikeError(error)) {
        set({ isLoading: false });
        return;
      }
      set({ error: "Ошибка загрузки", isLoading: false });
      toast.error("Не удалось загрузить рабочую область");
    } finally {
      if (requestId === latestLoadSceneRequestId && activeLoadSceneController === controller) {
        activeLoadSceneController = null;
      }
    }
  },

  loadScene: async (sceneId: number) => {
    // Deprecated: use loadWorkspace instead
    const scene = await scenesApi.getById(sceneId);
    get().loadWorkspace(scene.project, sceneId);
  },

  addElement: (element: WorkspaceElement) => {
    set((state) => {
      const existingIndex = state.elements.findIndex((current) => current.id === element.id);
      const newElements =
        existingIndex === -1
          ? [...state.elements, element]
          : state.elements.map((current) => (current.id === element.id ? element : current));
      newElements.sort((a, b) => a.order_index - b.order_index);
      return { elements: newElements };
    });
  },

  updateElement: (id: number, updates: Partial<WorkspaceElement>) => {
    set((state) => ({
      elements: state.elements.map((e) => {
        if (e.id !== id) return e;
        if (updates.file_url && e.file_url?.startsWith("blob:")) {
          URL.revokeObjectURL(e.file_url);
        }
        if (updates.thumbnail_url && e.thumbnail_url?.startsWith("blob:")) {
          URL.revokeObjectURL(e.thumbnail_url);
        }
        return { ...e, ...updates };
      }),
    }));
  },

  createOptimisticGeneration: ({
    sceneId,
    promptText,
    aiModelId,
    aiModelName,
    generationConfig = {},
    elementType = "IMAGE",
  }) => {
    const currentOrderMax = get().elements.reduce(
      (max, element) => Math.max(max, element.order_index),
      -1
    );
    const tempId = -Date.now() - Math.floor(Math.random() * 10000);
    const optimistic: WorkspaceElement = {
      id: tempId,
      scene: sceneId,
      project: get().projectId ?? 0,
      element_type: elementType,
      order_index: currentOrderMax + 1,
      file_url: "",
      thumbnail_url: "",
      preview_url: "",
      is_favorite: false,
      prompt_text: promptText,
      ai_model: aiModelId,
      ai_model_name: aiModelName,
      generation_config: generationConfig,
      seed: null,
      status: "PENDING",
      error_message: "",
      source_type: "GENERATED",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      client_optimistic_kind: "generation",
      client_generation_submit_state: "submitting",
    };

    get().addElement(optimistic);
    return tempId;
  },

  resolveOptimisticGeneration: (tempId, real) => {
    get()._replaceOptimistic(tempId, real);
  },

  discardOptimisticGeneration: (tempId) => {
    get().removeElement(tempId);
  },

  removeElement: (id: number) => {
    set((state) => {
      const removed = state.elements.find((el) => el.id === id);
      if (removed) {
        if (removed.file_url?.startsWith("blob:")) URL.revokeObjectURL(removed.file_url);
        if (removed.thumbnail_url?.startsWith("blob:")) URL.revokeObjectURL(removed.thumbnail_url);
      }
      const newSelectedIds = new Set(state.selectedIds);
      newSelectedIds.delete(id);
      return {
        elements: state.elements.filter((e) => e.id !== id),
        selectedIds: newSelectedIds,
      };
    });
  },

  setHeadliner: async (elementId: number) => {
    const { scene } = get();
    if (!scene) return;

    const prevScene = scene;
    set({ scene: { ...scene, headliner: elementId } });

    try {
      const updatedScene = await scenesApi.setHeadliner(scene.id, elementId);
      set({ scene: updatedScene });
      toast.success("Обложка обновлена");
    } catch {
      set({ scene: prevScene });
      toast.error("Не удалось обновить обложку");
    }
  },

  toggleFavorite: async (elementId: number) => {
    const { scene, elements } = get();
    const element = elements.find((e) => e.id === elementId);
    if (!element) return;

    const prevElements = elements;
    const prevScene = scene;
    const newValue = !element.is_favorite;
    const nextElements = elements.map((e) =>
      e.id === elementId ? { ...e, is_favorite: newValue } : e
    );
    const nextHeadlinerId = getFirstFavoriteImageId(nextElements);

    set({
      elements: nextElements,
      scene: scene ? { ...scene, headliner: nextHeadlinerId } : scene,
    });

    try {
      await elementsApi.toggleFavorite(elementId, newValue);
      if (scene) {
        const updatedScene = await scenesApi.setHeadliner(scene.id, nextHeadlinerId);
        set({ scene: updatedScene });
      }
    } catch (error) {
      set({ elements: prevElements, scene: prevScene });
      const message =
        error instanceof Error ? error.message : "Не удалось обновить избранное";
      toast.error(message);
    }
  },

  deleteElements: async (elementIds: number[], options?: { silent?: boolean }) => {
    if (elementIds.length === 0) return;

    // Optimistic elements (negative IDs) — remove locally, no API call
    const localIds = elementIds.filter((id) => id < 0);
    const remoteIds = elementIds.filter((id) => id >= 0);

    if (localIds.length > 0 && remoteIds.length === 0) {
      // All local — just remove from state
      const idsSet = new Set(localIds);
      const nextSelected = new Set(get().selectedIds);
      localIds.forEach((id) => nextSelected.delete(id));
      set({
        elements: get().elements.filter((e) => !idsSet.has(e.id)),
        selectedIds: nextSelected,
        isMultiSelectMode: nextSelected.size > 0,
      });
      if (!options?.silent) toast.success(localIds.length === 1 ? "Элемент удалён" : `Удалено: ${localIds.length}`);
      return;
    }

    // For mixed: remove local ones from the list, proceed with remote
    if (localIds.length > 0) {
      const idsSet = new Set(localIds);
      set({ elements: get().elements.filter((e) => !idsSet.has(e.id)) });
    }

    const { scene, elements, selectedIds } = get();
    const idsSet = new Set(remoteIds);
    const prevElements = elements;
    const prevSelectedIds = selectedIds;
    const prevScene = scene;

    const nextSelected = new Set(selectedIds);
    remoteIds.forEach((id) => nextSelected.delete(id));

    const shouldClearHeadliner = scene?.headliner !== null && scene?.headliner !== undefined
      ? idsSet.has(scene.headliner)
      : false;

    set({
      elements: elements.filter((e) => !idsSet.has(e.id)),
      selectedIds: nextSelected,
      isMultiSelectMode: nextSelected.size > 0,
      scene: shouldClearHeadliner && scene ? { ...scene, headliner: null } : scene,
    });

    const results = await Promise.allSettled(
      remoteIds.map((id) => elementsApi.delete(id))
    );

    const failedIds = results
      .map((result, index) => ({ result, id: remoteIds[index] }))
      .filter(({ result }) => result.status === "rejected")
      .map(({ id }) => id);

    if (failedIds.length === 0) {
      if (!options?.silent) {
        toast.success(
          remoteIds.length === 1 ? "Элемент удалён" : `Удалено: ${remoteIds.length}`
        );
      }
      return;
    }

    const failedSet = new Set(failedIds);
    const failedElements = prevElements.filter((e) => failedSet.has(e.id));

    set((state) => ({
      elements: [...state.elements, ...failedElements].sort(
        (a, b) => a.order_index - b.order_index
      ),
      selectedIds: prevSelectedIds,
      isMultiSelectMode: prevSelectedIds.size > 0,
      scene:
        prevScene?.headliner && failedSet.has(prevScene.headliner)
          ? prevScene
          : state.scene,
    }));

    if (failedIds.length === remoteIds.length) {
      toast.error("Не удалось удалить элементы");
    } else {
      toast.error(
        `Удалено ${remoteIds.length - failedIds.length} из ${remoteIds.length}`
      );
    }
  },

  deleteElement: async (elementId: number, options?: { silent?: boolean }) => {
    await get().deleteElements([elementId], options);
  },

  deleteSelected: async () => {
    const { selectedIds, deleteElements } = get();
    const ids = Array.from(selectedIds);

    if (ids.length === 0) return;
    await deleteElements(ids);
  },

  reorderElements: async (ids: number[]) => {
    const { scene, elements } = get();
    if (!scene) return;

    const prevElements = elements;

    const reorderedElements = ids
      .map((id) => elements.find((e) => e.id === id))
      .filter((e): e is Element => e !== undefined)
      .map((e, index) => ({ ...e, order_index: index }));

    const newElements = elements
      .filter((e) => !ids.includes(e.id))
      .concat(reorderedElements)
      .sort((a, b) => a.order_index - b.order_index);

    set({ elements: newElements });

    try {
      await elementsApi.reorder(scene.id, { element_ids: ids });
    } catch {
      set({ elements: prevElements });
      toast.error("Не удалось изменить порядок");
    }
  },

  enqueueUploads: (sceneId: number, files: File[], projectId?: number) => {
    let currentOrderMax = get().elements.reduce(
      (max, el) => Math.max(max, el.order_index),
      -1
    );

    for (const file of files) {
      const tempId = -Date.now() - Math.floor(Math.random() * 10000);
      const isVideo = file.type.startsWith("video/");
      const objectUrl = URL.createObjectURL(file);
      currentOrderMax += 1;

      const optimistic: WorkspaceElement = {
        id: tempId,
        scene: sceneId,
        project: get().projectId ?? 0,
        element_type: isVideo ? "VIDEO" : "IMAGE",
        order_index: currentOrderMax,
        file_url: objectUrl,
        thumbnail_url: isVideo ? "" : objectUrl,
        preview_url: "",
        is_favorite: false,
        prompt_text: "",
        ai_model: null,
        generation_config: {},
        seed: null,
        status: "UPLOADING",
        error_message: "",
        source_type: "UPLOADED",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        client_optimistic_kind: "upload",
        client_upload_phase: "resize",
        client_upload_progress: 0,
      };

      get().addElement(optimistic);
      uploadQueue.push({ sceneId, projectId: projectId ?? get().projectId ?? 0, file, tempId, objectUrl });

      if (isVideo) {
        const tid = tempId;
        captureVideoFrame(file).then((dataUrl) => {
          if (dataUrl) {
            get().updateElement(tid, { thumbnail_url: dataUrl });
          }
        });
      }
    }

    processUploadQueue();
  },

  cancelUploads: () => {
    cancelUploadQueue();
  },

  resetWorkspace: () => {
    cancelUploadQueue();
    for (const el of get().elements) {
      if (el.file_url?.startsWith("blob:")) URL.revokeObjectURL(el.file_url);
      if (el.thumbnail_url?.startsWith("blob:")) URL.revokeObjectURL(el.thumbnail_url);
    }
    set({
      scene: null,
      elements: [],
      groups: [],
      projectId: null,
      selectedIds: new Set<number>(),
      isMultiSelectMode: false,
      filter: "all",
      lightboxOpen: false,
      lightboxElementId: null,
      isLoading: false,
      error: null,
    });
  },

  _replaceOptimistic: (tempId: number, real: Element) => {
    set((state) => ({
      elements: state.elements
        .map((e) => {
          if (e.id !== tempId) return e;
          return {
            ...real,
            file_url: real.file_url || e.file_url,
            thumbnail_url: real.thumbnail_url || e.thumbnail_url,
            // Preserve client-side tracking fields while upload is in progress
            ...(real.status !== "COMPLETED" && real.status !== "FAILED" ? {
              client_optimistic_kind: e.client_optimistic_kind,
              client_upload_phase: e.client_upload_phase,
              client_upload_progress: e.client_upload_progress,
            } : {}),
          };
        })
        .sort((a, b) => a.order_index - b.order_index),
    }));
  },

  selectElement: (id: number, addToSelection?: boolean) => {
    if (addToSelection) {
      set((state) => {
        const newSelectedIds = new Set(state.selectedIds);
        if (newSelectedIds.has(id)) {
          newSelectedIds.delete(id);
        } else {
          newSelectedIds.add(id);
        }
        return {
          selectedIds: newSelectedIds,
          isMultiSelectMode: newSelectedIds.size > 0,
        };
      });
    } else {
      set({ selectedIds: new Set([id]) });
    }
  },

  selectRange: (fromId: number, toId: number) => {
    const filtered = get().getFilteredElements();
    const fromIndex = filtered.findIndex((e) => e.id === fromId);
    const toIndex = filtered.findIndex((e) => e.id === toId);

    if (fromIndex === -1 || toIndex === -1) return;

    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);
    const rangeIds = filtered.slice(start, end + 1).map((e) => e.id);

    set({
      selectedIds: new Set(rangeIds),
      isMultiSelectMode: true,
    });
  },

  clearSelection: () => {
    set({ selectedIds: new Set(), isMultiSelectMode: false });
  },

  toggleSelectAll: () => {
    const { selectedIds, getFilteredElements, groups } = get();
    const filtered = getFilteredElements();
    const totalCount = filtered.length + groups.length;
    if (totalCount === 0) return;
    if (selectedIds.size === totalCount) {
      set({ selectedIds: new Set(), isMultiSelectMode: false });
    } else {
      const ids = new Set([
        ...filtered.map((e) => e.id),
        ...groups.map((g) => g.id),
      ]);
      set({ selectedIds: ids, isMultiSelectMode: true });
    }
  },

  toggleSectionCollapse: (section: 'groups' | 'elements') => {
    const { collapsedSections, projectId } = get();
    const next = {
      ...collapsedSections,
      [section]: !collapsedSections[section],
    };
    set({ collapsedSections: next });
    if (projectId) {
      try {
        localStorage.setItem(
          `grid-sections-${projectId}`,
          JSON.stringify(next),
        );
      } catch { /* localStorage unavailable */ }
    }
  },

  selectAllInSection: (section: 'groups' | 'elements') => {
    const { selectedIds, getFilteredElements, groups } = get();

    if (section === 'groups') {
      const groupIds = groups.map((g) => g.id);
      const allGroupsSelected = groupIds.length > 0 && groupIds.every((id) => selectedIds.has(id));
      const next = new Set(selectedIds);
      if (allGroupsSelected) {
        groupIds.forEach((id) => next.delete(id));
      } else {
        groupIds.forEach((id) => next.add(id));
      }
      set({ selectedIds: next, isMultiSelectMode: next.size > 0 });
    } else {
      const filtered = getFilteredElements();
      const elementIds = filtered.map((e) => e.id);
      const allElementsSelected = elementIds.length > 0 && elementIds.every((id) => selectedIds.has(id));
      const next = new Set(selectedIds);
      if (allElementsSelected) {
        elementIds.forEach((id) => next.delete(id));
      } else {
        elementIds.forEach((id) => next.add(id));
      }
      set({ selectedIds: next, isMultiSelectMode: next.size > 0 });
    }
  },

  setFilter: (filter: ElementFilter) => {
    set({ filter, selectedIds: new Set(), isMultiSelectMode: false });
  },

  setDensity: (density: GridDensity) => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(DENSITY_STORAGE_KEY, density);
      } catch (error) {
        console.error("Failed to persist grid density", error);
      }
    }
    set({ density });
  },

  hydrateDensityPreference: () => {
    if (typeof window === "undefined") return;
    try {
      const persistedDensity = parsePersistedDensity(
        window.localStorage.getItem(DENSITY_STORAGE_KEY)
      );
      if (persistedDensity) {
        set({ density: persistedDensity });
      }
    } catch (error) {
      console.error("Failed to read persisted grid density", error);
    }
  },

  openLightbox: (elementId: number) => {
    set({ lightboxOpen: true, lightboxElementId: elementId });
  },

  closeLightbox: () => {
    set({ lightboxOpen: false, lightboxElementId: null });
  },

  navigateLightbox: (direction: "prev" | "next") => {
    const { lightboxElementId, getFilteredElements } = get();
    const filtered = getFilteredElements();

    if (filtered.length === 0 || lightboxElementId === null) return;

    const currentIndex = filtered.findIndex((e) => e.id === lightboxElementId);
    if (currentIndex === -1) return;

    let newIndex: number;
    if (direction === "prev") {
      newIndex = currentIndex === 0 ? filtered.length - 1 : currentIndex - 1;
    } else {
      newIndex = currentIndex === filtered.length - 1 ? 0 : currentIndex + 1;
    }

    set({ lightboxElementId: filtered[newIndex].id });
  },

  getFilteredElements: () => {
    const { elements, filter } = get();
    let filtered: WorkspaceElement[];

    switch (filter) {
      case "favorites":
        filtered = elements.filter((e) => e.is_favorite);
        break;
      case "images":
        filtered = elements.filter((e) => e.element_type === "IMAGE");
        break;
      case "videos":
        filtered = elements.filter((e) => e.element_type === "VIDEO");
        break;
      case "all":
      default:
        filtered = elements;
        break;
    }

    return filtered.sort((a, b) => a.order_index - b.order_index);
  },

  getVisibleElementsForLightbox: () => {
    const { collapsedSections } = get();
    if (collapsedSections.elements) return [];
    return get().getFilteredElements();
  },
}));
