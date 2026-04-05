'use client'

import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Copy } from 'lucide-react'
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
  source_type: string
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

const EXPIRY_OPTIONS = [
  { label: 'Без ограничений', value: '' },
  { label: '7 дней', value: '7' },
  { label: '30 дней', value: '30' },
]

function toggleInSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

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
  const [sourceFilter, setSourceFilter] = useState<Set<string>>(new Set())
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set())
  const [favoriteFilter, setFavoriteFilter] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { preferences } = useDisplayStore()

  const hasMetadata = !!elements && elements.length > 0

  const filteredIds = useMemo(() => {
    if (!hasMetadata) return elementIds
    return elements!.filter(el => {
      if (sourceFilter.size > 0 && !sourceFilter.has(el.source_type)) return false
      if (typeFilter.size > 0 && !typeFilter.has(el.element_type)) return false
      if (favoriteFilter && !el.is_favorite) return false
      return true
    }).map(el => el.id)
  }, [elements, elementIds, sourceFilter, typeFilter, favoriteFilter, hasMetadata])

  const pillCounts = useMemo(() => {
    if (!hasMetadata) return null

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
    setSourceFilter(new Set())
    setTypeFilter(new Set())
    setFavoriteFilter(false)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Создать ссылку для просмотра</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Filter pills — only if metadata available */}
          {hasMetadata && pillCounts && (
            <div className="flex items-center gap-1.5 flex-wrap">
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
              <FilterPill
                label="Избранное"
                count={pillCounts.favorites}
                active={favoriteFilter}
                onClick={() => setFavoriteFilter(f => !f)}
              />
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
