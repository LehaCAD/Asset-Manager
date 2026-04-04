"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, CheckCircle2, XCircle, BellOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotificationStore } from "@/lib/store/notifications";
import type { Notification, NotificationType } from "@/lib/types";

/* ── Tabs ───────────────────────────────────────────────── */

type Tab = "all" | "comments" | "generations";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "comments", label: "Комментарии" },
  { id: "generations", label: "Генерации" },
];

function matchesTab(type: NotificationType, tab: Tab): boolean {
  if (tab === "all") return true;
  if (tab === "comments") return type === "comment_new";
  if (tab === "generations")
    return type === "generation_completed" || type === "generation_failed";
  return false;
}

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

/* ── Icon by type ───────────────────────────────────────── */

function NotificationIcon({ type }: { type: NotificationType }) {
  if (type === "comment_new")
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <MessageCircle className="h-4 w-4 text-primary" />
      </div>
    );
  if (type === "generation_completed")
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/10">
        <CheckCircle2 className="h-4 w-4 text-success" />
      </div>
    );
  if (type === "generation_failed")
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10">
        <XCircle className="h-4 w-4 text-destructive" />
      </div>
    );
  return null;
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
  const { notifications, hasMore, isLoading, fetchNotifications, markRead, markAllRead } =
    useNotificationStore();

  const [activeTab, setActiveTab] = useState<Tab>("all");

  useEffect(() => {
    fetchNotifications(0);
  }, [fetchNotifications]);

  const filtered = notifications.filter((n) => matchesTab(n.type, activeTab));

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

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="rounded-md border border-border bg-card shadow-[var(--shadow-card)] overflow-hidden">
        {isLoading && notifications.length === 0 ? (
          <div className="divide-y divide-border/50">
            {[...Array(5)].map((_, i) => (
              <NotificationSkeleton key={i} />
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className="divide-y divide-border/50">
            {filtered.map((n) => (
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
