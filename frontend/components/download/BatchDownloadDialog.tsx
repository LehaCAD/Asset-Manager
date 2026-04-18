'use client'

import { useMemo, useState } from 'react'
import { Download, Check } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FilterPill, toggleInSet } from '@/components/ui/filter-pill'
import { Progress } from '@/components/ui/progress'
import { useBatchDownload } from './use-batch-download'
import {
  formatFileSize,
  buildGroupPaths,
  MAX_DOWNLOAD_FILES,
  MAX_DOWNLOAD_BYTES,
  WARN_DOWNLOAD_BYTES,
  type DownloadableElement,
} from '@/lib/utils/zip'

interface BatchDownloadDialogProps {
  isOpen: boolean
  onClose: () => void
  projectName: string
  elements: DownloadableElement[]
  groups: Array<{ id: number; name: string; parent_id?: number | null; parent?: number | null }>
}

function getProgressMessage(stage: string, percent: number): string {
  if (stage === 'packing') return 'Почти готово, формируем архив...'
  if (percent < 30) return 'Собираем файлы...'
  if (percent < 70) return 'Добавляем в архив...'
  if (percent < 95) return 'Осталось совсем немного...'
  return 'Завершаем...'
}

export function BatchDownloadDialog({
  isOpen,
  onClose,
  projectName,
  elements,
  groups,
}: BatchDownloadDialogProps) {
  const [sourceFilter, setSourceFilter] = useState<Set<string>>(new Set())
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set())
  const [favoriteFilter, setFavoriteFilter] = useState(false)

  const { stage, progress, result, start, cancel, reset } = useBatchDownload()

  const isActive = stage === 'fetching' || stage === 'packing'
  const isDone = stage === 'done' || stage === 'error' || stage === 'cancelled'

  const filteredElements = useMemo(() => {
    return elements.filter(el => {
      if (sourceFilter.size > 0 && !sourceFilter.has(el.source_type)) return false
      if (typeFilter.size > 0 && !typeFilter.has(el.element_type)) return false
      if (favoriteFilter && !el.is_favorite) return false
      return true
    })
  }, [elements, sourceFilter, typeFilter, favoriteFilter])

  const counts = useMemo(() => ({
    generated: elements.filter(e => e.source_type === 'GENERATED').length,
    uploaded: elements.filter(e => e.source_type === 'UPLOADED').length,
    images: elements.filter(e => e.element_type === 'IMAGE').length,
    videos: elements.filter(e => e.element_type === 'VIDEO').length,
    favorites: elements.filter(e => e.is_favorite).length,
  }), [elements])

  const totalSize = useMemo(
    () => filteredElements.reduce((sum, e) => sum + (e.file_size ?? 0), 0),
    [filteredElements]
  )

  const overLimit = filteredElements.length > MAX_DOWNLOAD_FILES || totalSize > MAX_DOWNLOAD_BYTES

  function handleDownload() {
    const groupPaths = buildGroupPaths(groups)
    start(filteredElements, groupPaths, projectName)
  }

  function handleClose() {
    if (isActive) return
    reset()
    setSourceFilter(new Set())
    setTypeFilter(new Set())
    setFavoriteFilter(false)
    onClose()
  }

  const progressPercent = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose() }}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => { if (isActive) e.preventDefault() }}>
        <DialogHeader>
          <DialogTitle>Скачать архив</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Filters — hidden during download */}
          {stage === 'idle' && (
            <>
              <div className="space-y-2.5">
                {/* Source */}
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-muted-foreground font-medium w-16 shrink-0">Источник</span>
                  <div className="flex gap-1.5">
                    {counts.generated > 0 && (
                      <FilterPill
                        label="Генерации"
                        count={counts.generated}
                        active={sourceFilter.has('GENERATED')}
                        onClick={() => setSourceFilter(s => toggleInSet(s, 'GENERATED'))}
                      />
                    )}
                    {counts.uploaded > 0 && (
                      <FilterPill
                        label="Загрузки"
                        count={counts.uploaded}
                        active={sourceFilter.has('UPLOADED')}
                        onClick={() => setSourceFilter(s => toggleInSet(s, 'UPLOADED'))}
                      />
                    )}
                  </div>
                </div>
                {/* Type */}
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-muted-foreground font-medium w-16 shrink-0">Тип</span>
                  <div className="flex gap-1.5">
                    {counts.images > 0 && (
                      <FilterPill
                        label="Фото"
                        count={counts.images}
                        active={typeFilter.has('IMAGE')}
                        onClick={() => setTypeFilter(s => toggleInSet(s, 'IMAGE'))}
                      />
                    )}
                    {counts.videos > 0 && (
                      <FilterPill
                        label="Видео"
                        count={counts.videos}
                        active={typeFilter.has('VIDEO')}
                        onClick={() => setTypeFilter(s => toggleInSet(s, 'VIDEO'))}
                      />
                    )}
                  </div>
                </div>
                {/* Favorites */}
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-muted-foreground font-medium w-16 shrink-0">Статус</span>
                  <div className="flex gap-1.5">
                    {counts.favorites > 0 ? (
                      <FilterPill
                        label="Избранное"
                        count={counts.favorites}
                        active={favoriteFilter}
                        onClick={() => setFavoriteFilter(f => !f)}
                      />
                    ) : (
                      <span className="text-[11px] text-muted-foreground/50">нет избранных</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Count + size */}
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground tabular-nums">
                  {filteredElements.length === 0
                    ? 'Нет элементов по фильтру'
                    : `${filteredElements.length} ${filteredElements.length === 1 ? 'элемент' : filteredElements.length < 5 ? 'элемента' : 'элементов'} · ${formatFileSize(totalSize)}`}
                </p>
                {overLimit && (
                  <p className="text-xs text-destructive">
                    Слишком большой архив. Уменьшите выборку с помощью фильтров.
                  </p>
                )}
                {!overLimit && totalSize > WARN_DOWNLOAD_BYTES && (
                  <p className="text-xs text-muted-foreground">
                    Большой архив. Скачивание может занять несколько минут.
                  </p>
                )}
              </div>
            </>
          )}

          {/* Progress */}
          {isActive && (
            <div className="space-y-3">
              <Progress value={stage === 'packing' ? 100 : progressPercent} className="h-2" />
              <p className="text-sm text-muted-foreground">
                {getProgressMessage(stage, progressPercent)}
              </p>
            </div>
          )}

          {/* Done */}
          {stage === 'done' && (
            <div className="flex items-center gap-3 py-2">
              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10">
                <Check className="h-4 w-4 text-primary" />
              </div>
              <p className="text-sm font-medium">Готово, архив сохранён</p>
            </div>
          )}

          {/* Error / Cancelled */}
          {stage === 'error' && (
            <p className="text-sm text-muted-foreground">Не удалось скачать архив</p>
          )}
          {stage === 'cancelled' && (
            <p className="text-sm text-muted-foreground">Скачивание отменено</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          {stage === 'idle' && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Отмена
              </Button>
              <Button
                onClick={handleDownload}
                disabled={filteredElements.length === 0 || overLimit}
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                Скачать ZIP
              </Button>
            </>
          )}
          {isActive && (
            <Button variant="outline" onClick={cancel}>
              Отмена
            </Button>
          )}
          {isDone && (
            <Button onClick={handleClose}>
              Закрыть
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
