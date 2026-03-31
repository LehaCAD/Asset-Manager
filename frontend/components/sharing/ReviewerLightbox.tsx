'use client'

import { useEffect, useCallback, useState, useRef } from 'react'
import { X, ChevronLeft, ChevronRight, Play } from 'lucide-react'
import { CommentThread } from './CommentThread'
import { ReviewerNameInput } from './ReviewerNameInput'
import { sharingApi } from '@/lib/api/sharing'
import type { PublicElement, Comment } from '@/lib/types'

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
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
        <span className="text-sm text-white/60">
          {currentIndex + 1} / {elements.length}
        </span>
        <button
          onClick={onClose}
          className="text-white/60 hover:text-white transition-colors p-1"
          aria-label="Закрыть"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Media area */}
        <div className="flex-1 flex items-center justify-center relative px-12">
          {/* Prev arrow */}
          {currentIndex > 0 && (
            <button
              onClick={goPrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors p-2"
              aria-label="Предыдущий"
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
          )}

          {isVideo ? (
            <video
              key={current.file_url}
              src={current.file_url}
              controls
              className="max-h-full max-w-full rounded-lg"
            />
          ) : (
            <img
              key={current.file_url}
              src={current.file_url}
              alt=""
              className="max-h-full max-w-full object-contain rounded-lg"
            />
          )}

          {/* Next arrow */}
          {currentIndex < elements.length - 1 && (
            <button
              onClick={goNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors p-2"
              aria-label="Следующий"
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          )}
        </div>

        {/* Comments panel (hidden on very small screens) */}
        <div className="hidden md:flex flex-col w-80 bg-background border-l border-border flex-shrink-0">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-medium text-foreground">Комментарии</h3>
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
              className={`relative flex-shrink-0 w-16 h-16 rounded-md overflow-hidden border-2 transition-all ${
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
                  <Play className="w-4 h-4 text-white/80 fill-white/80" />
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
