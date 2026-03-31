'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Link, Copy, Trash2 } from 'lucide-react'
import { sharingApi } from '@/lib/api/sharing'
import type { SharedLink } from '@/lib/types'

interface ShareLinksPanelProps {
  projectId: number
}

export function ShareLinksPanel({ projectId }: ShareLinksPanelProps) {
  const [links, setLinks] = useState<SharedLink[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchLinks = useCallback(async () => {
    try {
      const data = await sharingApi.getLinks(projectId)
      setLinks(data)
    } catch {
      toast.error('Не удалось загрузить ссылки')
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchLinks()
  }, [fetchLinks])

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Ссылка скопирована')
    } catch {
      toast.error('Не удалось скопировать')
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm('Удалить ссылку? Доступ по ней будет закрыт.')) return
    try {
      await sharingApi.deleteLink(id)
      toast.success('Ссылка удалена')
      setLinks((prev) => prev.filter((l) => l.id !== id))
    } catch {
      toast.error('Не удалось удалить ссылку')
    }
  }

  if (isLoading) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        Загрузка...
      </div>
    )
  }

  if (links.length === 0) {
    return (
      <div className="py-6 text-center">
        <Link className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Нет активных ссылок</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {links.map((link) => (
        <LinkRow
          key={link.id}
          link={link}
          onCopy={handleCopy}
          onDelete={handleDelete}
        />
      ))}
    </div>
  )
}

interface LinkRowProps {
  link: SharedLink
  onCopy: (url: string) => void
  onDelete: (id: number) => void
}

function LinkRow({ link, onCopy, onDelete }: LinkRowProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-md border border-border bg-muted/30 hover:bg-muted/50 transition-colors group">
      <Link className="w-4 h-4 text-muted-foreground flex-shrink-0" />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {link.name || 'Без названия'}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatLinkMeta(link)}
        </p>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => onCopy(link.url)}
          title="Скопировать ссылку"
          className="p-1.5 rounded hover:bg-background text-muted-foreground hover:text-foreground transition-colors"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(link.id)}
          title="Удалить ссылку"
          className="p-1.5 rounded hover:bg-background text-muted-foreground hover:text-destructive transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

function formatLinkMeta(link: SharedLink): string {
  const parts: string[] = []

  if (link.element_count != null) {
    parts.push(`${link.element_count} эл.`)
  }

  if (link.comment_count != null && link.comment_count > 0) {
    parts.push(`${link.comment_count} комм.`)
  }

  parts.push(formatRelativeDate(link.created_at))

  if (link.expires_at) {
    const exp = new Date(link.expires_at)
    if (exp < new Date()) {
      parts.push('истекла')
    } else {
      parts.push(`до ${exp.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`)
    }
  }

  return parts.join(' · ')
}

function formatRelativeDate(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'сегодня'
  if (diffDays === 1) return 'вчера'
  if (diffDays < 7) return `${diffDays} дн. назад`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} нед. назад`
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}
