# Filters Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix broken project/group sharing, redesign sharing filter pills into labeled rows, simplify notification dropdown to plain list, convert notification page filters from pills to tabs.

**Architecture:** Fix sharing bugs first (data flow), then redesign CreateLinkDialog filters (layout change, same logic), then simplify NotificationDropdown (remove filters), then convert notification page to tabs + styled project dropdown, then clean up store.

**Tech Stack:** Next.js 14, React 19, Zustand 5, Tailwind 4, shadcn/ui

**UX Spec:** `docs/ux-analyses/2026-04-05-notification-sharing-filters-redesign.md`
**Mockup:** pen node `lngsZ` in `pen/pencil-new.pen`

**IMPORTANT:** All commands run inside Docker containers per CLAUDE.md. Never install anything on host.

---

## File Map

| Action | File | What changes |
|--------|------|--------------|
| Modify | `frontend/components/project/ProjectCard.tsx:41,144-152,224-229` | Fetch elements before opening CreateLinkDialog |
| Modify | `frontend/components/element/WorkspaceContainer.tsx:105-106,538-542,985-990` | Fetch group elements before opening dialog |
| Modify | `frontend/components/sharing/CreateLinkDialog.tsx:48-79,140-175` | Replace inline pills with labeled rows |
| Modify | `frontend/components/layout/NotificationDropdown.tsx` | Strip all filters, return to plain list |
| Modify | `frontend/app/(cabinet)/cabinet/notifications/page.tsx` | Pills → tabs, select → styled dropdown |
| Modify | `frontend/lib/store/notifications.ts` | Simplify: activeTab + projectId, remove lastFetchedFilters |

---

## Task 1: Fix ProjectCard sharing — fetch elements before dialog

**Files:**
- Modify: `frontend/components/project/ProjectCard.tsx`

- [ ] **Step 1: Add sharingApi import and loading state**

Add import at top (after line 25):
```typescript
import { sharingApi } from "@/lib/api/sharing";
```

Add state (after line 41):
```typescript
const [shareLoading, setShareLoading] = useState(false);
const [shareElements, setShareElements] = useState<Array<{ id: number; element_type: string; is_favorite: boolean; source_type: string }>>([]);
```

- [ ] **Step 2: Replace the menu item click handler**

Find the share menu item (around line 144-152). Currently it just does `setShareOpen(true)`. Replace the `onSelect` handler:

```typescript
onSelect={async (e) => {
  e.preventDefault();
  setShareLoading(true);
  try {
    const els = await sharingApi.getProjectElements(project.id);
    if (els.length === 0) { toast.error('В проекте нет элементов'); return; }
    setShareElements(els);
    setShareOpen(true);
  } catch { toast.error('Не удалось загрузить элементы'); }
  finally { setShareLoading(false); }
}}
```

- [ ] **Step 3: Update CreateLinkDialog props**

Replace lines 224-229:
```tsx
<CreateLinkDialog
  isOpen={shareOpen}
  onClose={() => { setShareOpen(false); setShareElements([]); }}
  projectId={project.id}
  elementIds={shareElements.map(e => e.id)}
  elements={shareElements}
/>
```

- [ ] **Step 4: Verify build**

```bash
docker compose exec frontend npx tsc --noEmit 2>&1 | grep "ProjectCard" | head -5
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/project/ProjectCard.tsx
git commit -m "fix(sharing): fetch elements before opening share dialog from ProjectCard

ProjectCard was passing elementIds=[] to CreateLinkDialog, making sharing
from project three-dot menu impossible."
```

---

## Task 2: Fix group sharing — fetch group elements before dialog

**Files:**
- Modify: `frontend/components/element/WorkspaceContainer.tsx`

- [ ] **Step 1: Update handleGroupShare to fetch elements**

Replace the current `handleGroupShare` (lines 538-542):

```typescript
const [groupShareElements, setGroupShareElements] = useState<Array<{ id: number; element_type: string; is_favorite: boolean; source_type: string }>>([]);

const handleGroupShare = useCallback(async (groupIdToShare: number) => {
  try {
    const els = await sharingApi.getGroupElements(groupIdToShare);
    if (els.length === 0) { toast.error('В группе нет элементов'); return; }
    setGroupShareElements(els);
    setGroupShareProjectId(projectId);
    setGroupShareOpen(true);
  } catch { toast.error('Не удалось загрузить элементы'); }
}, [projectId]);
```

