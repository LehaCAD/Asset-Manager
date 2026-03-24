# UI Design System Revamp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all hardcoded colors from React components, centralize design tokens in `globals.css`, align ConfigPanel to pen mockup, redesign GroupCard.

**Architecture:** Extend CSS custom properties in `globals.css` with semantic status/overlay tokens. Map them into Tailwind via `@theme inline`. Then sweep every component replacing hardcoded Tailwind color classes with semantic equivalents. Redesign GroupCard structure and compact ConfigPanel.

**Tech Stack:** Next.js 14, Tailwind 4, CSS custom properties (oklch), shadcn/ui, Lucide icons

**Spec:** `docs/superpowers/specs/2026-03-24-ui-design-system-revamp-design.md`

---

## File Structure

**Modified files:**
- `frontend/app/globals.css` — add new design tokens (light + dark)
- `frontend/components/generation/ParametersForm.tsx` — compact aspect ratio, rename "Расширенные"
- `frontend/components/generation/ConfigPanel.tsx` — hardcoded status colors
- `frontend/components/generation/PromptBar.tsx` — hardcoded hex + white overlays
- `frontend/components/generation/PromptThumbnail.tsx` — overlay hardcode
- `frontend/components/element/GroupCard.tsx` — full restructure
- `frontend/components/element/ElementCard.tsx` — overlay/status hardcodes
- `frontend/components/lightbox/LightboxModal.tsx` — overlay/favorite hardcodes
- `frontend/components/lightbox/Filmstrip.tsx` — overlay/favorite hardcodes
- `frontend/components/layout/Navbar.tsx` — storage bar colors
- `frontend/components/ui/charge-icon.tsx` — amber hardcode
- `frontend/components/scene/SceneCard.tsx` — status colors
- `frontend/components/element/ElementSelectionCard.tsx` — overlay/favorite hardcodes

---

### Task 1: Design Tokens in globals.css

**Files:**
- Modify: `frontend/app/globals.css`

- [ ] **Step 1: Add new CSS variables to `:root` (light theme)**

In `globals.css`, inside the `:root { ... }` block, after the `/* Semantic tokens */` section (after line 100), add:

```css
  /* Status */
  --success:              oklch(0.55 0.18 145);
  --success-foreground:   oklch(0.985 0 0);
  --warning:              oklch(0.68 0.16 75);
  --warning-foreground:   oklch(0.985 0 0);
  --error:                var(--destructive);
  --error-foreground:     oklch(0.985 0 0);

  /* Special */
  --favorite:             oklch(0.795 0.184 86.047);
  --charge:               oklch(0.795 0.184 86.047);

  /* Overlay — dark tint (theme-invariant, always over media) */
  --overlay:              oklch(0 0 0 / 0.5);
  --overlay-medium:       oklch(0 0 0 / 0.6);
  --overlay-heavy:        oklch(0 0 0 / 0.75);
  --overlay-light:        oklch(0 0 0 / 0.12);
  --overlay-light-hover:  oklch(0 0 0 / 0.25);

  /* Overlay — white tint (buttons/controls over dark media) */
  --overlay-selection:    oklch(1 0 0 / 0.4);
  --overlay-selection-hover: oklch(1 0 0 / 0.6);
  --overlay-button:       oklch(1 0 0 / 0.15);
  --overlay-button-hover: oklch(1 0 0 / 0.25);
  --overlay-text:         oklch(1 0 0 / 0.85);
  --overlay-text-muted:   oklch(1 0 0 / 0.6);
```

- [ ] **Step 2: Add new CSS variables to `.dark` theme**

In `globals.css`, inside `.dark { ... }` block, after the `/* Semantic tokens */` section (after line 147), add:

```css
  /* Status */
  --success:              oklch(0.62 0.19 145);
  --success-foreground:   oklch(0.985 0 0);
  --warning:              oklch(0.75 0.17 75);
  --warning-foreground:   oklch(0.985 0 0);
  --error:                var(--destructive);
  --error-foreground:     oklch(0.985 0 0);

  /* Special */
  --favorite:             oklch(0.852 0.199 83.87);
  --charge:               oklch(0.852 0.199 83.87);

  /* Overlay — dark tint (same as light — always over media) */
  --overlay:              oklch(0 0 0 / 0.5);
  --overlay-medium:       oklch(0 0 0 / 0.6);
  --overlay-heavy:        oklch(0 0 0 / 0.75);
  --overlay-light:        oklch(0 0 0 / 0.12);
  --overlay-light-hover:  oklch(0 0 0 / 0.25);

  /* Overlay — white tint */
  --overlay-selection:    oklch(1 0 0 / 0.4);
  --overlay-selection-hover: oklch(1 0 0 / 0.6);
  --overlay-button:       oklch(1 0 0 / 0.15);
  --overlay-button-hover: oklch(1 0 0 / 0.25);
  --overlay-text:         oklch(1 0 0 / 0.85);
  --overlay-text-muted:   oklch(1 0 0 / 0.6);
```

