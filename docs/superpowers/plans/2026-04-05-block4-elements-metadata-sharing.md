# Block 4: Elements, Metadata, Statuses & Sharing 2.0 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add metadata footer with filename/status to ElementCard, approval status workflow, and reviewer actions on sharing page.

**Architecture:** Backend-first (models + migrations + serializers), then frontend types, then UI components. Each task produces a working commit. The ElementCard is rebuilt with new badge layout and metadata footer. Sharing page gets reviewer action buttons that create system comments.

**Tech Stack:** Django 5 + DRF, Next.js 14, React 19, Zustand 5, Tailwind 4, shadcn/ui, Lucide icons

**Spec:** `docs/superpowers/specs/2026-04-05-elements-metadata-sharing-design.md`
**Mockup:** `pen/pencil-new.pen` → node `GVOQ7`

---

### Task 1: Backend — Remove IMG2VID, add new fields, migrate

**Files:**
- Modify: `backend/apps/elements/models.py:32-40` (SOURCE constants + choices)
- Modify: `backend/apps/elements/orchestration.py:50` (IMG2VID → GENERATED)
- Create: `backend/apps/elements/migrations/0XXX_remove_img2vid_add_approval.py`

- [ ] **Step 1: Edit models.py — remove IMG2VID, add new fields**

In `backend/apps/elements/models.py`:

Remove lines 34 and the IMG2VID entry from SOURCE_TYPE_CHOICES (line 38).

After `upload_keys` field (~line 141), add:

```python
APPROVAL_IN_PROGRESS = 'IN_PROGRESS'
APPROVAL_NEEDS_REVIEW = 'NEEDS_REVIEW'
APPROVAL_APPROVED = 'APPROVED'
APPROVAL_CHANGES_REQUESTED = 'CHANGES_REQUESTED'
APPROVAL_REJECTED = 'REJECTED'

APPROVAL_STATUS_CHOICES = [
    (APPROVAL_IN_PROGRESS, 'В работе'),
    (APPROVAL_NEEDS_REVIEW, 'На согласовании'),
    (APPROVAL_APPROVED, 'Одобрено'),
    (APPROVAL_CHANGES_REQUESTED, 'На доработку'),
    (APPROVAL_REJECTED, 'Отклонено'),
]

approval_status = models.CharField(
    max_length=20,
    choices=APPROVAL_STATUS_CHOICES,
    null=True, blank=True, default=None,
    verbose_name='Статус согласования'
)

original_filename = models.CharField(
    max_length=255, blank=True, default='',
    verbose_name='Оригинальное имя файла'
)
```

- [ ] **Step 2: Fix orchestration.py**

In `backend/apps/elements/orchestration.py`, line 50:
Change `source_type = Element.SOURCE_IMG2VID` → `source_type = Element.SOURCE_GENERATED`

- [ ] **Step 3: Generate and edit migration**

```bash
docker compose exec backend python manage.py makemigrations elements --name remove_img2vid_add_approval_status
```

Edit the generated migration to add a `RunPython` operation that converts existing IMG2VID → GENERATED:

```python
from django.db import migrations

def convert_img2vid(apps, schema_editor):
    Element = apps.get_model('elements', 'Element')
    Element.objects.filter(source_type='IMG2VID').update(source_type='GENERATED')

class Migration(migrations.Migration):
    # ... auto-generated operations + add:
    operations = [
        migrations.RunPython(convert_img2vid, migrations.RunPython.noop),
        # ... then the RemoveField/AddField/AlterField operations
    ]
```

- [ ] **Step 4: Run migration**

```bash
docker compose exec backend python manage.py migrate elements
```

- [ ] **Step 5: Verify**

```bash
docker compose exec backend python manage.py shell -c "from apps.elements.models import Element; print(Element.SOURCE_TYPE_CHOICES); print(Element.objects.filter(source_type='IMG2VID').count())"
```

