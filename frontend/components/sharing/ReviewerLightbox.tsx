'use client'

import { useEffect, useCallback, useState, useRef } from 'react'
import { X, Download, ExternalLink, MessageCircle, Video, Image, ThumbsUp, ThumbsDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LightboxNavigation } from '@/components/lightbox/LightboxNavigation'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { CommentThread } from './CommentThread'
import { ReviewerNameInput } from './ReviewerNameInput'
import { sharingApi } from '@/lib/api/sharing'
import { cn } from '@/lib/utils'
import type { PublicElement, Comment } from '@/lib/types'

// ── Download helper ─────────────────────────────────────────

async function handleDownload(url: string, filename?: string) {
  try {
    const response = await fetch(url, { mode: 'cors', cache: 'no-store' })
    if (!response.ok) throw new Error('fetch failed')
    const blob = await response.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename || 'download'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
  } catch {
    window.open(url, '_blank')
  }
}

// ── Types ───────────────────────────────────────────────────

interface ReviewerLightboxProps {
  elements: PublicElement[]
  currentIndex: number
  isOpen: boolean
  onClose: () => void
  onNavigate: (index: number) => void
  token: string
  commentsMap: Record<number, Comment[]>
  onCommentAdded: (elementId: number, comment: Comment) => void
}

// ── Component ───────────────────────────────────────────────

