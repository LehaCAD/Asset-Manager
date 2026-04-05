"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BellOff, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { NotificationIcon } from "@/components/ui/notification-icon";
import { useNotificationStore } from "@/lib/store/notifications";
import { projectsApi } from "@/lib/api/projects";
import { cn } from "@/lib/utils";
import type { Notification } from "@/lib/types";

/* ── Category filter config ────────────────────────────────── */

const CATEGORIES = [
  { key: 'feedback' as const, label: 'Отзывы', types: ['comment_new', 'reaction_new'] },
  { key: 'content' as const, label: 'Контент', types: ['generation_completed', 'generation_failed', 'upload_completed'] },
] as const;

type CategoryKey = typeof CATEGORIES[number]['key'];

/* ── Relative time ──────────────────────────────────────── */

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

/* ── Single notification row ────────────────────────────── */

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

/* ── Skeleton loader ────────────────────────────────────── */

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

/* ── Page ───────────────────────────────────────────────── */

export default function NotificationsPage() {
  const router = useRouter();
  const {
    notifications, hasMore, isLoading, error,
    filters, setFilters,
    fetchNotifications, markRead, markAllRead,
  } = useNotificationStore();

  const [activeCategories, setActiveCategories] = useState<Set<CategoryKey>>(new Set());
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    fetchNotifications(0);
  }, [fetchNotifications]);

  // Fetch projects for dropdown
  useEffect(() => {
    projectsApi.getAll().then(data => {
      setProjects(data.map(p => ({ id: p.id, name: p.name })));
    }).catch(() => {});
  }, []);

  function handleCategoryToggle(key: CategoryKey) {
    const next = new Set(activeCategories);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setActiveCategories(next);

    if (next.size === 0) {
      setFilters({ types: null });
    } else {
      const types = CATEGORIES.filter(c => next.has(c.key)).flatMap(c => [...c.types]);
      setFilters({ types });
    }
  }

  function handleProjectChange(projectId: number | null) {
    setFilters({ projectId });
  }

  const handleRead = async (n: Notification) => {
    if (!n.is_read) await markRead(n.id);
    if (n.project) {
      let url = `/projects/${n.project}`
      if (n.scene) url += `/groups/${n.scene}`
      if (n.element) url += `?lightbox=${n.element}`
      router.push(url)
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

      {/* Inline loader for load-more */}
      {isLoading && notifications.length > 0 && (
        <div className="flex justify-center py-2">
          <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      )}
    </div>
  );
}