Note: `sharingApi` is already imported in this file.

- [ ] **Step 2: Update the CreateLinkDialog for group share**

Replace lines 985-990:
```tsx
<CreateLinkDialog
  isOpen={groupShareOpen}
  onClose={() => { setGroupShareOpen(false); setGroupShareElements([]); }}
  projectId={groupShareProjectId}
  elementIds={groupShareElements.map(e => e.id)}
  elements={groupShareElements}
/>
```

- [ ] **Step 3: Verify build**

```bash
docker compose exec frontend npx tsc --noEmit 2>&1 | grep "WorkspaceContainer" | head -5
```

- [ ] **Step 4: Commit**

```bash
git add frontend/components/element/WorkspaceContainer.tsx
git commit -m "fix(sharing): fetch group elements before opening share dialog

Group share from three-dot menu was passing elementIds=[] to CreateLinkDialog."
```

---

## Task 3: Redesign CreateLinkDialog filters — labeled rows

**Files:**
- Modify: `frontend/components/sharing/CreateLinkDialog.tsx`

- [ ] **Step 1: Replace FilterPill component with labeled row layout**

The `FilterPill` component (lines 48-79) stays mostly the same but we modify the hiding logic. Change `disabled && 'opacity-40 pointer-events-none'` to just not render (handled in parent).

- [ ] **Step 2: Replace pillCounts with simple counts**

Replace the `pillCounts` useMemo (lines 109-137) with simple per-type counts:

```typescript
const simpleCounts = useMemo(() => {
  if (!hasMetadata) return null
  return {
    generated: elements!.filter(e => e.source_type === 'GENERATED').length,
    uploaded: elements!.filter(e => e.source_type === 'UPLOADED').length,
    images: elements!.filter(e => e.element_type === 'IMAGE').length,
    videos: elements!.filter(e => e.element_type === 'VIDEO').length,
    favorites: elements!.filter(e => e.is_favorite).length,
  }
}, [elements, hasMetadata])
```

- [ ] **Step 3: Replace filter JSX with labeled rows**

Replace the entire filter pills section (lines 140-175) with:

```tsx
{hasMetadata && simpleCounts && (
  <div className="space-y-2.5">
    {/* Source row — hide if only one source type exists */}
    {(simpleCounts.generated > 0 && simpleCounts.uploaded > 0) && (
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-muted-foreground font-medium w-16 shrink-0">Источник</span>
        <div className="flex gap-1.5">
          <FilterPill
            label="Генерации"
            count={simpleCounts.generated}
            active={sourceFilter.has('GENERATED')}
            onClick={() => setSourceFilter(s => toggleInSet(s, 'GENERATED'))}
          />
          <FilterPill
            label="Загрузки"
            count={simpleCounts.uploaded}
            active={sourceFilter.has('UPLOADED')}
            onClick={() => setSourceFilter(s => toggleInSet(s, 'UPLOADED'))}
          />
        </div>
      </div>
    )}
    {/* Type row — hide if only one type exists */}
    {(simpleCounts.images > 0 && simpleCounts.videos > 0) && (
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-muted-foreground font-medium w-16 shrink-0">Тип</span>
        <div className="flex gap-1.5">
          <FilterPill
            label="Фото"
            count={simpleCounts.images}
            active={typeFilter.has('IMAGE')}
            onClick={() => setTypeFilter(s => toggleInSet(s, 'IMAGE'))}
          />
          <FilterPill
            label="Видео"
            count={simpleCounts.videos}
            active={typeFilter.has('VIDEO')}
            onClick={() => setTypeFilter(s => toggleInSet(s, 'VIDEO'))}
          />
        </div>
      </div>
    )}
    {/* Favorites row — hide if no favorites */}
    {simpleCounts.favorites > 0 && (
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-muted-foreground font-medium w-16 shrink-0">Статус</span>
        <div className="flex gap-1.5">
          <FilterPill
            label="Избранное"
            count={simpleCounts.favorites}
            active={favoriteFilter}
            onClick={() => setFavoriteFilter(f => !f)}
          />
        </div>
      </div>
    )}
  </div>
)}
```

- [ ] **Step 4: Update FilterPill — remove disabled logic**