export function ReviewerLightbox({
  elements,
  currentIndex,
  isOpen,
  onClose,
  onNavigate,
  token,
  commentsMap,
  onCommentAdded,
}: ReviewerLightboxProps) {
  const [reviewerName, setReviewerName] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [reactionsMap, setReactionsMap] = useState<Record<number, string | null>>({}) // elementId -> 'like'|'dislike'|null
  const activeThumbRef = useRef<HTMLButtonElement>(null)

  // Load reviewer identity from localStorage
  useEffect(() => {
    setReviewerName(localStorage.getItem('reviewer_name') || '')
    setSessionId(localStorage.getItem('reviewer_session_id') || '')
  }, [])

  const current = elements[currentIndex]
  const isVideo = current?.element_type === 'VIDEO'
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < elements.length - 1

  const goNext = useCallback(() => {
    if (hasNext) onNavigate(currentIndex + 1)
  }, [currentIndex, hasNext, onNavigate])

  const goPrev = useCallback(() => {
    if (hasPrev) onNavigate(currentIndex - 1)
  }, [currentIndex, hasPrev, onNavigate])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose, goNext, goPrev])

  // Prevent body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  // Auto-scroll filmstrip
  useEffect(() => {
    if (activeThumbRef.current) {
      activeThumbRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    }
  }, [currentIndex])

  const handleNameSave = (name: string, sid: string) => {
    setReviewerName(name)
    setSessionId(sid)
  }

  const handleCommentSubmit = async (text: string, parentId?: number) => {
    if (!reviewerName || !sessionId || !current) return
    const comment = await sharingApi.addPublicComment(token, {
      text,
      author_name: reviewerName,
      session_id: sessionId,
      element_id: current.id,
      parent_id: parentId,
    })
    onCommentAdded(current.id, comment)
  }

  const handleReaction = async (value: 'like' | 'dislike') => {
    if (!current || !sessionId) return
    const currentValue = reactionsMap[current.id]
    const newValue = currentValue === value ? null : value
    setReactionsMap((prev) => ({ ...prev, [current.id]: newValue }))
    try {
      await sharingApi.setReaction(token, {
        element_id: current.id,
        session_id: sessionId,
        value: newValue,
      })
    } catch {
      // Revert on error
      setReactionsMap((prev) => ({ ...prev, [current.id]: currentValue ?? null }))
    }
  }

  if (!isOpen || !current) return null

  const comments = commentsMap[current.id] || []
  const hasIdentity = !!reviewerName && !!sessionId
  const hasFileUrl = !!current.file_url?.trim()
  const ext = current.file_url?.split('/').pop()?.split('?')[0]?.split('.').pop() ?? 'file'
  const fileName = `element-${current.id}.${ext}`

  return (
    <div
      className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр элемента"
    >
      {/* Header — matches main LightboxModal */}
      <div className="relative flex items-center justify-between px-4 py-2 border-b shrink-0 bg-surface">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground select-none">
            {currentIndex + 1} / {elements.length}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Закрыть"
          className="h-7 w-7"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Media area with navigation */}
        <div className="flex-1 relative flex flex-col items-center justify-center p-4 md:p-8">
          {/* Keyboard hints — centered above media */}
          <div className="hidden sm:flex items-center justify-center gap-2 text-[11px] text-muted-foreground/40 select-none py-1">
            <kbd className="px-1.5 py-0.5 rounded bg-card text-muted-foreground/60 text-[10px] font-mono">&larr; &rarr;</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-card text-muted-foreground/60 text-[10px] font-mono">Esc</kbd>
          </div>

          <LightboxNavigation
            onPrev={goPrev}
            onNext={goNext}
            hasPrev={hasPrev}
            hasNext={hasNext}
          />

          {/* Media container */}
          <div className="relative flex items-center justify-center w-full max-w-[80vw] md:max-w-[900px] h-full max-h-[65vh] md:max-h-[600px] rounded-md overflow-hidden">
            {isVideo ? (
              <video
                key={current.file_url}
                src={current.file_url}
                controls
                playsInline
                className="max-w-full max-h-full object-contain rounded-lg"
              />
            ) : (
              <img
                key={current.file_url}
                src={current.file_url}
                alt=""
                className="max-w-full max-h-full object-contain rounded-lg"
              />
            )}
          </div>

          {/* Action buttons below media — matches main lightbox style */}
          <div className="mt-4 flex items-center gap-1.5">
            {hasFileUrl && (
              <>
                <button
                  type="button"
                  onClick={() => handleDownload(current.file_url, fileName)}
                  className="flex items-center gap-1.5 h-7 px-3 rounded text-xs font-medium text-muted-foreground bg-card hover:text-foreground transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Скачать
                </button>
                <a
                  href={current.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 h-7 px-3 rounded text-xs font-medium text-muted-foreground bg-card hover:text-foreground transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Оригинал
                </a>
              </>
            )}
            {hasIdentity && (
              <>
                <button
                  type="button"
                  onClick={() => handleReaction('like')}
                  className={cn(
                    'flex items-center gap-1 h-7 px-3 rounded text-xs font-medium transition-colors',
                    reactionsMap[current.id] === 'like'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-card text-muted-foreground hover:text-foreground'
                  )}
                >
                  <ThumbsUp className="h-3.5 w-3.5" />
                  {(current.likes ?? 0) > 0 && <span>{current.likes}</span>}
                </button>
                <button
                  type="button"
                  onClick={() => handleReaction('dislike')}
                  className={cn(
                    'flex items-center gap-1 h-7 px-3 rounded text-xs font-medium transition-colors',
                    reactionsMap[current.id] === 'dislike'
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-card text-muted-foreground hover:text-foreground'
                  )}
                >
                  <ThumbsDown className="h-3.5 w-3.5" />
                  {(current.dislikes ?? 0) > 0 && <span>{current.dislikes}</span>}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Comments panel — matches DetailPanel structure */}
        <div className="w-80 border-l overflow-hidden bg-background shrink-0 hidden md:flex flex-col">
          <div className="px-4 py-3 border-b flex items-center gap-2 shrink-0">
            <MessageCircle className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-medium text-foreground">Комментарии</h3>
            {comments.length > 0 && (
              <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                {comments.length}
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {!hasIdentity ? (
              <ReviewerNameInput onSave={handleNameSave} />
            ) : (
              <CommentThread
                comments={comments}
                onSubmit={handleCommentSubmit}
                isAuthenticated={true}
              />
            )}
          </div>
        </div>
      </div>

      {/* Filmstrip — matches main lightbox Filmstrip */}
      <div className="border-t px-4 py-2 shrink-0 bg-background">
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex gap-2 py-2 px-1">
            {elements.map((el, idx) => {
              const isActive = idx === currentIndex
              const elIsVideo = el.element_type === 'VIDEO'

              return (
                <button
                  key={el.id}
                  ref={isActive ? activeThumbRef : null}
                  onClick={() => onNavigate(idx)}
                  className={cn(
                    'shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all relative group',
                    isActive
                      ? 'border-primary ring-2 ring-primary/30'
                      : 'border-transparent hover:border-muted-foreground/30'
                  )}
                >
                  <img
                    src={el.thumbnail_url || el.file_url}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {/* Type icon */}
                  <div className="absolute top-1 right-1 rounded-full bg-overlay-medium p-0.5">
                    {elIsVideo ? (
                      <Video className="w-2.5 h-2.5 text-overlay-text" />
                    ) : (
                      <Image className="w-2.5 h-2.5 text-overlay-text" />
                    )}
                  </div>
                </button>
              )
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </div>
  )
}

export default ReviewerLightbox
