'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MessageCircle, Check, XCircle, ChevronRight } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useNotificationStore } from '@/lib/store/notifications'
import type { Notification, NotificationType } from '@/lib/types'

function relativeTime(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return 'Только что'
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`
  if (diff < 172800) return 'Вчера'
  return new Date(dateStr).toLocaleDateString('ru-RU')
}

function NotificationIcon({ type }: { type: NotificationType }) {
  if (type === 'comment_new') {
    return <MessageCircle className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
  }
  if (type === 'generation_completed') {
    return <Check className="h-4 w-4 shrink-0 text-success" strokeWidth={1.75} />
  }
  return <XCircle className="h-4 w-4 shrink-0 text-destructive" strokeWidth={1.75} />
}

interface NotificationItemProps {
  notification: Notification
  onClose: () => void
}

function NotificationItem({ notification, onClose }: NotificationItemProps) {
  const markRead = useNotificationStore((s) => s.markRead)
  const router = useRouter()

  function handleClick() {
    if (!notification.is_read) {
      markRead(notification.id).catch(() => {})
    }
    if (notification.project) {
      router.push(`/projects/${notification.project}`)
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
        <NotificationIcon type={notification.type} />
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

interface NotificationListProps {
  notifications: Notification[]
  onClose: () => void
}

function NotificationList({ notifications, onClose }: NotificationListProps) {
  if (notifications.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-muted-foreground">Уведомлений пока нет</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0.5 py-1">
      {notifications.slice(0, 10).map((n) => (
        <NotificationItem key={n.id} notification={n} onClose={onClose} />
      ))}
    </div>
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

  function handleMarkAllRead() {
    markAllRead().catch(() => {})
  }

  const comments = notifications.filter((n) => n.type === 'comment_new')
  const generations = notifications.filter(
    (n) => n.type === 'generation_completed' || n.type === 'generation_failed'
  )

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 p-0 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
          <span className="text-sm font-semibold">Уведомления</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleMarkAllRead}
            >
              Прочитать все
            </Button>
          )}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="all">
          <TabsList className="w-full rounded-none border-b border-border h-9 bg-transparent gap-0 px-2">
            <TabsTrigger
              value="all"
              className="flex-1 text-xs h-7 rounded-sm data-[state=active]:bg-muted"
            >
              Все
            </TabsTrigger>
            <TabsTrigger
              value="comments"
              className="flex-1 text-xs h-7 rounded-sm data-[state=active]:bg-muted"
            >
              Комментарии
            </TabsTrigger>
            <TabsTrigger
              value="generations"
              className="flex-1 text-xs h-7 rounded-sm data-[state=active]:bg-muted"
            >
              Генерации
            </TabsTrigger>
          </TabsList>

          <div className="max-h-[360px] overflow-y-auto px-1">
            <TabsContent value="all" className="mt-0">
              <NotificationList notifications={notifications} onClose={() => setOpen(false)} />
            </TabsContent>
            <TabsContent value="comments" className="mt-0">
              <NotificationList notifications={comments} onClose={() => setOpen(false)} />
            </TabsContent>
            <TabsContent value="generations" className="mt-0">
              <NotificationList notifications={generations} onClose={() => setOpen(false)} />
            </TabsContent>
          </div>
        </Tabs>

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
