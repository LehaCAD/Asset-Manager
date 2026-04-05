# Sharing Hardening & Filters — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 8 sharing bugs, replace share-link filter tabs with boolean intersection toggles, add notification filtering by project + category in both dropdown and cabinet page.

**Architecture:** Three independent blocks executed sequentially. Block A patches backend sharing views (no UI changes). Block B replaces frontend filter tabs in CreateLinkDialog with multi-axis toggle pills and adds `source_type` to backend metadata endpoint. Block C adds filter state to notification store, extends backend API with `?project=` and multi-type `?type=`, replaces tabs in both notification surfaces with toggle pills + project dropdown, extracts shared NotificationIcon component.

**Tech Stack:** Django 5 / DRF, Next.js 14, React 19, Zustand 5, Tailwind 4, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-04-05-sharing-hardening-filters-design.md`

**IMPORTANT:** All commands run inside Docker containers per CLAUDE.md. Never install anything on host.

---

## File Map

### Block A — Backend bugfixes
| Action | File | What changes |
|--------|------|--------------|
| Modify | `backend/apps/sharing/views.py` | A1-A8: validation, coercion, throttle, sanitization |
| Modify | `backend/apps/notifications/models.py:6-9` | A6: add `REACTION_NEW` type |
| Create | `backend/apps/notifications/migrations/XXXX_*.py` | Auto-generated migration |

### Block B — Boolean share filters
| Action | File | What changes |
|--------|------|--------------|
| Modify | `backend/apps/sharing/views.py:404-414,419-438` | Add `source_type` to `.values()` |
| Modify | `frontend/lib/types/index.ts:444` | Update `NotificationType` union |
| Modify | `frontend/components/sharing/CreateLinkDialog.tsx` | Replace tabs with toggle pills |
| Modify | `frontend/components/element/WorkspaceContainer.tsx:845-847` | Add `source_type` to mapping |

### Block C — Notification filters
| Action | File | What changes |
|--------|------|--------------|
| Modify | `backend/apps/notifications/models.py:6-9` | Add `UPLOAD_COMPLETED` type |
| Modify | `backend/apps/notifications/views.py:15-17` | Support `?project=` and multi-type `?type=` |
| Modify | `backend/apps/elements/tasks.py:394-400` | Create notification on upload complete |
| Create | `backend/apps/notifications/migrations/XXXX_*.py` | Auto-generated migration (combined with A6) |
| Modify | `frontend/lib/types/index.ts:444` | Already done in Block B |
| Modify | `frontend/lib/api/notifications.ts:11` | Add `project` param |
| Modify | `frontend/lib/store/notifications.ts` | Add filters state + setFilters |
| Create | `frontend/components/ui/notification-icon.tsx` | Shared icon component |
| Modify | `frontend/app/(cabinet)/cabinet/notifications/page.tsx` | Replace tabs with filters |
| Modify | `frontend/components/layout/NotificationDropdown.tsx` | Replace tabs with filters |

---

## Task 1: Backend bugfixes A1-A3 (validation & coercion)

**Files:**
- Modify: `backend/apps/sharing/views.py:144-208` (public_comment_view)
- Modify: `backend/apps/sharing/views.py:214-255` (public_review_action)
- Modify: `backend/apps/sharing/views.py:261-319` (public_reaction_view)

- [ ] **Step 1: Fix A1 — parent_id validation in public_comment_view**

In `public_comment_view` (line 144-208), add parent validation before creating Comment. Insert after `shared_element_ids` is computed (after line 161):

```python
    # Validate parent_id if provided
    parent_id = data.get('parent_id')
    if parent_id is not None:
        try:
            parent_comment = Comment.objects.get(id=parent_id)
        except Comment.DoesNotExist:
            return Response(
                {'detail': 'Parent comment not found.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Parent must target same element/scene
        if data.get('element_id') and parent_comment.element_id != data['element_id']:
            return Response(
                {'detail': 'Parent comment belongs to a different element.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if data.get('scene_id') and parent_comment.scene_id != data['scene_id']:
            return Response(
                {'detail': 'Parent comment belongs to a different scene.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
```

Also wrap `full_clean()` calls (lines 177, 197) with:
```python
        try:
            comment.full_clean()
        except ValidationError as e:
            return Response(
                {'detail': e.message_dict if hasattr(e, 'message_dict') else str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
```

Add import at top of file:
```python
from django.core.exceptions import ValidationError
```

- [ ] **Step 2: Fix A3 — type coercion in public_review_action**

In `public_review_action` (line 214-255), after `element_id = request.data.get('element_id')` (line 220), add:

```python
    try:
        element_id = int(element_id)
    except (TypeError, ValueError):
        return Response({'detail': 'element_id must be an integer.'}, status=400)
```

- [ ] **Step 3: Fix A3 — type coercion in public_reaction_view**

In `public_reaction_view` (line 261-319), after `element_id = request.data.get('element_id')` (line 267), add:

```python
    try:
        element_id = int(element_id)
    except (TypeError, ValueError):
        return Response({'detail': 'element_id must be an integer.'}, status=400)
```

- [ ] **Step 4: Verify container builds**

```bash
docker compose exec backend python -c "from apps.sharing.views import public_comment_view, public_review_action, public_reaction_view; print('OK')"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/apps/sharing/views.py
git commit -m "fix(sharing): validate parent_id and coerce element_id to int

Prevents 500 errors from invalid parent_id FK and string/int type mismatch
in review and reaction endpoints."
```

---

## Task 2: Backend bugfixes A2, A5, A7, A8 (filters, throttle, sanitization)

**Files:**
- Modify: `backend/apps/sharing/views.py:50-51,84-86,54-56,104-111,214-255,261-319`

- [ ] **Step 1: Fix A2 — add is_system=False to scene comments query**

In `public_share_view`, change line 84-86 from:
```python
        scene_comments = Comment.objects.filter(
            scene_id__in=scene_ids, parent__isnull=True
        ).prefetch_related('replies').order_by('created_at')
```
to:
```python
        scene_comments = Comment.objects.filter(
            scene_id__in=scene_ids, parent__isnull=True, is_system=False
        ).prefetch_related('replies').order_by('created_at')
```

- [ ] **Step 2: Fix A5 — reduce anonymous throttle**

Change `PublicCommentThrottle` (line 50-51):
```python
class PublicCommentThrottle(AnonRateThrottle):
    rate = '60/min'
```

- [ ] **Step 3: Fix A7 — add throttle to public_share_view**

Add new throttle class after `PublicCommentThrottle`:
```python
class PublicReadThrottle(AnonRateThrottle):
    rate = '120/min'
```

Add decorator to `public_share_view` (line 54):
```python
@api_view(['GET'])
@permission_classes([AllowAny])
@throttle_classes([PublicReadThrottle])
def public_share_view(request, token):
```

Add `throttle_classes` import if not present (it's already imported on line 6).

- [ ] **Step 4: Fix A8 — sanitize author_name in all public endpoints**

In `public_comment_view`, the `author_name` comes from serializer validated data — it's already stripped. But add safety after `data = serializer.validated_data` (line 155):
```python
    data['author_name'] = strip_tags(data.get('author_name', '')).strip()[:100]
```

In `public_review_action` (line 223), replace:
```python
    author_name = request.data.get('author_name', '')
```
with:
```python
    author_name = strip_tags(request.data.get('author_name', '')).strip()[:100]
```

In `public_reaction_view` (line 270), replace:
```python
    author_name = request.data.get('author_name', '')
```
with:
```python
    author_name = strip_tags(request.data.get('author_name', '')).strip()[:100]
```

- [ ] **Step 5: Verify**

```bash
docker compose exec backend python -c "from apps.sharing.views import public_share_view; print('OK')"
```

- [ ] **Step 6: Commit**

```bash
git add backend/apps/sharing/views.py
git commit -m "fix(sharing): filter system comments, tighten throttles, sanitize author_name

A2: add is_system=False to scene comments in public view
A5: reduce anonymous throttle from 600/min to 60/min
A7: add 120/min throttle on GET public_share_view
A8: strip_tags + trim author_name in all public endpoints"
```

---

## Task 3: Backend bugfixes A4, A6 (recursive queries, reaction notification type)

**Files:**
- Modify: `backend/apps/sharing/views.py:419-438` (group_element_ids)
- Modify: `backend/apps/notifications/models.py:6-9`
- Modify: `backend/apps/sharing/views.py:297-313` (public_reaction_view notification)
- Create: migration

- [ ] **Step 1: Fix A4 — replace recursive scene queries with single query**

Replace `group_element_ids` function (lines 419-438) with:

```python
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def group_element_ids(request, scene_id):
    """GET /api/sharing/group-elements/{scene_id}/ — element IDs in scene + children."""
    from apps.scenes.models import Scene
    from apps.elements.models import Element
    scene = get_object_or_404(Scene, id=scene_id, project__user=request.user)

    # Single query: all scenes in this project, then BFS in Python
    all_scenes = list(
        Scene.objects.filter(project=scene.project).values_list('id', 'parent_id')
    )
    children_map = {}
    for sid, pid in all_scenes:
        children_map.setdefault(pid, []).append(sid)

    # BFS from target scene
    scene_ids = []
    queue = [scene.id]
    while queue:
        current = queue.pop(0)
        scene_ids.append(current)
        queue.extend(children_map.get(current, []))

    elements = list(
        Element.objects.filter(scene_id__in=scene_ids)
        .exclude(status='FAILED')
        .values('id', 'element_type', 'is_favorite')
    )
    return Response({'elements': elements})
```

- [ ] **Step 2: Fix A6 — add REACTION_NEW notification type**

In `backend/apps/notifications/models.py`, change lines 6-9:

```python
    class Type(models.TextChoices):
        COMMENT_NEW = 'comment_new', 'Новый комментарий'
        REACTION_NEW = 'reaction_new', 'Новая реакция'
        GENERATION_COMPLETED = 'generation_completed', 'Генерация завершена'
        GENERATION_FAILED = 'generation_failed', 'Ошибка генерации'
```

- [ ] **Step 3: Fix A6 — use REACTION_NEW in public_reaction_view**

In `public_reaction_view` (around line 308), change:
```python
            create_notification(
                user=el.project.user,
                type=Notification.Type.COMMENT_NEW,
```
to:
```python
            create_notification(
                user=el.project.user,
                type=Notification.Type.REACTION_NEW,
```

- [ ] **Step 4: Generate migration**

```bash
docker compose exec backend python manage.py makemigrations notifications --name add_reaction_new_type
```

- [ ] **Step 5: Apply migration**

```bash
docker compose exec backend python manage.py migrate notifications
```

- [ ] **Step 6: Verify**

```bash
docker compose exec backend python -c "from apps.notifications.models import Notification; print(Notification.Type.REACTION_NEW)"
```

Expected: `reaction_new`

- [ ] **Step 7: Commit**

```bash
git add backend/apps/sharing/views.py backend/apps/notifications/models.py backend/apps/notifications/migrations/
git commit -m "fix(sharing): single-query group elements, add reaction_new notification type

A4: replace recursive SQL queries with single-query BFS for child scenes
A6: new Notification.Type.REACTION_NEW, use it for reaction notifications
instead of COMMENT_NEW"
```

---

## Task 4: Backend — add source_type to metadata + upload_completed type + filter API

**Files:**
- Modify: `backend/apps/sharing/views.py:404-414` (project_element_ids)
- Modify: `backend/apps/notifications/models.py:6-10`
- Modify: `backend/apps/notifications/views.py:15-17`
- Modify: `backend/apps/elements/tasks.py:394-400`
- Create: migration (if not combined with Task 3)

- [ ] **Step 1: Add source_type to project_element_ids and group_element_ids**

In `project_element_ids` (line 412), change:
```python
        .values('id', 'element_type', 'is_favorite')
```
to:
```python
        .values('id', 'element_type', 'is_favorite', 'source_type')
```

In `group_element_ids` (the new version from Task 3), same change to the `.values()` call.

- [ ] **Step 2: Add UPLOAD_COMPLETED to Notification.Type**

In `backend/apps/notifications/models.py`, add after GENERATION_FAILED:
```python
        UPLOAD_COMPLETED = 'upload_completed', 'Загрузка завершена'
```

- [ ] **Step 3: Extend notification_list with project filter and multi-type support**

In `backend/apps/notifications/views.py`, replace lines 15-17:
```python
    type_filter = request.query_params.get('type')
    if type_filter:
        qs = qs.filter(type=type_filter)
```
with:
```python
    project_id = request.query_params.get('project')
    if project_id:
        qs = qs.filter(project_id=project_id)

    type_filter = request.query_params.get('type')
    if type_filter:
        type_list = [t.strip() for t in type_filter.split(',')]
        qs = qs.filter(type__in=type_list)
```

- [ ] **Step 4: Create notification on upload completion**

In `backend/apps/elements/tasks.py`, add import at top (after line 26):
```python
from apps.notifications.services import notify_element_status, create_notification
```

Change existing import (line 26) from:
```python
from apps.notifications.services import notify_element_status
```
to:
```python
from apps.notifications.services import notify_element_status, create_notification
```

In `process_uploaded_file`, after `notify_element_status(element, 'COMPLETED', file_url=file_url)` (line 398), add:
```python
        try:
            create_notification(
                user=element.project.user,
                type='upload_completed',
                project=element.project,
                title='Файл загружен',
                message=element.original_filename or 'Загрузка завершена',
                element=element,
            )
        except Exception as e:
            logger.warning('Failed to create upload notification: %s', e)
```

- [ ] **Step 5: Generate and apply migration**

```bash
docker compose exec backend python manage.py makemigrations notifications --name add_upload_completed_type
docker compose exec backend python manage.py migrate notifications
```

Note: If Task 3 migration hasn't been applied yet, these can be combined into one migration.

- [ ] **Step 6: Verify**

```bash
docker compose exec backend python -c "
from apps.notifications.models import Notification
print(Notification.Type.UPLOAD_COMPLETED)
print('OK')
"
```

Expected: `upload_completed\nOK`

- [ ] **Step 7: Commit**

```bash
git add backend/apps/sharing/views.py backend/apps/notifications/models.py backend/apps/notifications/views.py backend/apps/elements/tasks.py backend/apps/notifications/migrations/
git commit -m "feat(backend): source_type in share metadata, upload_completed notifications, filter API

Block B backend: add source_type to project-elements and group-elements responses
Block C backend: add upload_completed notification type, create notification on upload
Block C backend: support ?project= and comma-separated ?type= in notification list API"
```

---

## Task 5: Frontend — update types

**Files:**
- Modify: `frontend/lib/types/index.ts:444`
- Modify: `frontend/components/sharing/CreateLinkDialog.tsx:17-21`

- [ ] **Step 1: Update NotificationType**

In `frontend/lib/types/index.ts`, replace line 444:
```typescript
export type NotificationType = 'comment_new' | 'generation_completed' | 'generation_failed'
```
with:
```typescript
export type NotificationType = 'comment_new' | 'reaction_new' | 'generation_completed' | 'generation_failed' | 'upload_completed'
```

- [ ] **Step 2: Update ShareableElement in CreateLinkDialog**

In `frontend/components/sharing/CreateLinkDialog.tsx`, replace lines 17-21:
```typescript
interface ShareableElement {
  id: number
  element_type: string
  is_favorite: boolean
}
```
with:
```typescript
interface ShareableElement {
  id: number
  element_type: string
  is_favorite: boolean
  source_type: string
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/types/index.ts frontend/components/sharing/CreateLinkDialog.tsx
git commit -m "feat(types): add reaction_new, upload_completed notification types and source_type to ShareableElement"
```

---

## Task 6: Frontend — boolean filters in CreateLinkDialog

**Files:**
- Modify: `frontend/components/sharing/CreateLinkDialog.tsx` (full rewrite of filter section)

- [ ] **Step 1: Replace filter state and logic**

Replace the entire content of `CreateLinkDialog.tsx`. Key changes:

Remove:
- `type FilterType` (line 34)
- `FILTERS` array (lines 42-47)
- `filter` state (line 59)
- Old `filteredIds` useMemo (lines 65-75)
- Old `filterCounts` useMemo (lines 77-85)
- Old filter tabs JSX (lines 137-161)
- `setFilter('all')` in handleClose (line 124)

Keep `hasMetadata` computation (already exists in file):
```typescript
const hasMetadata = !!elements && elements.length > 0
```

Add new state (replaces old `filter` state):
```typescript
const [sourceFilter, setSourceFilter] = useState<Set<string>>(new Set())
const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set())
const [favoriteFilter, setFavoriteFilter] = useState(false)
```

Add toggle helper:
```typescript
function toggleInSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}
```

New `filteredIds` useMemo:
```typescript
const filteredIds = useMemo(() => {
  if (!hasMetadata) return elementIds
  return elements!.filter(el => {
    if (sourceFilter.size > 0 && !sourceFilter.has(el.source_type)) return false
    if (typeFilter.size > 0 && !typeFilter.has(el.element_type)) return false
    if (favoriteFilter && !el.is_favorite) return false
    return true
  }).map(el => el.id)
}, [elements, elementIds, sourceFilter, typeFilter, favoriteFilter, hasMetadata])
```

New filter counts (count = how many elements match current intersection PLUS this pill):
```typescript
const pillCounts = useMemo(() => {
  if (!hasMetadata) return null

  // Helper: count elements matching a candidate filter config
  const countWith = (
    source: Set<string>,
    type: Set<string>,
    fav: boolean
  ) => elements!.filter(el => {
    if (source.size > 0 && !source.has(el.source_type)) return false
    if (type.size > 0 && !type.has(el.element_type)) return false
    if (fav && !el.is_favorite) return false
    return true
  }).length

  // For each pill: "what would the count be if I toggled this pill on?"
  // Keep other axes as-is, add this value to its axis
  const withSource = (v: string) => {
    const s = new Set(sourceFilter); s.add(v); return countWith(s, typeFilter, favoriteFilter)
  }
  const withType = (v: string) => {
    const s = new Set(typeFilter); s.add(v); return countWith(sourceFilter, s, favoriteFilter)
  }

  return {
    generated: withSource('GENERATED'),
    uploaded: withSource('UPLOADED'),
    images: withType('IMAGE'),
    videos: withType('VIDEO'),
    favorites: countWith(sourceFilter, typeFilter, true),
  }
}, [elements, hasMetadata, sourceFilter, typeFilter, favoriteFilter])
```

- [ ] **Step 2: Replace filter tabs JSX with toggle pills**

Replace the filter tabs section (lines 137-161) with:

```tsx
{hasMetadata && pillCounts && (
  <div className="flex items-center gap-1.5 flex-wrap">
    {/* Source axis */}
    <FilterPill
      label="Генерации"
      count={pillCounts.generated}
      active={sourceFilter.has('GENERATED')}
      onClick={() => setSourceFilter(s => toggleInSet(s, 'GENERATED'))}
    />
    <FilterPill
      label="Загрузки"
      count={pillCounts.uploaded}
      active={sourceFilter.has('UPLOADED')}
      onClick={() => setSourceFilter(s => toggleInSet(s, 'UPLOADED'))}
    />
    <span className="text-muted-foreground/50 text-xs select-none mx-0.5">&middot;</span>
    {/* Type axis */}
    <FilterPill
      label="Фото"
      count={pillCounts.images}
      active={typeFilter.has('IMAGE')}
      onClick={() => setTypeFilter(s => toggleInSet(s, 'IMAGE'))}
    />
    <FilterPill
      label="Видео"
      count={pillCounts.videos}
      active={typeFilter.has('VIDEO')}
      onClick={() => setTypeFilter(s => toggleInSet(s, 'VIDEO'))}
    />
    <span className="text-muted-foreground/50 text-xs select-none mx-0.5">&middot;</span>
    {/* Favorite axis */}
    <FilterPill
      label="Избранное"
      count={pillCounts.favorites}
      active={favoriteFilter}
      onClick={() => setFavoriteFilter(f => !f)}
    />
  </div>
)}
```

Add `FilterPill` component above `CreateLinkDialog`:

```tsx
function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  const disabled = count === 0
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-all',
        active
          ? 'bg-primary text-primary-foreground'
          : 'border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30',
        disabled && 'opacity-40 pointer-events-none'
      )}
    >
      {label}
      <span className={cn('tabular-nums', active ? 'text-primary-foreground/70' : 'text-muted-foreground/70')}>
        {count}
      </span>
    </button>
  )
}
```

- [ ] **Step 3: Update handleClose to reset new state**

```typescript
function handleClose() {
  setName('')
  setExpiry('')
  setSourceFilter(new Set())
  setTypeFilter(new Set())
  setFavoriteFilter(false)
  onClose()
}
```

- [ ] **Step 4: Remove unused imports**

Remove `Copy, Image, Video, Star` from lucide-react import (keep `Copy` for submit button). The `FILTERS` constant and `FilterType` type are also removed.

Updated import:
```typescript
import { Copy } from 'lucide-react'
```

- [ ] **Step 5: Verify build**

```bash
docker compose exec frontend npm run build 2>&1 | tail -20
```

Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/sharing/CreateLinkDialog.tsx
git commit -m "feat(sharing): boolean intersection filters in CreateLinkDialog

Replace tab filters (All/Images/Videos/Favorites) with toggle pills:
[Генерации] [Загрузки] · [Фото] [Видео] · [Избранное]
OR within axis, AND between axes."
```

---

## Task 7: Frontend — update WorkspaceContainer source_type mapping

**Files:**
- Modify: `frontend/components/element/WorkspaceContainer.tsx:845-847`

- [ ] **Step 1: Add source_type to element mapping**

In `WorkspaceContainer.tsx`, find all places where ShareableElement objects are constructed (around lines 845-847 and 766-772). Add `source_type` to each `.map()`:

Around line 845-847, change:
```typescript
.map(e => ({ id: e.id, element_type: e.element_type, is_favorite: e.is_favorite }))
```
to:
```typescript
.map(e => ({ id: e.id, element_type: e.element_type, is_favorite: e.is_favorite, source_type: e.source_type }))
```

Do this for ALL occurrences in the file where ShareableElement-shaped objects are created.

Note: The `getProjectElements` and `getGroupElements` API calls already return the full response from the backend, which now includes `source_type`. These don't need mapping changes since they pass through directly.

- [ ] **Step 2: Verify build**

```bash
docker compose exec frontend npm run build 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/element/WorkspaceContainer.tsx
git commit -m "feat(sharing): pass source_type through WorkspaceContainer element mapping"
```

---

## Task 8: Frontend — shared NotificationIcon component

**Files:**
- Create: `frontend/components/ui/notification-icon.tsx`

- [ ] **Step 1: Create shared component**

```tsx
import { MessageCircle, CheckCircle2, XCircle, ThumbsUp, Upload } from 'lucide-react'
import type { NotificationType } from '@/lib/types'

const ICON_CONFIG: Record<NotificationType, { icon: React.ElementType; colorClass: string }> = {
  comment_new: { icon: MessageCircle, colorClass: 'text-primary bg-primary/10' },
  reaction_new: { icon: ThumbsUp, colorClass: 'text-primary bg-primary/10' },
  generation_completed: { icon: CheckCircle2, colorClass: 'text-success bg-success/10' },
  generation_failed: { icon: XCircle, colorClass: 'text-destructive bg-destructive/10' },
  upload_completed: { icon: Upload, colorClass: 'text-success bg-success/10' },
}

interface NotificationIconProps {
  type: NotificationType
  size?: 'sm' | 'md'
}

export function NotificationIcon({ type, size = 'md' }: NotificationIconProps) {
  const config = ICON_CONFIG[type]
  if (!config) return null

  const Icon = config.icon
  const sizeClasses = size === 'sm'
    ? 'h-4 w-4'
    : 'h-8 w-8'
  const iconSize = size === 'sm'
    ? 'h-3.5 w-3.5'
    : 'h-4 w-4'

  if (size === 'sm') {
    return <Icon className={`${iconSize} shrink-0 ${config.colorClass.split(' ')[0]}`} strokeWidth={1.75} />
  }

  return (
    <div className={`flex ${sizeClasses} shrink-0 items-center justify-center rounded-full ${config.colorClass}`}>
      <Icon className={iconSize} />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/ui/notification-icon.tsx
git commit -m "feat(ui): shared NotificationIcon component with all notification types"
```

---

## Task 9: Frontend — notification API and store with filters

**Files:**
- Modify: `frontend/lib/api/notifications.ts:11`
- Modify: `frontend/lib/store/notifications.ts`

- [ ] **Step 1: Update API client**

Replace `frontend/lib/api/notifications.ts` entirely:

```typescript
import { apiClient } from './client'
import type { Notification } from '@/lib/types'

interface NotificationListResponse {
  results: Notification[]
  has_more: boolean
  next_offset: number | null
}

export const notificationsApi = {
  list: (params?: { type?: string; is_read?: boolean; offset?: number; project?: number }) =>
    apiClient.get<NotificationListResponse>('/api/notifications/', { params })
      .then(r => r.data),

  unreadCount: () =>
    apiClient.get<{ count: number }>('/api/notifications/unread-count/')
      .then(r => r.data.count),

  markRead: (id: number) =>
    apiClient.patch(`/api/notifications/${id}/read/`),

  markAllRead: () =>
    apiClient.post('/api/notifications/read-all/'),
}
```

- [ ] **Step 2: Update notification store with filters**

Replace `frontend/lib/store/notifications.ts` entirely:

```typescript
import { create } from "zustand";
import { notificationsApi } from "@/lib/api/notifications";
import type { Notification } from "@/lib/types";

interface NotificationFilters {
  projectId: number | null;
  types: string[] | null; // null = all types
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  hasMore: boolean;
  isLoading: boolean;
  error: boolean;
  filters: NotificationFilters;
  lastFetchedFilters: NotificationFilters | null;

  fetchUnreadCount: () => Promise<void>;
  fetchNotifications: (offset?: number) => Promise<void>;
  setFilters: (update: Partial<NotificationFilters>) => void;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  addNotification: (notification: Notification) => void;
}

const DEFAULT_FILTERS: NotificationFilters = { projectId: null, types: null };

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  hasMore: false,
  isLoading: false,
  error: false,
  filters: { ...DEFAULT_FILTERS },
  lastFetchedFilters: null,

  fetchUnreadCount: async () => {
    try {
      const count = await notificationsApi.unreadCount();
      set({ unreadCount: count });
    } catch {
      // silently ignore — unread badge is non-critical
    }
  },

  fetchNotifications: async (offset = 0) => {
    const { filters } = get();
    set({ isLoading: true, error: false });
    try {
      const params: Record<string, unknown> = { offset };
      if (filters.projectId) params.project = filters.projectId;
      if (filters.types && filters.types.length > 0) params.type = filters.types.join(',');

      const data = await notificationsApi.list(params as any);
      set((state) => ({
        notifications:
          offset === 0
            ? data.results
            : [...state.notifications, ...data.results],
        hasMore: data.has_more,
        isLoading: false,
        lastFetchedFilters: { ...filters },
      }));
    } catch {
      set({ isLoading: false, error: offset === 0 });
    }
  },

  setFilters: (update) => {
    set((state) => ({
      filters: { ...state.filters, ...update },
    }));
    // Auto-refetch with new filters
    get().fetchNotifications(0);
  },

  markRead: async (id) => {
    await notificationsApi.markRead(id);
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, is_read: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }));
  },

  markAllRead: async () => {
    await notificationsApi.markAllRead();
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, is_read: true })),
      unreadCount: 0,
    }));
  },

  addNotification: (notification) => {
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    }));
  },
}));
```

- [ ] **Step 3: Verify build**

```bash
docker compose exec frontend npm run build 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/api/notifications.ts frontend/lib/store/notifications.ts
git commit -m "feat(notifications): add project and multi-type filter support to API client and store"
```

---

## Task 10: Frontend — notifications page with filters

**Files:**
- Modify: `frontend/app/(cabinet)/cabinet/notifications/page.tsx`

- [ ] **Step 1: Rewrite notifications page**

Replace the entire file. Key changes:

1. Remove old `Tab` type, `TABS` array, `matchesTab` function, `activeTab` state
2. Remove inline `NotificationIcon` — import from shared component
3. Add project dropdown + category toggle pills in header
4. Replace in-memory tab filtering with store-based filtering
5. Fetch projects list for dropdown

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BellOff, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { NotificationIcon } from "@/components/ui/notification-icon";
import { useNotificationStore } from "@/lib/store/notifications";
import { projectsApi } from "@/lib/api/projects";
import type { Notification } from "@/lib/types";
import { cn } from "@/lib/utils";

/* ── Category mapping ──────────────────────────────────────── */

const CATEGORIES = [
  { key: 'feedback', label: 'Отзывы', types: ['comment_new', 'reaction_new'] },
  { key: 'content', label: 'Контент', types: ['generation_completed', 'generation_failed', 'upload_completed'] },
] as const;

type CategoryKey = typeof CATEGORIES[number]['key'];

/* ── Relative time ─────────────────────────────────────────── */

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "только что";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} мин. назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч. назад`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} дн. назад`;
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

/* ── Single notification row ───────────────────────────────── */

function NotificationItem({
  notification,
  onRead,
}: {
  notification: Notification;
  onRead: (n: Notification) => void;
}) {
  return (
    <button
      onClick={() => onRead(notification)}
      className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30 ${
        !notification.is_read ? "bg-primary/5" : ""
      }`}
    >
      <NotificationIcon type={notification.type} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-foreground leading-snug truncate">
            {notification.title}
          </p>
          <span className="shrink-0 text-[11px] text-muted-foreground whitespace-nowrap">
            {relativeTime(notification.created_at)}
          </span>
        </div>
        {notification.message && (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {notification.message}
          </p>
        )}
      </div>
      {!notification.is_read && (
        <div className="shrink-0 mt-1.5 h-2 w-2 rounded-full bg-primary" />
      )}
    </button>
  );
}

/* ── Skeleton ──────────────────────────────────────────────── */

function NotificationSkeleton() {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Skeleton className="h-8 w-8 rounded-full shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-3 w-full" />
      </div>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────── */

export default function NotificationsPage() {
  const router = useRouter();
  const {
    notifications, hasMore, isLoading, error,
    filters, setFilters,
    fetchNotifications, markRead, markAllRead,
  } = useNotificationStore();

  const [activeCategories, setActiveCategories] = useState<Set<CategoryKey>>(new Set());
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);

  // Fetch projects for dropdown
  useEffect(() => {
    projectsApi.getAll().then(data => {
      setProjects(data.map(p => ({ id: p.id, name: p.name })));
    }).catch(() => {});
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchNotifications(0);
  }, [fetchNotifications]);

  function handleCategoryToggle(key: CategoryKey) {
    const next = new Set(activeCategories);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setActiveCategories(next);

    // Compute types from active categories
    if (next.size === 0) {
      setFilters({ types: null });
    } else {
      const types = CATEGORIES.filter(c => next.has(c.key)).flatMap(c => c.types);
      setFilters({ types: [...types] });
    }
  }

  function handleProjectChange(projectId: number | null) {
    setFilters({ projectId });
  }

  const handleRead = async (n: Notification) => {
    if (!n.is_read) await markRead(n.id);
    if (n.project) {
      let url = `/projects/${n.project}`;
      if (n.scene) url += `/groups/${n.scene}`;
      if (n.element) url += `?lightbox=${n.element}`;
      router.push(url);
    }
  };

  const handleLoadMore = () => {
    fetchNotifications(notifications.length);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Уведомления</h1>
        <button
          onClick={markAllRead}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Прочитать все
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Project dropdown */}
        <select
          value={filters.projectId ?? ''}
          onChange={(e) => handleProjectChange(e.target.value ? Number(e.target.value) : null)}
          className="px-3 py-1.5 text-xs bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Все проекты</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        {/* Category toggles */}
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            type="button"
            onClick={() => handleCategoryToggle(cat.key)}
            className={cn(
              'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium transition-all',
              activeCategories.has(cat.key)
                ? 'bg-primary text-primary-foreground'
                : 'border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="rounded-md border border-border bg-card shadow-[var(--shadow-card)] overflow-hidden">
        {error && notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-10 w-10 rounded-md bg-destructive/10 flex items-center justify-center mb-3">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <p className="text-sm font-medium text-foreground">Не удалось загрузить данные</p>
            <p className="text-xs text-muted-foreground mt-1">Попробуйте обновить страницу</p>
            <button
              onClick={() => fetchNotifications(0)}
              className="mt-3 px-3 py-1.5 text-xs rounded-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Повторить
            </button>
          </div>
        ) : isLoading && notifications.length === 0 ? (
          <div className="divide-y divide-border/50">
            {[...Array(5)].map((_, i) => (
              <NotificationSkeleton key={i} />
            ))}
          </div>
        ) : notifications.length > 0 ? (
          <div className="divide-y divide-border/50">
            {notifications.map((n) => (
              <NotificationItem key={n.id} notification={n} onRead={handleRead} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="rounded-full bg-muted p-4">
              <BellOff className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Уведомлений пока нет</p>
          </div>
        )}
      </div>

      {/* Load more */}
      {hasMore && !isLoading && (
        <div className="flex justify-center">
          <button
            onClick={handleLoadMore}
            className="px-4 py-2 text-xs text-muted-foreground hover:text-foreground bg-muted/60 hover:bg-muted rounded-md transition-colors"
          >
            Загрузить ещё
          </button>
        </div>
      )}

      {isLoading && notifications.length > 0 && (
        <div className="flex justify-center py-2">
          <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify projectsApi import works**

`frontend/lib/api/projects.ts` exports `projectsApi.getAll(): Promise<Project[]>`. The code uses `getAll()` which returns a flat array directly.

- [ ] **Step 3: Verify build**

```bash
docker compose exec frontend npm run build 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add frontend/app/\(cabinet\)/cabinet/notifications/page.tsx
git commit -m "feat(notifications): replace tabs with project dropdown + category toggle pills

Filters hit backend API instead of in-memory filtering.
Uses shared NotificationIcon component."
```

---

## Task 11: Frontend — notification dropdown with filters

**Files:**
- Modify: `frontend/components/layout/NotificationDropdown.tsx`

- [ ] **Step 1: Rewrite NotificationDropdown**

Replace the entire file. Key changes:

1. Remove inline `NotificationIcon` — import from shared component
2. Remove old Tabs (All/Comments/Generations)
3. Add project dropdown + category toggle pills
4. Use store filters and detect stale data on open
5. Keep popover compact

```tsx
'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { NotificationIcon } from '@/components/ui/notification-icon'
import { useNotificationStore } from '@/lib/store/notifications'
import { projectsApi } from '@/lib/api/projects'  // exports getAll(): Promise<Project[]>
import type { Notification } from '@/lib/types'
import { cn } from '@/lib/utils'

const CATEGORIES = [
  { key: 'feedback' as const, label: 'Отзывы', types: ['comment_new', 'reaction_new'] },
  { key: 'content' as const, label: 'Контент', types: ['generation_completed', 'generation_failed', 'upload_completed'] },
]

type CategoryKey = typeof CATEGORIES[number]['key']

function relativeTime(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return 'Только что'
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`
  if (diff < 172800) return 'Вчера'
  return new Date(dateStr).toLocaleDateString('ru-RU')
}

function DropdownNotificationItem({
  notification,
  onClose,
}: {
  notification: Notification
  onClose: () => void
}) {
  const markRead = useNotificationStore((s) => s.markRead)
  const router = useRouter()

  function handleClick() {
    if (!notification.is_read) markRead(notification.id).catch(() => {})
    if (notification.project) {
      let url = `/projects/${notification.project}`
      if (notification.scene) url += `/groups/${notification.scene}`
      if (notification.element) url += `?lightbox=${notification.element}`
      router.push(url)
    }
    onClose()
  }

  return (
    <button
      onClick={handleClick}
      className={`w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-md transition-colors hover:bg-muted/60 ${
        !notification.is_read ? 'bg-primary/5' : ''
      }`}
    >
      <div className="mt-0.5">
        <NotificationIcon type={notification.type} size="sm" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground leading-snug truncate">
          {notification.title}
        </p>
        <p className="text-xs text-muted-foreground leading-snug mt-0.5 line-clamp-2">
          {notification.message}
        </p>
        <p className="text-[11px] text-muted-foreground/70 mt-1">
          {relativeTime(notification.created_at)}
        </p>
      </div>
    </button>
  )
}

interface NotificationDropdownProps {
  children: React.ReactNode
}

export function NotificationDropdown({ children }: NotificationDropdownProps) {
  const [open, setOpen] = useState(false)
  const notifications = useNotificationStore((s) => s.notifications)
  const unreadCount = useNotificationStore((s) => s.unreadCount)
  const markAllRead = useNotificationStore((s) => s.markAllRead)
  const fetchNotifications = useNotificationStore((s) => s.fetchNotifications)
  const filters = useNotificationStore((s) => s.filters)
  const setFilters = useNotificationStore((s) => s.setFilters)
  const lastFetchedFilters = useNotificationStore((s) => s.lastFetchedFilters)

  const [activeCategories, setActiveCategories] = useState<Set<CategoryKey>>(new Set())
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([])

  useEffect(() => {
    projectsApi.getAll().then(data => {
      setProjects(data.map(p => ({ id: p.id, name: p.name })));
    }).catch(() => {});
  }, [])

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      // Re-fetch if filters changed since last fetch or no data
      const filtersChanged = JSON.stringify(filters) !== JSON.stringify(lastFetchedFilters)
      if (notifications.length === 0 || filtersChanged) {
        fetchNotifications(0).catch(() => {})
      }
    }
  }

  function handleCategoryToggle(key: CategoryKey) {
    const next = new Set(activeCategories)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setActiveCategories(next)

    if (next.size === 0) {
      setFilters({ types: null })
    } else {
      const types = CATEGORIES.filter(c => next.has(c.key)).flatMap(c => c.types)
      setFilters({ types: [...types] })
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
          <span className="text-sm font-semibold">Уведомления</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => markAllRead().catch(() => {})}
            >
              Прочитать все
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-wrap">
          <select
            value={filters.projectId ?? ''}
            onChange={(e) => setFilters({ projectId: e.target.value ? Number(e.target.value) : null })}
            className="px-2 py-1 text-xs bg-background border border-input rounded-md focus:outline-none max-w-[120px]"
          >
            <option value="">Все проекты</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => handleCategoryToggle(cat.key)}
              className={cn(
                'px-2 py-0.5 rounded-full text-xs font-medium transition-all',
                activeCategories.has(cat.key)
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border text-muted-foreground hover:text-foreground'
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="max-h-[360px] overflow-y-auto px-1">
          {notifications.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">Уведомлений пока нет</p>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5 py-1">
              {notifications.slice(0, 10).map((n) => (
                <DropdownNotificationItem key={n.id} notification={n} onClose={() => setOpen(false)} />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-3 py-2">
          <Link
            href="/cabinet/notifications"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>Все уведомления</span>
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.75} />
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
docker compose exec frontend npm run build 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/layout/NotificationDropdown.tsx
git commit -m "feat(notifications): replace dropdown tabs with project dropdown + category toggles

Shared filters synced via store. Re-fetches on open if filters changed.
Uses shared NotificationIcon component."
```

---

## Task 12: Final verification

- [ ] **Step 1: Full frontend build**

```bash
docker compose exec frontend npm run build
```

Expected: Build succeeds.

- [ ] **Step 2: Backend check — migrations and imports**

```bash
docker compose exec backend python manage.py check --deploy 2>&1 | head -20
docker compose exec backend python manage.py showmigrations notifications
```

- [ ] **Step 3: Manual smoke test checklist**

Test in browser:
1. Open share dialog from workspace — verify toggle pills appear with counts
2. Toggle filters — verify element count updates, pills highlight correctly
3. Create shared link with filters active — verify correct elements are shared
4. Open notification bell — verify project dropdown and category pills
5. Toggle category in bell — verify list filters
6. Open `/cabinet/notifications` — verify same filters work
7. React to element on public share — verify notification has ThumbsUp icon (not comment icon)
8. Upload a file — verify "Файл загружен" notification appears

- [ ] **Step 4: Commit any remaining fixes if needed**
