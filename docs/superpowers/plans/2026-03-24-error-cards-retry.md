# Error Cards + Retry UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify error paths so failed generation cards persist in the grid with retry functionality, instead of silently disappearing.

**Architecture:** Three changes: (1) generation store keeps failed optimistic cards instead of discarding them, (2) ElementCard gets a new error-specific UI with info bar + retry button, (3) shared `retryFromElement()` action replaces duplicated retry logic.

**Tech Stack:** React 19, Zustand 5, Tailwind 4, lucide-react

**Spec:** `docs/superpowers/specs/2026-03-24-error-cards-retry-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/lib/store/generation.ts` | Modify | Add `retryFromElement()` action; change catch-block to keep failed cards |
| `frontend/lib/store/scene-workspace.ts` | Modify | Guard `deleteElements` for negative IDs |
| `frontend/components/element/ElementCard.tsx` | Modify | Error card UI (default + hover), `onRetry` prop |
| `frontend/components/element/ElementGrid.tsx` | Modify | Pass `onRetry` callback to ElementCard |
| `frontend/components/lightbox/DetailPanel.tsx` | Modify | Use shared `retryFromElement()` |

---

### Task 1: Add `retryFromElement()` to generation store

**Files:**
- Modify: `frontend/lib/store/generation.ts`

- [ ] **Step 1: Add the `retryFromElement` action to the store interface**

In the store type (around line 58), add:

```typescript
retryFromElement: (element: Element) => void;
```

Add the import at the top:

```typescript
import type { Element } from "@/lib/types";
```

- [ ] **Step 2: Implement `retryFromElement`**

Add after `clearSubmitResult` implementation (around line 210). This is the shared retry logic used by both ElementCard and DetailPanel:

```typescript
retryFromElement: (element) => {
  if (get().isGenerating) {
    toast.error("Генерация уже выполняется");
    return;
  }

  const model = get().availableModels.find((m) => m.id === element.ai_model);
  if (!model) {
    toast.error("Модель недоступна");
    return;
  }

  get().selectModel(model);
  get().setPrompt(element.prompt_text ?? "");

  // Restore parameters, skip internal keys and URL values
  if (element.generation_config) {
    for (const [key, value] of Object.entries(element.generation_config)) {
      if (key.startsWith("_")) continue;
      if (typeof value === "string" && value.startsWith("http")) continue;
      if (Array.isArray(value) && value.every((v) => typeof v === "string" && v.startsWith("http"))) continue;
      get().setParameter(key, value);
    }
  }

  // Close lightbox if open
  const { closeLightbox, lightboxOpen } = useSceneWorkspaceStore.getState();
  if (lightboxOpen) closeLightbox();

  toast.success("Параметры загружены");
},
```

Add `useSceneWorkspaceStore` import at the top:

```typescript
import { useSceneWorkspaceStore } from "@/lib/store/scene-workspace";
```

- [ ] **Step 3: Verify no circular import**

`generation.ts` already imports from `scene-workspace.ts` (check line 377 — `useSceneWorkspaceStore.getState().discardOptimisticGeneration`). So the import is safe.

- [ ] **Step 4: Commit**

```
git add frontend/lib/store/generation.ts
git commit -m "feat: add retryFromElement action to generation store"
```

---

### Task 2: Keep failed optimistic cards on HTTP error

**Files:**
- Modify: `frontend/lib/store/generation.ts` (lines 375-391)

- [ ] **Step 1: Change the catch block to update instead of discard**

Replace the line:
```typescript
useSceneWorkspaceStore.getState().discardOptimisticGeneration(optimisticId);
```

With:
```typescript
const errorMsg = error instanceof Error ? error.message : "Не удалось запустить генерацию";
useSceneWorkspaceStore.getState().updateElement(optimisticId, {
  status: "FAILED" as const,
  error_message: errorMsg,
  ai_model_name: get().selectedModel?.name ?? "",
});
```

This keeps the card in the grid with FAILED status instead of removing it.

- [ ] **Step 2: Verify `updateElement` is exported from scene-workspace store**

