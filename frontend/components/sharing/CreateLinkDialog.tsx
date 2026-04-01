'use client'

import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Copy, Image, Video, Star } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { sharingApi } from '@/lib/api/sharing'
import { useDisplayStore } from '@/lib/store/project-display'
import { cn } from '@/lib/utils'

interface ShareableElement {
  id: number
  element_type: string
  is_favorite: boolean
}

interface CreateLinkDialogProps {
  isOpen: boolean
  onClose: () => void
  onCreated?: () => void
  projectId: number
  /** Full pool of element IDs (may or may not have metadata) */
  elementIds: number[]
  /** Element metadata for filtering — if provided, filters are shown */
  elements?: ShareableElement[]
}

type FilterType = 'all' | 'images' | 'videos' | 'favorites'

const EXPIRY_OPTIONS = [
  { label: 'Без ограничений', value: '' },
  { label: '7 дней', value: '7' },
  { label: '30 дней', value: '30' },
]

const FILTERS: { key: FilterType; label: string; icon: React.ElementType }[] = [
  { key: 'all', label: 'Все', icon: Copy },
  { key: 'images', label: 'Фото', icon: Image },
  { key: 'videos', label: 'Видео', icon: Video },
  { key: 'favorites', label: 'Избранное', icon: Star },
]

export function CreateLinkDialog({
  isOpen,
  onClose,
  onCreated,
  projectId,
  elementIds,
  elements,
}: CreateLinkDialogProps) {
  const [name, setName] = useState('')
  const [expiry, setExpiry] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { preferences } = useDisplayStore()

  const hasMetadata = !!elements && elements.length > 0

  const filteredIds = useMemo(() => {
    if (!hasMetadata || filter === 'all') return elementIds
    return elements!
      .filter(el => {
        if (filter === 'images') return el.element_type === 'IMAGE'
        if (filter === 'videos') return el.element_type === 'VIDEO'
        if (filter === 'favorites') return el.is_favorite
        return true
      })
      .map(el => el.id)
  }, [elementIds, elements, filter, hasMetadata])

  const filterCounts = useMemo(() => {
    if (!hasMetadata) return null
    return {
      all: elements!.length,
      images: elements!.filter(el => el.element_type === 'IMAGE').length,
      videos: elements!.filter(el => el.element_type === 'VIDEO').length,
      favorites: elements!.filter(el => el.is_favorite).length,
    }
  }, [elements, hasMetadata])

  function buildExpiresAt(days: string): string | undefined {
    if (!days) return undefined
    const date = new Date()
    date.setDate(date.getDate() + Number(days))
    return date.toISOString()
  }

  async function handleSubmit() {
    if (filteredIds.length === 0) {
      toast.error('Нет элементов для шеринга')
      return
    }
    setIsSubmitting(true)
    try {
      const link = await sharingApi.createLink({
        project: projectId,
        element_ids: filteredIds,
        name: name.trim() || undefined,
        expires_at: buildExpiresAt(expiry),
        display_preferences: preferences,
      })

      const fullUrl = `${window.location.origin}${link.url}`
      await navigator.clipboard.writeText(fullUrl)
      toast.success('Ссылка скопирована')
      handleClose()
      onCreated?.()
    } catch {
      toast.error('Не удалось создать ссылку')
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleClose() {
    setName('')
    setExpiry('')
    setFilter('all')
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Создать ссылку для просмотра</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Filter tabs — only if metadata available */}
          {hasMetadata && filterCounts && (
            <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
              {FILTERS.map(({ key, label, icon: Icon }) => {
                const count = filterCounts[key]
                if (key !== 'all' && count === 0) return null
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={cn(
                      'flex items-center gap-1.5 flex-1 justify-center px-2 py-1.5 rounded-md text-xs font-medium transition-all',
                      filter === key
                        ? 'bg-background shadow-sm text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{label}</span>
                    <span className="text-muted-foreground/70">{count}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Count */}
          <p className="text-sm text-muted-foreground tabular-nums">
            {filteredIds.length === 0
              ? 'Нет элементов по фильтру'
              : `${filteredIds.length} ${filteredIds.length === 1 ? 'элемент' : filteredIds.length < 5 ? 'элемента' : 'элементов'} будет доступно по ссылке`}
          </p>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="link-name">
              Название
              <span className="text-muted-foreground font-normal ml-1">(необязательно)</span>
            </label>
            <input
              id="link-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ревью клиента, Финальные кадры..."
              className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="link-expiry">
              Срок действия
            </label>
            <select
              id="link-expiry"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {EXPIRY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || filteredIds.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Copy className="w-4 h-4" />
            {isSubmitting ? 'Создание...' : 'Создать и скопировать'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