Expected: no IMG2VID choice, 0 IMG2VID records.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/elements/
git commit -m "feat(elements): remove IMG2VID source type, add approval_status and original_filename fields"
```

---

### Task 2: Backend — Update serializers, add approval_status to writable fields

**Files:**
- Modify: `backend/apps/elements/serializers.py:19-48` (fields + read_only_fields)

- [ ] **Step 1: Add new fields to ElementSerializer**

In `backend/apps/elements/serializers.py`, add to `fields` list (after `'generation_cost'`):
```python
'approval_status', 'original_filename',
```

`read_only_fields` stays unchanged — `approval_status` and `original_filename` should be writable via PATCH.

- [ ] **Step 2: Verify via shell**

```bash
docker compose exec backend python manage.py shell -c "
from apps.elements.serializers import ElementSerializer
s = ElementSerializer()
print('approval_status' in [f for f in s.fields])
print('original_filename' in [f for f in s.fields])
"
```

Expected: `True`, `True`

- [ ] **Step 3: Commit**

```bash
git add backend/apps/elements/serializers.py
git commit -m "feat(elements): add approval_status and original_filename to serializer"
```

---

### Task 3: Backend — Add is_system to Comment model, create review endpoint

**Files:**
- Modify: `backend/apps/sharing/models.py:73-121` (add is_system field)
- Modify: `backend/apps/sharing/views.py` (add review endpoint)
- Modify: `backend/apps/sharing/serializers.py` (add is_system to serializer, expand PublicElementSerializer)
- Modify: `backend/apps/sharing/urls.py` (add review URL)
- Create: `backend/apps/sharing/migrations/0XXX_add_is_system_to_comment.py`

- [ ] **Step 1: Add is_system field to Comment**

In `backend/apps/sharing/models.py`, after `is_read` field (line 95):
```python
is_system = models.BooleanField(default=False, verbose_name='Системный комментарий')
```

- [ ] **Step 2: Add is_system to CommentSerializer**

In `backend/apps/sharing/serializers.py`, find `CommentSerializer` fields and add `'is_system'`.

- [ ] **Step 3: Expand PublicElementSerializer**

In `backend/apps/sharing/serializers.py`, find `PublicElementSerializer` and add to fields:
```python
'source_type', 'original_filename',
```

- [ ] **Step 4: Expand el_data dict in public_share_view**

In `backend/apps/sharing/views.py`, find the `el_data` dict construction (~line 94) and add:
```python
'source_type': el.source_type,
'original_filename': el.original_filename,
```

- [ ] **Step 5: Create review endpoint**

In `backend/apps/sharing/views.py`, add:

```python
@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([PublicCommentThrottle])
def public_review_action(request, token):
    """Reviewer submits approval action — creates system comment."""
    try:
        link = SharedLink.objects.select_related('project').get(token=token)
    except SharedLink.DoesNotExist:
        return Response({'error': 'Ссылка не найдена'}, status=404)

    if link.is_expired():
        return Response({'error': 'Ссылка истекла'}, status=410)

    element_id = request.data.get('element_id')
    action = request.data.get('action')
    session_id = request.data.get('session_id', '')
    author_name = request.data.get('author_name', '')

    if not element_id or not action:
        return Response({'error': 'element_id and action required'}, status=400)

    if action not in ('approved', 'changes_requested', 'rejected'):
        return Response({'error': 'Invalid action'}, status=400)

    # Verify element belongs to this shared link
    element_ids = link.elements.values_list('id', flat=True)
    if element_ids.exists() and int(element_id) not in list(element_ids):
        return Response({'error': 'Element not in shared link'}, status=400)

    action_map = {
        'approved': '✓ Согласовано',
        'changes_requested': '↻ На доработку',
        'rejected': '✕ Отклонено',
    }

    text = f"{action_map[action]} — {author_name}" if author_name else action_map[action]

    from .models import Comment
    comment = Comment.objects.create(
        element_id=element_id,
        author_name=author_name,
        session_id=session_id,
        text=text,
        is_system=True,
    )

    return Response({'id': comment.id, 'text': comment.text}, status=201)
