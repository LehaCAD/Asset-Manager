import { create } from "zustand";
import { scenesApi } from "@/lib/api/scenes";
import { elementsApi } from "@/lib/api/elements";
import { toast } from "sonner";
import type {
  Scene,
  Element,
  ElementFilter,
  GridDensity,
} from "@/lib/types";

const DENSITY_STORAGE_KEY = "scene-workspace-density";

function parsePersistedDensity(rawDensity: string | null): GridDensity | null {
  if (rawDensity === "sm" || rawDensity === "md" || rawDensity === "lg") {
    return rawDensity;
  }
  return null;
}

function getFirstFavoriteImageId(elements: Element[]): number | null {
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

// ── Client-side video frame capture ─────────────────────────────────────
// Extracts a single frame from a video File using a hidden <video> + canvas.
// Returns a small data-URL JPEG (~320px max side). The temporary video element
// and its blob URL are cleaned up immediately; nothing stays in the DOM.
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
  sceneId: number;
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
      const element = await scenesApi.upload(item.sceneId, item.file, {
        signal: controller.signal,
      });
      useSceneWorkspaceStore.getState()._replaceOptimistic(item.tempId, element);
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
  elements: Element[];

  // UI state
  selectedIds: Set<number>;
  isMultiSelectMode: boolean;
  filter: ElementFilter;
  density: GridDensity;
  lightboxOpen: boolean;
  lightboxElementId: number | null;

  // Loading
  isLoading: boolean;
  error: string | null;

  // Data actions
  loadScene: (sceneId: number) => Promise<void>;
  addElement: (element: Element) => void;
  updateElement: (id: number, updates: Partial<Element>) => void;
  removeElement: (id: number) => void;

  // Element actions (API)
  setHeadliner: (elementId: number) => Promise<void>;
  toggleFavorite: (elementId: number) => Promise<void>;
  deleteElements: (elementIds: number[]) => Promise<void>;
  deleteElement: (elementId: number) => Promise<void>;
  deleteSelected: () => Promise<void>;
  reorderElements: (ids: number[]) => Promise<void>;
  enqueueUploads: (sceneId: number, files: File[]) => void;
  cancelUploads: () => void;
  resetWorkspace: () => void;

  /** @internal replace optimistic element with server response */
  _replaceOptimistic: (tempId: number, real: Element) => void;

  // Selection
  selectElement: (id: number, addToSelection?: boolean) => void;
  selectRange: (fromId: number, toId: number) => void;
  clearSelection: () => void;
  toggleSelectAll: () => void;

  // UI
  setFilter: (filter: ElementFilter) => void;
  setDensity: (density: GridDensity) => void;
  hydrateDensityPreference: () => void;
  openLightbox: (elementId: number) => void;
  closeLightbox: () => void;
  navigateLightbox: (direction: "prev" | "next") => void;

  // Computed
  getFilteredElements: () => Element[];
}

export const useSceneWorkspaceStore = create<SceneWorkspaceState>()((set, get) => ({
  scene: null,
  elements: [],
  selectedIds: new Set<number>(),
  isMultiSelectMode: false,
  filter: "all",
  density: "md",
  lightboxOpen: false,
  lightboxElementId: null,
  isLoading: false,
  error: null,

  loadScene: async (sceneId: number) => {
    latestLoadSceneRequestId += 1;
    const requestId = latestLoadSceneRequestId;

    if (activeLoadSceneController) {
      activeLoadSceneController.abort();
    }
    const controller = new AbortController();
    activeLoadSceneController = controller;

    // Reset transient UI state when switching scenes to avoid stale selections/loading artifacts.
    set({
      scene: null,
      elements: [],
      selectedIds: new Set<number>(),
      isMultiSelectMode: false,
      lightboxOpen: false,
      lightboxElementId: null,
      isLoading: true,
      error: null,
    });
    try {
      const [scene, elements] = await Promise.all([
        scenesApi.getById(sceneId, { signal: controller.signal }),
        elementsApi.getByScene(sceneId, { signal: controller.signal }),
      ]);
      if (requestId !== latestLoadSceneRequestId) {
        return;
      }
      const sortedElements = elements.sort((a, b) => a.order_index - b.order_index);
      set({ scene, elements: sortedElements, isLoading: false });
    } catch (error) {
      if (requestId !== latestLoadSceneRequestId) {
        return;
      }
      if (isAbortLikeError(error)) {
        set({ isLoading: false });
        return;
      }
      set({ error: "Failed to load scene", isLoading: false });
      toast.error("Не удалось загрузить сцену");
    } finally {
      if (requestId === latestLoadSceneRequestId && activeLoadSceneController === controller) {
        activeLoadSceneController = null;
      }
    }
  },

  addElement: (element: Element) => {
    set((state) => {
      const newElements = [...state.elements, element];
      newElements.sort((a, b) => a.order_index - b.order_index);
      return { elements: newElements };
    });
  },

  updateElement: (id: number, updates: Partial<Element>) => {
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

  deleteElements: async (elementIds: number[]) => {
    if (elementIds.length === 0) return;

    const { scene, elements, selectedIds } = get();
    const idsSet = new Set(elementIds);
    const prevElements = elements;
    const prevSelectedIds = selectedIds;
    const prevScene = scene;

    const nextSelected = new Set(selectedIds);
    elementIds.forEach((id) => nextSelected.delete(id));

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
      elementIds.map((id) => elementsApi.delete(id))
    );

    const failedIds = results
      .map((result, index) => ({ result, id: elementIds[index] }))
      .filter(({ result }) => result.status === "rejected")
      .map(({ id }) => id);

    if (failedIds.length === 0) {
      toast.success(
        elementIds.length === 1 ? "Элемент удалён" : `Удалено: ${elementIds.length}`
      );
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

    if (failedIds.length === elementIds.length) {
      toast.error("Не удалось удалить элементы");
    } else {
      toast.error(
        `Удалено ${elementIds.length - failedIds.length} из ${elementIds.length}`
      );
    }
  },

  deleteElement: async (elementId: number) => {
    await get().deleteElements([elementId]);
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

  enqueueUploads: (sceneId: number, files: File[]) => {
    let currentOrderMax = get().elements.reduce(
      (max, el) => Math.max(max, el.order_index),
      -1
    );

    for (const file of files) {
      const tempId = -Date.now() - Math.floor(Math.random() * 10000);
      const isVideo = file.type.startsWith("video/");
      const objectUrl = URL.createObjectURL(file);
      currentOrderMax += 1;

      const optimistic: Element = {
        id: tempId,
        scene: sceneId,
        element_type: isVideo ? "VIDEO" : "IMAGE",
        order_index: currentOrderMax,
        file_url: objectUrl,
        thumbnail_url: isVideo ? "" : objectUrl,
        is_favorite: false,
        prompt_text: "",
        ai_model: null,
        generation_config: {},
        seed: null,
        status: "PROCESSING",
        error_message: "",
        source_type: "UPLOADED",
        parent_element: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      get().addElement(optimistic);
      uploadQueue.push({ sceneId, file, tempId, objectUrl });

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
    const { selectedIds, elements } = get();
    if (elements.length === 0) return;
    if (selectedIds.size === elements.length) {
      set({ selectedIds: new Set(), isMultiSelectMode: false });
    } else {
      const ids = new Set(elements.map((e) => e.id));
      set({ selectedIds: ids, isMultiSelectMode: true });
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
    let filtered: Element[];

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
}));
