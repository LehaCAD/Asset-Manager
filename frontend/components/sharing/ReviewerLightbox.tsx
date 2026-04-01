'use client'

import { useEffect, useCallback, useState, useRef } from 'react'
import {
  X,
  ChevronLeft,
  ChevronRight,
  Play,
  Download,
  ExternalLink,
  MessageCircle,
} from 'lucide-react'
import { CommentThread } from './CommentThread'
import { ReviewerNameInput } from './ReviewerNameInput'
import { sharingApi } from '@/lib/api/sharing'
import type { PublicElement, Comment } from '@/lib/types'

// ── Download helper ─────────────────────────────────────────

async function handleDownload(url: string, filename?: string) {
  try {
    const response = await fetch(url)
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
  const filmstripRef = useRef<HTMLDivElement>(null)

  // Load reviewer identity from localStorage
  useEffect(() => {
    const name = localStorage.getItem('reviewer_name') || ''
    const sid = localStorage.getItem('reviewer_session_id') || ''
    setReviewerName(name)
    setSessionId(sid)
  }, [])

  const current = elements[currentIndex]
  const isVideo = current?.element_type === 'VIDEO'

  const goNext = useCallback(() => {
    if (currentIndex < elements.length - 1) onNavigate(currentIndex + 1)
  }, [currentIndex, elements.length, onNavigate])

  const goPrev = useCallback(() => {
    if (currentIndex > 0) onNavigate(currentIndex - 1)
  }, [currentIndex, onNavigate])

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

  // Scroll filmstrip to keep current element visible
  useEffect(() => {
    if (!filmstripRef.current) return
    const thumb = filmstripRef.current.children[currentIndex] as HTMLElement | undefined
    if (thumb) {
      thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
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

  if (!isOpen || !current) return null

  const comments = commentsMap[current.id] || []
  const hasIdentity = !!reviewerName && !!sessionId

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
        <span className="text-sm text-white/60">
          {currentIndex + 1} / {elements.length}
        </span>
        <button
          onClick={onClose}
          className="text-white/60 hover:text-white transition-all duration-150 p-1 rounded-full hover:bg-white/10"
          aria-label="Закрыть"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Media area */}
        <div className="flex-1 flex flex-col items-center justify-center relative px-16">
          {/* Prev arrow */}
          {currentIndex > 0 && (
            <button
              onClick={goPrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all duration-150"
              aria-label="Предыдущий"
            >
              <ChevronLeft className="w-6 h-6 text-white" />
            </button>
          )}

          {/* Media */}
          {isVideo ? (
            <video
              key={current.file_url}
              src={current.file_url}
              controls
              className="max-h-[calc(100vh-200px)] max-w-[calc(100%-380px)] rounded-lg"
            />
          ) : (
            <img
              key={current.file_url}
              src={current.file_url}
              alt=""
              className="max-h-[calc(100vh-200px)] max-w-[calc(100%-380px)] object-contain rounded-lg"
            />
          )}

          {/* Action buttons under media */}
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => handleDownload(current.file_url, `element-${current.id}`)}
              className="rounded-full bg-overlay-button hover:bg-overlay-button-hover p-2 transition-all duration-150"
              aria-label="Скачать"
            >
              <Download className="w-4 h-4 text-overlay-text" />
            </button>
            <button
              onClick={() => window.open(current.file_url, '_blank')}
              className="rounded-full bg-overlay-button hover:bg-overlay-button-hover p-2 transition-all duration-150"
              aria-label="Открыть оригинал"
            >
              <ExternalLink className="w-4 h-4 text-overlay-text" />
            </button>
          </div>

          {/* Next arrow */}
          {currentIndex < elements.length - 1 && (
            <button
              onClick={goNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all duration-150"
              aria-label="Следующий"
            >
              <ChevronRight className="w-6 h-6 text-white" />
            </button>
          )}
        </div>

        {/* Comments panel */}
        <div className="hidden md:flex flex-col w-80 bg-background border-l border-border flex-shrink-0">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
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

      {/* Filmstrip */}
      <div className="flex-shrink-0 border-t border-white/10 bg-black/50 px-4 py-2">
        <div
          ref={filmstripRef}
          className="flex gap-2 overflow-x-auto scrollbar-thin scrollbar-thumb-white/20"
        >
          {elements.map((el, idx) => (
            <button
              key={el.id}
              onClick={() => onNavigate(idx)}
              className={`relative flex-shrink-0 w-14 h-14 rounded overflow-hidden border-2 transition-all duration-150 ${
                idx === currentIndex
                  ? 'border-primary opacity-100'
                  : 'border-transparent opacity-50 hover:opacity-80'
              }`}
            >
              <img
                src={el.thumbnail_url || el.file_url}
                alt=""
                className="w-full h-full object-cover"
              />
              {el.element_type === 'VIDEO' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Play className="w-3.5 h-3.5 text-white/80 fill-white/80" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default ReviewerLightbox