Since pills with 0 count are now hidden by parent, remove the `disabled` prop handling from FilterPill. The component becomes:

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
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all',
        active
          ? 'bg-primary text-primary-foreground'
          : 'border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
      )}
    >
      {label}
      <span className={cn('tabular-nums', active ? 'text-primary-foreground/70' : 'text-muted-foreground/60')}>
        {count}
      </span>
    </button>
  )
}
```

- [ ] **Step 5: Verify build**

```bash
docker compose exec frontend npx tsc --noEmit 2>&1 | grep "CreateLinkDialog" | head -5
```

- [ ] **Step 6: Commit**

```bash
git add frontend/components/sharing/CreateLinkDialog.tsx
git commit -m "feat(sharing): redesign filter pills into labeled rows

Three rows with labels (Источник / Тип / Статус) instead of 5 inline pills.
Rows with only one option hide entirely. Simple counts instead of cross-axis."
```

---

## Task 4: Simplify NotificationDropdown — remove all filters

**Files:**
- Modify: `frontend/components/layout/NotificationDropdown.tsx`

- [ ] **Step 1: Rewrite to plain list**

Replace entire file content with simplified version. Remove:
- CATEGORIES, CategoryKey, activeCategories state
- projectsApi import and projects state/effect
- Filter section JSX (select + pills)
- handleCategoryToggle
- filters/setFilters/lastFetchedFilters from store subscriptions

Keep:
- relativeTime function
- NotificationItem with NotificationIcon
- Popover with header/list/footer
- handleOpenChange (simplified: just fetch if empty)
- markAllRead button

The simplified `NotificationDropdown`:

```tsx
'use client'

import { useState } from 'react'
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
import type { Notification } from '@/lib/types'

function relativeTime(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return 'Только что'
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`
  if (diff < 172800) return 'Вчера'
  return new Date(dateStr).toLocaleDateString('ru-RU')
}

function NotificationItem({
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

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next && notifications.length === 0) {
      fetchNotifications(0).catch(() => {})
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

        {/* List */}
        <div className="max-h-[360px] overflow-y-auto px-1">
          {notifications.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">Уведомлений пока нет</p>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5 py-1">
              {notifications.slice(0, 10).map((n) => (
                <NotificationItem key={n.id} notification={n} onClose={() => setOpen(false)} />
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
docker compose exec frontend npx tsc --noEmit 2>&1 | grep "NotificationDropdown" | head -5
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/layout/NotificationDropdown.tsx
git commit -m "feat(notifications): simplify dropdown to plain list without filters

Remove project dropdown, category pills, and filter sync.
Bell dropdown = quick glance: header + 10 notifications + footer link."
```

---

## Task 5: Simplify notification store

**Files:**
- Modify: `frontend/lib/store/notifications.ts`

- [ ] **Step 1: Replace store with simpler filter model**

Replace entire file:

```typescript
import { create } from "zustand";
import { notificationsApi } from "@/lib/api/notifications";
import type { Notification } from "@/lib/types";

type NotificationTab = 'all' | 'feedback' | 'content';

const TAB_TYPES: Record<NotificationTab, string[] | null> = {
  all: null,
  feedback: ['comment_new', 'reaction_new'],
  content: ['generation_completed', 'generation_failed', 'upload_completed'],
};

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  hasMore: boolean;
  isLoading: boolean;
  error: boolean;
  activeTab: NotificationTab;
  projectId: number | null;

  fetchUnreadCount: () => Promise<void>;
  fetchNotifications: (offset?: number) => Promise<void>;
  setActiveTab: (tab: NotificationTab) => void;
  setProjectId: (id: number | null) => void;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  addNotification: (notification: Notification) => void;
}

export type { NotificationTab };

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  hasMore: false,
  isLoading: false,
  error: false,
  activeTab: 'all',
  projectId: null,

  fetchUnreadCount: async () => {
    try {
      const count = await notificationsApi.unreadCount();
      set({ unreadCount: count });
    } catch {
      // silently ignore — unread badge is non-critical
    }
  },

  fetchNotifications: async (offset = 0) => {
    const { activeTab, projectId } = get();
    set({ isLoading: true, error: false });
    try {
      const params: Record<string, unknown> = { offset };
      if (projectId) params.project = projectId;
      const types = TAB_TYPES[activeTab];
      if (types) params.type = types.join(',');

      const data = await notificationsApi.list(params as any);
      set((state) => ({
        notifications:
          offset === 0
            ? data.results
            : [...state.notifications, ...data.results],
        hasMore: data.has_more,
        isLoading: false,
      }));
    } catch {
      set({ isLoading: false, error: offset === 0 });
    }
  },

  setActiveTab: (tab) => {
    set({ activeTab: tab });
    get().fetchNotifications(0);
  },

  setProjectId: (id) => {
    set({ projectId: id });
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

- [ ] **Step 2: Verify build**

```bash
docker compose exec frontend npx tsc --noEmit 2>&1 | tail -10
```

Note: This may show errors in notifications page which still imports old filter types — that's expected, fixed in Task 6.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/store/notifications.ts
git commit -m "feat(notifications): simplify store — activeTab + projectId instead of generic filters

Remove NotificationFilters, lastFetchedFilters, setFilters.
Add activeTab (all/feedback/content), setActiveTab, setProjectId.
TAB_TYPES maps tab to API type parameter."
```

---

## Task 6: Notifications page — tabs + styled project dropdown

**Files:**
- Modify: `frontend/app/(cabinet)/cabinet/notifications/page.tsx`

- [ ] **Step 1: Rewrite page with tabs and project dropdown**

Replace entire file:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BellOff, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { NotificationIcon } from "@/components/ui/notification-icon";
import { useNotificationStore } from "@/lib/store/notifications";
import type { NotificationTab } from "@/lib/store/notifications";
import { projectsApi } from "@/lib/api/projects";
import { cn } from "@/lib/utils";
import type { Notification } from "@/lib/types";

/* ── Tabs config ───────────────────────────────────────── */

const TABS: { id: NotificationTab; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "feedback", label: "Отзывы" },
  { id: "content", label: "Контент" },
];