- [ ] **Step 3: Add Tailwind mappings in `@theme inline`**

In `globals.css`, inside `@theme inline { ... }` block (lines 7-52), add after the existing semantic tokens:

```css
  /* Status tokens */
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
  --color-error: var(--error);
  --color-error-foreground: var(--error-foreground);

  /* Special tokens */
  --color-favorite: var(--favorite);
  --color-charge: var(--charge);

  /* Overlay tokens */
  --color-overlay: var(--overlay);
  --color-overlay-medium: var(--overlay-medium);
  --color-overlay-heavy: var(--overlay-heavy);
  --color-overlay-light: var(--overlay-light);
  --color-overlay-light-hover: var(--overlay-light-hover);
  --color-overlay-selection: var(--overlay-selection);
  --color-overlay-selection-hover: var(--overlay-selection-hover);
  --color-overlay-button: var(--overlay-button);
  --color-overlay-button-hover: var(--overlay-button-hover);
  --color-overlay-text: var(--overlay-text);
  --color-overlay-text-muted: var(--overlay-text-muted);
```

- [ ] **Step 4: Verify tokens load**

Run: `docker compose exec frontend npm run build 2>&1 | head -20`
Expected: build succeeds, no CSS errors

- [ ] **Step 5: Commit**

```bash
git add frontend/app/globals.css
git commit -m "feat: add semantic design tokens — status, overlay, favorite, charge"
```

---

### Task 2: ConfigPanel + ParametersForm — Compact Layout

**Files:**
- Modify: `frontend/components/generation/ParametersForm.tsx`
- Modify: `frontend/components/generation/ConfigPanel.tsx`

- [ ] **Step 1: Compact aspect ratio and toggle buttons in ParametersForm**

In `frontend/components/generation/ParametersForm.tsx`:

Line 170: change `h-[72px]` → `h-[52px]`
Line 171: change `h-9 px-3` → `h-8 px-3`
Line 189: change `h-[72px]` → `h-[52px]`
Line 190: change `h-9 px-3` → `h-8 px-3`

- [ ] **Step 2: Rename "Расширенные" to "Другое"**

In `frontend/components/generation/ParametersForm.tsx`:

Line 196: change `isAspectRatio ? "Расширенные" : "Другое"` → `"Другое"`

- [ ] **Step 3: Replace hardcoded status colors in ConfigPanel**

In `frontend/components/generation/ConfigPanel.tsx`:

Line 139: `text-amber-600` → `text-warning`
Line 146: `text-green-600` → `text-success`
Line 157: `text-amber-600` → `text-warning`

- [ ] **Step 4: Verify visually**

Open http://localhost:3000/projects/1 — check ConfigPanel:
- Aspect ratio buttons should be shorter (52px)
- Overflow button says "Другое"
- Cost shows green/amber colors from tokens

- [ ] **Step 5: Commit**

```bash
git add frontend/components/generation/ParametersForm.tsx frontend/components/generation/ConfigPanel.tsx
git commit -m "feat: compact ConfigPanel — smaller aspect ratio grid, rename to Другое, token colors"
```

---

### Task 3: PromptBar — Remove Hardcoded Hex

**Files:**
- Modify: `frontend/components/generation/PromptBar.tsx`

- [ ] **Step 1: Replace all #6C5CE7 and white overlay references**

In `frontend/components/generation/PromptBar.tsx`:

Line 286: `border-white/[0.15]` → `border-border/50` (UI border, not media overlay)
Line 286: `bg-white/[0.04]` → `bg-transparent`
Line 286: `hover:bg-white/[0.08]` → `hover:bg-muted/20`
Line 286: `hover:border-[#6C5CE7]/40` → `hover:border-primary/40`
Line 287: `focus:ring-[#6C5CE7]/40` → `focus:ring-primary/40`
Line 291: `text-white/40` → `text-muted-foreground`

Line 300: `border-white/[0.15]` → `border-border/50`
Line 300: `bg-white/[0.04]` → `bg-transparent`
Line 300: `hover:bg-white/[0.08]` → `hover:bg-muted/20`
Line 300: `hover:border-[#6C5CE7]/40` → `hover:border-primary/40`
Line 301: `focus:ring-[#6C5CE7]/40` → `focus:ring-primary/40`