```

- [ ] **Step 6: Add URL**

In `backend/apps/sharing/urls.py`, add:
```python
path('public/<uuid:token>/review/', views.public_review_action, name='public-review'),
```

- [ ] **Step 7: Generate and run migration**

```bash
docker compose exec backend python manage.py makemigrations sharing --name add_is_system_to_comment
docker compose exec backend python manage.py migrate sharing
```

- [ ] **Step 8: Commit**

```bash
git add backend/apps/sharing/
git commit -m "feat(sharing): add is_system comment field, review endpoint, expand PublicElement"
```

---

### Task 4: Frontend — Update TypeScript types

**Files:**
- Modify: `frontend/lib/types/index.ts:119-202`

- [ ] **Step 1: Update ElementSource**

Line 121: Change `"GENERATED" | "UPLOADED" | "IMG2VID"` → `"GENERATED" | "UPLOADED"`

- [ ] **Step 2: Add ApprovalStatus type**

After line 123, add:
```typescript
export type ApprovalStatus = 'IN_PROGRESS' | 'NEEDS_REVIEW' | 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED';
```

- [ ] **Step 3: Add fields to Element interface**

After `updated_at: string;` (line 148), add:
```typescript
approval_status: ApprovalStatus | null;
original_filename: string;
```

- [ ] **Step 4: Update UpdateElementPayload**

In `UpdateElementPayload` interface (line 198), add:
```typescript
approval_status?: ApprovalStatus | null;
original_filename?: string;
scene?: number | null;
```

- [ ] **Step 5: Add showMetadata to DisplayPreferences**

Find `DisplayPreferences` type and add:
```typescript
showMetadata: boolean;
```

- [ ] **Step 6: Update PublicElement**

Find `PublicElement` interface and add:
```typescript
source_type?: ElementSource;
original_filename?: string;
is_system?: boolean;
```

- [ ] **Step 7: Remove IMG2VID from other frontend files**

In `frontend/components/lightbox/DetailPanel.tsx`: remove `IMG2VID` from source_type mapping.
In `frontend/app/(cabinet)/cabinet/history/page.tsx`: remove `IMG2VID` from `IS_GENERATED` set.

- [ ] **Step 8: Commit**

```bash
git add frontend/lib/types/index.ts frontend/components/lightbox/DetailPanel.tsx frontend/app/
git commit -m "feat(types): add ApprovalStatus, update Element fields, remove IMG2VID"
```

---

### Task 5: Frontend — Display store and constants

**Files:**
- Modify: `frontend/lib/utils/constants.ts:61-65` (DEFAULT_DISPLAY_PREFERENCES)
- Modify: `frontend/lib/store/project-display.ts:11-42` (readPersistedPreferences)

- [ ] **Step 1: Update DEFAULT_DISPLAY_PREFERENCES**

In `frontend/lib/utils/constants.ts`, add `showMetadata: true` to `DEFAULT_DISPLAY_PREFERENCES`:
```typescript
export const DEFAULT_DISPLAY_PREFERENCES = {
  size: "medium",
  aspectRatio: "landscape",
  fitMode: "fill",
  showMetadata: true,
} as const;
```

- [ ] **Step 2: Update readPersistedPreferences**

In `frontend/lib/store/project-display.ts`, after the existing validation block (after the `if` that returns `null`), before `return prefs as DisplayPreferences`, add:
```typescript
// Backward compat: old localStorage may not have showMetadata
(prefs as any).showMetadata = (prefs as any).showMetadata ?? true;
```

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/utils/constants.ts frontend/lib/store/project-display.ts
git commit -m "feat(display): add showMetadata to display preferences with backward compat"
```

---

### Task 6: Frontend — DisplaySettingsPopover toggle

**Files:**
- Modify: `frontend/components/display/DisplaySettingsPopover.tsx`

- [ ] **Step 1: Add Switch import and toggle section**

Add import:
```typescript
import { Switch } from "@/components/ui/switch";
```

After the Fit Mode section (after its closing `</div>`), add a new divider and section:

```tsx
{/* Divider */}
<div className="border-t border-border" />

{/* Metadata toggle */}
<div className="flex items-center justify-between">
  <span className="text-xs font-medium text-muted-foreground">Доп. данные</span>
  <Switch
    checked={preferences.showMetadata}
    onCheckedChange={(checked) => updatePreferences({ showMetadata: checked })}
    className="scale-75"
  />
</div>
```

- [ ] **Step 2: Verify in browser**