/* ── Relative time ─────────────────────────────────────── */

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
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/* ── Single notification row ───────────────────────────── */

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

/* ── Skeleton ──────────────────────────────────────────── */

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

/* ── Page ──────────────────────────────────────────────── */

export default function NotificationsPage() {
  const router = useRouter();
  const {
    notifications, hasMore, isLoading, error,
    activeTab, projectId,
    setActiveTab, setProjectId,
    fetchNotifications, markRead, markAllRead,
  } = useNotificationStore();

  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    fetchNotifications(0);
  }, [fetchNotifications]);

  useEffect(() => {
    projectsApi.getAll().then(data => {
      setProjects(data.map(p => ({ id: p.id, name: p.name })));
    }).catch(() => {});
  }, []);

  const handleRead = async (n: Notification) => {
    if (!n.is_read) await markRead(n.id);
    if (n.project) {
      let url = `/projects/${n.project}`;
      if (n.scene) url += `/groups/${n.scene}`;
      if (n.element) url += `?lightbox=${n.element}`;
      router.push(url);
    }
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

      {/* Tabs + Project dropdown */}
      <div className="flex items-center justify-between">
        <div className="flex gap-0 border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-4 py-2 text-xs font-medium transition-colors",
                activeTab === tab.id
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {projects.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              value={projectId ?? ''}
              onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
              className="px-3 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring appearance-none cursor-pointer"
            >
              <option value="">Все проекты</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}
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
            onClick={() => fetchNotifications(notifications.length)}
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

- [ ] **Step 2: Verify full build**

```bash
docker compose exec frontend npx tsc --noEmit 2>&1 | tail -10
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/\(cabinet\)/cabinet/notifications/page.tsx
git commit -m "feat(notifications): tabs + project dropdown on notifications page

Mutual-exclusive tabs (Все / Отзывы / Контент) instead of additive pills.
Styled project dropdown on the right. Filtering via API, not in-memory."
```

---

## Task 7: Final verification

- [ ] **Step 1: Full frontend build**

```bash
docker compose exec frontend npm run build
```

Expected: Build succeeds.

- [ ] **Step 2: Backend check**

```bash
docker compose exec backend python manage.py check
```

Expected: No issues.

- [ ] **Step 3: Manual smoke test checklist**

1. Open project three-dot menu → "Поделиться" → dialog opens with elements loaded, filters visible
2. Open group three-dot menu → "Поделиться" → dialog opens with group elements loaded
3. In share dialog: see labeled rows (Источник / Тип / Статус), toggle pills, count updates
4. Click bell → clean list without filters, "Все уведомления →" link
5. Open `/cabinet/notifications` → tabs (Все / Отзывы / Контент), project dropdown
6. Switch tabs → list refetches from API
7. Select project → list filters to that project