Check that `updateElement` exists in the store (it does — used by WebSocket handler). No changes needed.

- [ ] **Step 3: Commit**

```
git add frontend/lib/store/generation.ts
git commit -m "feat: keep optimistic cards on HTTP error instead of discarding"
```

---

### Task 3: Guard `deleteElements` for negative IDs

**Files:**
- Modify: `frontend/lib/store/scene-workspace.ts` (lines 464-500)

- [ ] **Step 1: Separate local-only and real element IDs**

At the top of `deleteElements` (after `if (elementIds.length === 0) return;`), add:

```typescript
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
// Continue with remoteIds only
```

Then change `elementIds` references below to `remoteIds` — specifically lines that call `elementsApi.delete(id)` (line 488):

```typescript
const results = await Promise.allSettled(
  remoteIds.map((id) => elementsApi.delete(id))
);
```

And the `failedIds` mapping + success toast count should use `remoteIds`.

- [ ] **Step 2: Commit**

```
git add frontend/lib/store/scene-workspace.ts
git commit -m "fix: guard deleteElements against negative optimistic IDs"
```

---

### Task 4: Error card UI — default state + hover

**Files:**
- Modify: `frontend/components/element/ElementCard.tsx`

- [ ] **Step 1: Add `onRetry` prop and RotateCcw import**

Add to `ElementCardProps` interface:

```typescript
onRetry?: (id: number) => void;
```

Add to destructured props:

```typescript
onRetry,
```

Add `RotateCcw` to lucide imports:

```typescript
import { ..., RotateCcw } from "lucide-react";
```

- [ ] **Step 2: Add retry click handler**

After `handleDownloadClick` (around line 108):

```typescript
const handleRetryClick = (e: React.MouseEvent) => {
  e.stopPropagation();
  onRetry?.(element.id);
};
```

- [ ] **Step 3: Hide selection checkbox for failed elements**

In the selection button visibility logic (around line 170), add `isFailed` guard:

Change:
```typescript
isMultiSelectMode || isSelected
  ? "opacity-100 pointer-events-auto"
  : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto",
```

To:
```typescript
isFailed
  ? "opacity-0 pointer-events-none"
  : isMultiSelectMode || isSelected
    ? "opacity-100 pointer-events-auto"
    : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto",
```

- [ ] **Step 4: Replace normal hover overlay with error-specific hover for failed cards**

Wrap the existing hover overlay (lines 231-301) with `{!isFailed && (`:

```typescript
{/* Hover overlay — only for non-failed cards */}
{!isFailed && (
  <div className={cn("absolute inset-0 z-20 bg-black/50", ...)}>
    {/* ... existing hover content ... */}
  </div>
)}

{/* Error hover overlay — only for failed cards */}
{isFailed && (
  <div
    className={cn(
      "absolute inset-0 z-20 bg-black/80",
      "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
      "flex flex-col items-center justify-center gap-3 p-3"
    )}
  >
    <div className="flex items-center gap-1.5">
      <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
      <span className="text-xs font-medium text-red-400">Ошибка генерации</span>
    </div>
    {element.error_message && (
      <span className="text-[10px] text-white/50 text-center line-clamp-2 max-w-[90%]">
        {element.error_message}
      </span>
    )}
    <button
      type="button"
      onPointerDown={handleControlPointerDown}
      onClick={handleRetryClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md bg-white text-black px-5 py-2 text-xs font-semibold",
        "hover:bg-white/90 transition-colors"
      )}
    >
      <RotateCcw className="w-3.5 h-3.5" />
      Повторить
    </button>
    <button
      type="button"
      onPointerDown={handleControlPointerDown}
      onClick={handleDeleteClick}
      className="flex items-center gap-1.5 rounded-md bg-white/15 text-white/60 px-4 py-1.5 text-[11px] hover:bg-white/25 transition-colors"
    >
      <Trash2 className="w-3 h-3" />
      Удалить
    </button>
  </div>
)}
```

- [ ] **Step 5: Replace the failed status overlay with info bar design**

