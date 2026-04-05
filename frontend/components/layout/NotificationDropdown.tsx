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
import { projectsApi } from '@/lib/api/projects'
import { cn } from '@/lib/utils'
import type { Notification } from '@/lib/types'

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
      // Build URL: navigate to group if element has a scene, then open lightbox
      let url = `/projects/${notification.project}`
      if (notification.scene) {
        url += `/groups/${notification.scene}`
      }
      if (notification.element) {
        url += `?lightbox=${notification.element}`
      }
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
      setProjects(data.map(p => ({ id: p.id, name: p.name })))
    }).catch(() => {})
  }, [])

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      const filtersChanged = JSON.stringify(filters) !== JSON.stringify(lastFetchedFilters)
      if (notifications.length === 0 || filtersChanged) {
        fetchNotifications(0).catch(() => {})
      }
    }
  }

  function handleMarkAllRead() {
    markAllRead().catch(() => {})
  }

  function handleCategoryToggle(key: CategoryKey) {
    const next = new Set(activeCategories)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setActiveCategories(next)

    if (next.size === 0) {
      setFilters({ types: null })
    } else {
      const types = CATEGORIES.filter(c => next.has(c.key)).flatMap(c => [...c.types])
      setFilters({ types })
    }
  }

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
