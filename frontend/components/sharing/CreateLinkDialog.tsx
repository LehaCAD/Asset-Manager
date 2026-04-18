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
import { FilterPill, toggleInSet } from '@/components/ui/filter-pill'

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
    if (isSubmitting) return
    setIsSubmitting(true)
    let link
    try {
      link = await sharingApi.createLink({
        project: projectId,
        element_ids: filteredIds,
        name: name.trim() || undefined,
        expires_at: buildExpiresAt(expiry),
        display_preferences: preferences,
      })
    } catch {
      toast.error('Не удалось создать ссылку')
      setIsSubmitting(false)
      return
    }

    const fullUrl = `${window.location.origin}${link.url}`
    try {
      await navigator.clipboard.writeText(fullUrl)
      toast.success('Ссылка скопирована')
    } catch {
      toast.success('Ссылка создана — скопируйте её вручную')
    } finally {
      setIsSubmitting(false)
      handleClose()
      onCreated?.()
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
          {/* Filter rows — only if metadata available */}
          {hasMetadata && simpleCounts && (
            <div className="space-y-2.5">
              {/* Source row */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-muted-foreground font-medium w-16 shrink-0">Источник</span>
                <div className="flex gap-1.5">
                  {simpleCounts.generated > 0 && (
                    <FilterPill
                      label="Генерации"
                      count={simpleCounts.generated}
                      active={sourceFilter.has('GENERATED')}
                      onClick={() => setSourceFilter(s => toggleInSet(s, 'GENERATED'))}
                    />
                  )}
                  {simpleCounts.uploaded > 0 && (
                    <FilterPill
                      label="Загрузки"
                      count={simpleCounts.uploaded}
                      active={sourceFilter.has('UPLOADED')}
                      onClick={() => setSourceFilter(s => toggleInSet(s, 'UPLOADED'))}
                    />
                  )}
                </div>
              </div>
              {/* Type row */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-muted-foreground font-medium w-16 shrink-0">Тип</span>
                <div className="flex gap-1.5">
                  {simpleCounts.images > 0 && (
                    <FilterPill
                      label="Фото"
                      count={simpleCounts.images}
                      active={typeFilter.has('IMAGE')}
                      onClick={() => setTypeFilter(s => toggleInSet(s, 'IMAGE'))}
                    />
                  )}
                  {simpleCounts.videos > 0 && (
                    <FilterPill
                      label="Видео"
                      count={simpleCounts.videos}
                      active={typeFilter.has('VIDEO')}
                      onClick={() => setTypeFilter(s => toggleInSet(s, 'VIDEO'))}
                    />
                  )}
                </div>
              </div>
              {/* Favorites row */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-muted-foreground font-medium w-16 shrink-0">Статус</span>
                <div className="flex gap-1.5">
                  {simpleCounts.favorites > 0 ? (
                    <FilterPill
                      label="Избранное"
                      count={simpleCounts.favorites}
                      active={favoriteFilter}
                      onClick={() => setFavoriteFilter(f => !f)}
                    />
                  ) : (
                    <span className="text-[11px] text-muted-foreground/50">нет избранных</span>
                  )}
                </div>
              </div>
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