Replace the existing failed overlay (the `{isFailed && (...)}` block in status overlays section, currently around line 315):

```typescript
{isFailed && (
  <div className="absolute inset-0 z-30 flex flex-col pointer-events-none">
    {/* Top area — muted error icon */}
    <div className="flex-1 bg-red-500/10 flex flex-col items-center justify-center gap-1.5">
      <AlertCircle className={cn(iconSizes.lg, "text-red-500/25")} />
      <span className="text-[10px] text-white/20">Генерация не удалась</span>
    </div>
    {/* Bottom info bar */}
    <div className="bg-red-500/20 px-2.5 py-2 flex items-center justify-between gap-2 pointer-events-auto">
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
          <span className="text-[10px] font-semibold text-red-400">Ошибка</span>
          {element.ai_model_name && (
            <>
              <span className="text-[10px] text-white/30">·</span>
              <span className="text-[10px] text-white/40 truncate">{element.ai_model_name}</span>
            </>
          )}
        </div>
        {element.error_message && (
          <span className="text-[9px] text-white/40 truncate">{element.error_message}</span>
        )}
      </div>
      <button
        type="button"
        onPointerDown={handleControlPointerDown}
        onClick={handleRetryClick}
        className="flex items-center gap-1 rounded px-2 py-1 bg-white/15 text-[10px] text-white/70 font-medium hover:bg-white/25 transition-colors shrink-0"
      >
        <RotateCcw className="w-2.5 h-2.5" />
        Повторить
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 6: Commit**

```
git add frontend/components/element/ElementCard.tsx
git commit -m "feat: error card UI with info bar and retry buttons"
```

---

### Task 5: Wire `onRetry` through ElementGrid

**Files:**
- Modify: `frontend/components/element/ElementGrid.tsx`

- [ ] **Step 1: Add retry to cardCallbacks**

Import `useGenerationStore`:

```typescript
import { useGenerationStore } from "@/lib/store/generation";
```

In the `cardCallbacks` useMemo (around line 52), add:

```typescript
const retryFromElement = useGenerationStore((s) => s.retryFromElement);
```

And add to the callbacks object:

```typescript
onRetry: (id: number) => {
  const element = getFilteredElements().find((e) => e.id === id);
  if (element) retryFromElement(element);
},
```

Update the useMemo dependency array to include `retryFromElement` and `getFilteredElements`.

- [ ] **Step 2: Commit**

```
git add frontend/components/element/ElementGrid.tsx
git commit -m "feat: wire onRetry callback through ElementGrid to cards"
```

---

### Task 6: Use shared retry in DetailPanel

**Files:**
- Modify: `frontend/components/lightbox/DetailPanel.tsx`

- [ ] **Step 1: Replace inline handleRepeat with store action**

Replace the `handleRepeat` function (currently around line 129-151) with:

```typescript
const handleRepeat = () => {
  retryFromElement(element);
};
```

Where `retryFromElement` comes from the existing `useGenerationStore` destructure (line 73). Add it:

```typescript
const { availableModels, selectModel, setPrompt, setParameter, retryFromElement } = useGenerationStore();
```

Remove the now-unused imports/variables: `selectModel`, `setPrompt`, `setParameter` (if only used by old handleRepeat). Keep `availableModels` if used elsewhere. Actually `retryFromElement` handles everything internally, so the destructure simplifies to:

```typescript
const { retryFromElement } = useGenerationStore();
```

Remove the `onClose` prop usage from handleRepeat (the store action calls `closeLightbox` directly). The `onClose` prop can stay for other future uses.

- [ ] **Step 2: Commit**

```
git add frontend/components/lightbox/DetailPanel.tsx
git commit -m "refactor: use shared retryFromElement in DetailPanel"
```

---

### Task 7: TypeScript check + visual verification

- [ ] **Step 1: Run TypeScript check**

```bash
docker compose exec -T frontend npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Fix any type errors found**

- [ ] **Step 3: Final commit if any fixes**

```
git commit -am "fix: type errors from error cards implementation"
```