Open workspace, click "Вид" popover. The new toggle should appear below fit mode options.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/display/DisplaySettingsPopover.tsx
git commit -m "feat(display): add metadata toggle to View popover"
```

---

### Task 7: Frontend — ElementCard redesign (badges + подложка + menu)

**Files:**
- Modify: `frontend/components/element/ElementCard.tsx` (major rewrite of badge area + add footer)

This is the largest task. The card gets:
1. New badge layout: [★] [type] [AI] in top-right, each in `bg-black/60` pill
2. Star shows on hover (empty) or always (filled)
3. Play badge for video (bottom-left)
4. Metadata footer with filename + three-dot menu + status dropdown
5. Download button fix (fetch+blob)

- [ ] **Step 1: Add new imports**

Add to imports:
```typescript
import { Ellipsis, ChevronDown, Pencil, FolderInput, Copy } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
```

- [ ] **Step 2: Add approval status constants**

Add at top of file:
```typescript
const APPROVAL_STATUSES = [
  { value: null, label: 'Нет статуса', textColor: 'text-[#94A3B8]', bgColor: 'bg-[#475569]/[0.125]' },
  { value: 'IN_PROGRESS', label: 'В работе', textColor: 'text-[#60A5FA]', bgColor: 'bg-[#3B82F6]/[0.125]' },
  { value: 'NEEDS_REVIEW', label: 'На согласовании', textColor: 'text-[#FBBF24]', bgColor: 'bg-[#F59E0B]/[0.125]' },
  { value: 'APPROVED', label: 'Одобрено', textColor: 'text-[#4ADE80]', bgColor: 'bg-[#22C55E]/[0.125]' },
  { value: 'CHANGES_REQUESTED', label: 'На доработку', textColor: 'text-[#FB923C]', bgColor: 'bg-[#F97316]/[0.125]' },
  { value: 'REJECTED', label: 'Отклонено', textColor: 'text-[#94A3B8]', bgColor: 'bg-[#475569]/[0.125]' },
] as const;
```

- [ ] **Step 3: Add props**

Add to `ElementCardProps`:
```typescript
showMetadata?: boolean;
onUpdateStatus?: (id: number, status: string | null) => void;
onRename?: (id: number, name: string) => void;
onMove?: (id: number) => void;
```

- [ ] **Step 4: Add getFilename helper**

Inside component:
```typescript
const filename = element.original_filename || (element.file_url ? element.file_url.split('/').pop()?.split('?')[0] || `element-${element.id}` : `element-${element.id}`);
const currentStatus = APPROVAL_STATUSES.find(s => s.value === element.approval_status) || APPROVAL_STATUSES[0];
```

- [ ] **Step 5: Add download helper (fetch+blob fix)**

Replace existing download logic with:
```typescript
const handleDownload = async (e: React.MouseEvent) => {
  e.stopPropagation();
  if (!element.file_url) return;
  try {
    const response = await fetch(element.file_url);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch { /* silent */ }
};
```

- [ ] **Step 6: Rewrite badge area**

Replace the existing type icon + star badge area (lines ~260-320) with:

```tsx
{/* Top-right badges: star + type + AI */}
<div className="absolute top-2 right-2 z-40 flex items-center gap-1">
  {/* Star */}
  <button
    onClick={handleToggleFavoriteClick}
    className={cn(
      "rounded-md bg-black/60 p-1.5 transition-opacity",
      element.is_favorite ? "opacity-100" : "opacity-0 group-hover:opacity-100"
    )}
  >
    <Star className={cn(iconSizes.sm, "text-white", element.is_favorite && "fill-amber-400 text-amber-400")} />
  </button>

  {/* Media type */}
  <div className="rounded-md bg-black/60 p-1.5">
    {isVideo ? <Video className={cn(iconSizes.sm, "text-white")} /> : <Image className={cn(iconSizes.sm, "text-white")} />}
  </div>

  {/* AI pill */}
  {element.source_type === "GENERATED" && (
    <div className="rounded-md bg-black/60 px-2 py-1 flex items-center">
      <span className="text-white text-[11px] font-bold leading-none">AI</span>
    </div>
  )}
</div>

{/* Bottom-left: Play for video */}
{isVideo && !isFailed && (
  <div className="absolute bottom-2 left-2 z-30 rounded-md bg-black/60 p-1.5">
    <Play className={cn(iconSizes.sm, "text-white")} />
  </div>
)}
```

- [ ] **Step 7: Add metadata footer**

After the thumbnail `</div>`, before the card's closing tag, add:

```tsx
{/* Metadata footer */}
{showMetadata && !isFailed && element.status === 'COMPLETED' && (
  <div className="bg-[#151B2B] px-3 py-2.5 space-y-1.5">
    {/* Row 1: filename + dots menu */}
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-foreground truncate flex-1">{filename}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="shrink-0 p-0.5 rounded hover:bg-white/5" onClick={(e) => e.stopPropagation()}>
            <Ellipsis className="w-4 h-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={handleDownload}><Download className="w-4 h-4 mr-2" />Скачать</DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRename?.(element.id, filename); }}><Pencil className="w-4 h-4 mr-2" />Переименовать</DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onMove?.(element.id); }}><FolderInput className="w-4 h-4 mr-2" />Переместить</DropdownMenuItem>
          <DropdownMenuItem disabled><Copy className="w-4 h-4 mr-2" />Копировать</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={handleDeleteClick}><Trash2 className="w-4 h-4 mr-2" />Удалить</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    {/* Row 2: status dropdown */}
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-muted-foreground">Статус</span>
      <button
        onClick={(e) => e.stopPropagation()}
        className={cn("inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold", currentStatus.bgColor, currentStatus.textColor)}
      >
        {currentStatus.label}
        <ChevronDown className="w-3 h-3" />
      </button>
    </div>
  </div>
)}
```

Note: The actual status change dropdown implementation can use shadcn Select or a custom popover. Keep it simple for v1 — clicking the pill opens a list of statuses.

- [ ] **Step 8: Update card container**

The card's outer div changes from just aspect-ratio to flex column:
```tsx
<div className={cn("group relative overflow-hidden rounded-md bg-muted cursor-pointer flex flex-col", ...)}>
  <div className={cn("relative", aspectClass)}> {/* thumbnail area */}
    ...
  </div>
  {/* footer goes here */}
</div>
```

- [ ] **Step 9: Verify in browser**

Check all states: default, hover, favorited, video, uploaded (no AI), with/without metadata toggle.

- [ ] **Step 10: Commit**

```bash
git add frontend/components/element/ElementCard.tsx
git commit -m "feat(element-card): redesign badges, add metadata footer with status dropdown"
```

---

### Task 8: Frontend — ElementGrid passes showMetadata

**Files:**
- Modify: `frontend/components/element/ElementGrid.tsx`

- [ ] **Step 1: Read showMetadata from store and pass to cards**

In ElementGrid, get `showMetadata` from `useDisplayStore`:
```typescript
const { preferences } = useDisplayStore();
```

Pass to each `ElementCard`:
```tsx
<ElementCard showMetadata={preferences.showMetadata} ... />
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/element/ElementGrid.tsx
git commit -m "feat(grid): pass showMetadata preference to ElementCard"
```

---

### Task 9: Frontend — Share page updates (badges + minimal footer + reviewer actions)

**Files:**
- Modify: `frontend/app/share/[token]/page.tsx` (local ElementCard + reviewer buttons)
- Modify: `frontend/components/sharing/ReviewerLightbox.tsx` (review action buttons)
- Modify: `frontend/lib/api/sharing.ts` (submitReview method)

- [ ] **Step 1: Add submitReview to sharing API**

In `frontend/lib/api/sharing.ts`, add:
```typescript
async submitReview(token: string, data: { element_id: number; action: string; session_id: string; author_name: string }) {
  const { data: result } = await apiClient.post(`/api/sharing/public/${token}/review/`, data);
  return result;
},
```

- [ ] **Step 2: Update share page local ElementCard**

In the local ElementCard in `share/[token]/page.tsx`:
- Add `source_type` and `original_filename` to element type usage
- Add AI badge (same pattern as workspace card)
- Add minimal filename display below reactions bar

- [ ] **Step 3: Add review buttons to ReviewerLightbox**

In `ReviewerLightbox.tsx`, add three buttons in the action bar (next to like/dislike):

```tsx
{/* Review actions */}
<div className="flex items-center gap-1.5 ml-4 border-l border-border pl-4">
  <button onClick={() => handleReview('approved')} className="rounded-md px-3 py-1.5 text-xs font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20">
    <Check className="w-3.5 h-3.5 inline mr-1" />Согласовано
  </button>
  <button onClick={() => handleReview('changes_requested')} className="rounded-md px-3 py-1.5 text-xs font-medium bg-orange-500/10 text-orange-400 hover:bg-orange-500/20">
    <RotateCcw className="w-3.5 h-3.5 inline mr-1" />На доработку
  </button>
  <button onClick={() => handleReview('rejected')} className="rounded-md px-3 py-1.5 text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80">
    <X className="w-3.5 h-3.5 inline mr-1" />Отклонено
  </button>
</div>
```

With handler:
```typescript
const handleReview = async (action: string) => {
  if (!reviewerName) { toast.error('Введите имя'); return; }
  try {
    await sharingApi.submitReview(token, { element_id: currentElement.id, action, session_id: sessionId, author_name: reviewerName });
    toast.success(action === 'approved' ? 'Согласовано' : action === 'changes_requested' ? 'Отправлено на доработку' : 'Отклонено');
    // Refresh comments to show system comment
    await loadComments(currentElement.id);
  } catch { toast.error('Ошибка'); }
};
```

- [ ] **Step 4: Commit**

```bash
git add frontend/app/share/ frontend/components/sharing/ frontend/lib/api/sharing.ts
git commit -m "feat(sharing): add reviewer actions, expand public element data, minimal footer"
```

---

### Task 10: Frontend — Mobile comments fix + ElementSelectionCard tooltip

**Files:**
- Modify: `frontend/components/sharing/ReviewerLightbox.tsx` (mobile drawer)
- Modify: `frontend/components/element/ElementSelectionCard.tsx` (tooltip)

- [ ] **Step 1: Add mobile comments button**

In ReviewerLightbox, add a button visible only on mobile (`md:hidden`) that opens a Sheet with comments:

```tsx
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { MessageCircle } from "lucide-react";

{/* Mobile comments button */}
<button className="md:hidden rounded-md bg-muted px-3 py-1.5 text-xs" onClick={() => setMobileCommentsOpen(true)}>
  <MessageCircle className="w-4 h-4 inline mr-1" />Комменты
</button>

<Sheet open={mobileCommentsOpen} onOpenChange={setMobileCommentsOpen}>
  <SheetContent side="bottom" className="h-[70vh]">
    <CommentThread ... />
  </SheetContent>
</Sheet>
```

- [ ] **Step 2: Add tooltip to ElementSelectionCard**

In `frontend/components/element/ElementSelectionCard.tsx`, wrap the button with a tooltip showing filename:

```tsx
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

<Tooltip>
  <TooltipTrigger asChild>
    <button ...> {/* existing button */} </button>
  </TooltipTrigger>
  <TooltipContent side="bottom" className="text-xs">
    {element.original_filename || `element-${element.id}`}
  </TooltipContent>
</Tooltip>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/sharing/ReviewerLightbox.tsx frontend/components/element/ElementSelectionCard.tsx
git commit -m "fix: mobile comments drawer, selection card filename tooltip"
```

---

## Summary

| Task | What | Files | Est. |
|------|------|-------|------|
| 1 | Backend: remove IMG2VID, add fields, migrate | models, orchestration, migration | 5 min |
| 2 | Backend: update serializers | serializers | 2 min |
| 3 | Backend: is_system comment, review endpoint | sharing models/views/serializers/urls | 10 min |
| 4 | Frontend: update TypeScript types | types/index.ts, DetailPanel, history | 5 min |
| 5 | Frontend: display store + constants | constants, project-display store | 3 min |
| 6 | Frontend: DisplaySettingsPopover toggle | DisplaySettingsPopover | 3 min |
| 7 | Frontend: ElementCard redesign | ElementCard.tsx (major) | 20 min |
| 8 | Frontend: ElementGrid passes showMetadata | ElementGrid | 2 min |
| 9 | Frontend: Share page + reviewer actions | share page, ReviewerLightbox, sharing API | 15 min |
| 10 | Frontend: mobile comments + selection tooltip | ReviewerLightbox, ElementSelectionCard | 5 min |