- [ ] **Step 2: Verify PromptBar visually**

Open http://localhost:3000/projects/1 — PromptBar should look the same, borders/focus rings use CSS variable purple.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/generation/PromptBar.tsx
git commit -m "fix: replace hardcoded #6C5CE7 and white overlays in PromptBar with tokens"
```

---

### Task 4: PromptThumbnail — Overlay Token

**Files:**
- Modify: `frontend/components/generation/PromptThumbnail.tsx`

- [ ] **Step 1: Replace overlay hardcodes**

Line 46: `bg-black/0` → `bg-transparent`
Line 46: `group-hover:bg-black/30` → `group-hover:bg-overlay-light-hover`

- [ ] **Step 2: Commit**

```bash
git add frontend/components/generation/PromptThumbnail.tsx
git commit -m "fix: replace bg-black/30 with overlay token in PromptThumbnail"
```

---

### Task 5: GroupCard — Restructure to Match ProjectCard

**Files:**
- Modify: `frontend/components/element/GroupCard.tsx`

**Layout note:** This changes the card from fixed aspect ratio (outer div) to variable height (preview area with aspect ratio + info section below). The parent `ElementGrid` uses CSS grid with auto-rows, so this should work. Verify after implementation that grid alignment is correct.

- [ ] **Step 1: Replace the gradient overlay footer with info section**

Remove the gradient overlay div (line 100-123) — the `absolute bottom-0` div with `from-black/70 via-black/40`.

Replace the card structure with ProjectCard-style layout. The new structure:

```tsx
return (
    <div
      className={cn(
        'group relative rounded-md overflow-hidden cursor-pointer',
        'border border-border hover:border-primary/50',
        'bg-card',
        'transition-all duration-150',
        'hover:shadow-md hover:shadow-primary/5',
        isSelected && 'ring-2 ring-primary border-primary',
        className,
      )}
      style={style}
      onClick={handleCardClick}
    >
      {/* Preview area */}
      <div className={cn('relative overflow-hidden bg-muted', aspectClass)}>
        {group.preview_thumbnails && group.preview_thumbnails.length > 0 ? (
          <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-0.5">
            {[0, 1, 2, 3].map((i) => {
              const url = group.preview_thumbnails?.[i];
              return (
                <div key={i} className="relative overflow-hidden bg-muted">
                  {url ? (
                    <img src={url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0" />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10">
            <Folder className="w-10 h-10 text-primary/30 group-hover:hidden" strokeWidth={1.5} />
            <FolderOpen className="w-10 h-10 text-primary/40 hidden group-hover:block" strokeWidth={1.5} />
          </div>
        )}

        {/* Selection checkbox — overlay on preview */}
        <button
          type="button"
          role="checkbox"
          aria-checked={isSelected}
          aria-label={isSelected ? 'Снять выделение' : 'Выбрать'}
          onPointerDown={handleControlPointerDown}
          onClick={handleSelectClick}
          className={cn(
            'absolute top-2 left-2 z-30 rounded-full flex items-center justify-center transition-all duration-150',
            iconSizes.padding,
            isMultiSelectMode || isSelected
              ? 'opacity-100 pointer-events-auto'
              : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto',
            isSelected
              ? 'bg-primary text-primary-foreground'
              : 'bg-overlay text-overlay-text hover:bg-overlay-heavy',
            isMultiSelectMode && !isSelected && 'bg-overlay-selection hover:bg-overlay-selection-hover',
          )}
        >
          {isSelected ? (
            <Check className={iconSizes.md} />
          ) : (
            <Check className={cn(iconSizes.md, 'opacity-0')} />
          )}
        </button>

        {/* Delete button — overlay on preview */}
        {onDelete && (
          <button
            type="button"
            aria-label="Удалить группу"
            title="Удалить группу"
            onPointerDown={handleControlPointerDown}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(group.id);
            }}
            className={cn(
              'absolute top-2 right-2 z-30 rounded-full bg-overlay text-overlay-text hover:bg-destructive transition-colors',
              'opacity-0 group-hover:opacity-100',
              iconSizes.padding,
            )}
          >
            <Trash2 className={iconSizes.sm} />
          </button>
        )}
      </div>

      {/* Info section (like ProjectCard) */}
      <div className="p-2.5 space-y-1">
        <div className="flex items-center gap-1.5">
          <Folder className="h-3.5 w-3.5 text-primary/60 shrink-0" />
          <span className={cn('font-medium line-clamp-1 group-hover:text-primary transition-colors', textSizes.title)}>
            {group.name}
          </span>
        </div>
        <div className={cn('flex items-center gap-2 text-muted-foreground', textSizes.meta)}>
          <span className="flex items-center gap-0.5">
            <Layers className="h-3 w-3" />
            {elementCount}
          </span>
          {group.total_spent && parseFloat(group.total_spent) > 0 && (
            <span className="flex items-center gap-0.5">
              <ChargeIcon size="sm" />
              {formatCurrency(group.total_spent)}
            </span>
          )}
          {(group.storage_bytes ?? 0) > 0 && (
            <span className="flex items-center gap-0.5">
              <HardDrive className="h-3 w-3" />
              {formatStorage(group.storage_bytes!)}
            </span>
          )}
        </div>
      </div>
    </div>
);
```

- [ ] **Step 2: Verify GroupCard visually**

Open http://localhost:3000/projects/1 — groups should now have info section below the preview (like projects), with folder icon next to the name.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/element/GroupCard.tsx
git commit -m "feat: redesign GroupCard — ProjectCard structure with Folder icon"
```

---

### Task 6: ElementCard — Replace All Hardcoded Colors

**Files:**
- Modify: `frontend/components/element/ElementCard.tsx`

- [ ] **Step 1: Replace overlay background colors**

Apply these replacements throughout the file:

| Line | Old | New |
|------|-----|-----|
| 210 | `bg-black/50 text-white hover:bg-black/70` | `bg-overlay text-overlay-text hover:bg-overlay-heavy` |
| 211 | `bg-white/40 hover:bg-white/60` | `bg-overlay-selection hover:bg-overlay-selection-hover` |
| 230 | `bg-black/50 text-white` | `bg-overlay text-overlay-text` |
| 251 | `text-yellow-400` | `text-favorite` |
| 270 | `bg-black/50` | `bg-overlay` |
| 285 | `bg-white/20 hover:bg-white/40` | `bg-overlay-button hover:bg-overlay-button-hover` |
| 303 | `bg-white/20 hover:bg-white/35` | `bg-overlay-button hover:bg-overlay-button-hover` |
| 316 | `bg-white/10 text-white/40` | `bg-overlay-light text-overlay-text-muted` |
| 330 | `bg-white/20 hover:bg-red-500/50` | `bg-overlay-button hover:bg-error/50` |
| 343 | `bg-black/80` | `bg-overlay-heavy` |

- [ ] **Step 2: Replace error/status colors**

| Line | Old | New |
|------|-----|-----|
| 349 | `bg-red-500` | `bg-error` |
| 350 | `text-red-400` | `text-error` |
| 398 | `bg-red-500/10` | `bg-error/10` |
| 399 | `text-red-500/25` | `text-error/25` |
| 403 | `bg-red-500/20` | `bg-error/20` |
| 406 | `bg-red-500` | `bg-error` |
| 407 | `text-red-400` | `text-error` |

- [ ] **Step 3: Replace overlay text colors**

Search for all remaining `text-white` (bare, not `text-white/XX`) in the file and replace with `text-overlay-text` when it's on an overlay over media.

Replace remaining `text-white/XX` patterns with `text-overlay-text-muted`.

Note: keep `bg-white text-black` on the retry CTA button as-is (it's a high-contrast action button).

- [ ] **Step 4: Verify ElementCard visually**

Open http://localhost:3000/projects/1 — element cards should look identical, all colors now from tokens.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/element/ElementCard.tsx
git commit -m "fix: replace 20+ hardcoded colors in ElementCard with semantic tokens"
```

---

### Task 7: LightboxModal + Filmstrip — Overlay/Favorite Tokens

**Files:**
- Modify: `frontend/components/lightbox/LightboxModal.tsx`
- Modify: `frontend/components/lightbox/Filmstrip.tsx`

- [ ] **Step 1: Replace hardcodes in LightboxModal**

| Line | Old | New |
|------|-----|-----|
| 338 | `bg-black/60 text-white` | `bg-overlay-medium text-overlay-text` |
| 354 | `bg-black/60 hover:bg-black/80` | `bg-overlay-medium hover:bg-overlay-heavy` |
| 360 | `text-yellow-400 fill-current` | `text-favorite fill-current` |
| 361 | `text-white/70` | `text-overlay-text-muted` |
| 370 | `bg-black/40` | `bg-overlay` |

- [ ] **Step 2: Replace hardcodes in Filmstrip**

| Line | Old | New |
|------|-----|-----|
| 72 | `bg-black/60` | `bg-overlay-medium` |
| 74 | `text-white` (type icon) | `text-overlay-text` |
| 76 | `text-white` (type icon) | `text-overlay-text` |
| 83 | `text-yellow-400 fill-current` | `text-favorite fill-current` |
| 90 | `bg-black/0 group-hover:bg-black/20` | `bg-transparent group-hover:bg-overlay-light-hover` |

- [ ] **Step 3: Verify lightbox visually**

Open a project, click an element to open lightbox. Check:
- Favorite star color
- Navigation button overlays
- Filmstrip overlays

- [ ] **Step 4: Commit**

```bash
git add frontend/components/lightbox/LightboxModal.tsx frontend/components/lightbox/Filmstrip.tsx
git commit -m "fix: replace hardcoded colors in LightboxModal and Filmstrip with tokens"
```

---

### Task 8: Navbar — Storage Bar Colors

**Files:**
- Modify: `frontend/components/layout/Navbar.tsx`

- [ ] **Step 1: Replace storage indicator colors**

| Line | Old | New |
|------|-----|-----|
| 116 | `bg-zinc-200 dark:bg-zinc-700` | `bg-muted` |
| 120 | `bg-red-500` | `bg-error` |
| 122 | `bg-amber-500` | `bg-warning` |
| 123 | `bg-emerald-500` | `bg-success` |

- [ ] **Step 2: Commit**

```bash
git add frontend/components/layout/Navbar.tsx
git commit -m "fix: replace hardcoded storage bar colors in Navbar with semantic tokens"
```

---

### Task 9: ChargeIcon + SceneCard — Remaining Hardcodes

**Files:**
- Modify: `frontend/components/ui/charge-icon.tsx`
- Modify: `frontend/components/scene/SceneCard.tsx`

- [ ] **Step 1: Replace ChargeIcon amber**

In `frontend/components/ui/charge-icon.tsx`:
Line 22: `text-amber-400 fill-amber-400` → `text-charge fill-charge`

- [ ] **Step 2: Replace SceneCard status colors**

In `frontend/components/scene/SceneCard.tsx`:
Line 55: `text-yellow-600 dark:text-yellow-400` → `text-warning`
Line 56: `text-green-600 dark:text-green-400` → `text-success`

And their corresponding background classes:
`yellow-500/15` → `warning/15`
`green-500/15` → `success/15`

- [ ] **Step 3: Commit**

```bash
git add frontend/components/ui/charge-icon.tsx frontend/components/scene/SceneCard.tsx
git commit -m "fix: replace hardcoded colors in ChargeIcon and SceneCard with tokens"
```

---

### Task 10: ElementSelectionCard — Overlay/Favorite Tokens

**Files:**
- Modify: `frontend/components/element/ElementSelectionCard.tsx`

- [ ] **Step 1: Replace hardcoded colors**

| Line | Old | New |
|------|-----|-----|
| 84 | `bg-black/10` | `bg-overlay-light` |
| 94 | `bg-black/45` | `bg-overlay` |
| 94 | `text-white` | `text-overlay-text` |
| 107 | `text-yellow-400` | `text-favorite` |
| 108 | `text-white/70` | `text-overlay-text-muted` |

- [ ] **Step 2: Commit**

```bash
git add frontend/components/element/ElementSelectionCard.tsx
git commit -m "fix: replace hardcoded colors in ElementSelectionCard with tokens"
```

---

### Task 11: Visual Verification

- [ ] **Step 1: Full page screenshots via Playwright**

Navigate to each key page and take screenshots:
1. http://localhost:3000/projects — ProjectCard grid
2. http://localhost:3000/projects/1 — Workspace (ConfigPanel + PromptBar + ElementGrid with GroupCards)
3. Open lightbox on an element — LightboxModal + Filmstrip

- [ ] **Step 2: Compare with pen mockups**

Check ConfigPanel matches pen node `vhJaR` layout:
- Compact aspect ratio grid
- "Другое" button
- Semantic status colors

Check GroupCard has ProjectCard structure with Folder icon.

- [ ] **Step 3: Verify no remaining hardcoded colors**

Run grep for remaining hardcodes:
```bash
docker compose exec frontend grep -rn "yellow-400\|red-500\|green-600\|amber-600\|#6C5CE7\|black/50\|black/70\|black/80\|white/\[0\." components/ --include="*.tsx" --include="*.ts"
```

Expected: no matches in modified components (shadcn/ui primitives excluded).

- [ ] **Step 4: Build check**

```bash
docker compose exec frontend npm run build
```

Expected: clean build, no errors.
