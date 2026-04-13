'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  MessageSquare, Link as LinkIcon, ChevronDown, ChevronRight,
  Send, X, ThumbsUp, ThumbsDown,
} from 'lucide-react'
import { sharingApi } from '@/lib/api/sharing'
import type { ProjectFeedbackLink, ProjectFeedbackElement, Comment } from '@/lib/types'

interface ReviewsOverlayProps {
  projectId: number
  isOpen: boolean
  onClose: () => void
  onOpenLightbox?: (elementId: number) => void
}

export function ReviewsOverlay({ projectId, isOpen, onClose, onOpenLightbox }: ReviewsOverlayProps) {
  const [links, setLinks] = useState<ProjectFeedbackLink[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedLinks, setExpandedLinks] = useState<Set<number>>(new Set())
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({})

  // Load feedback when opened
  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    sharingApi.getProjectFeedback(projectId)
      .then((data) => {
        setLinks(data.links || [])
        // Auto-expand links with unread
        const withUnread = new Set<number>()
        for (const link of data.links || []) {
          if (link.unread_count > 0) withUnread.add(link.id)
        }
        if (withUnread.size > 0) setExpandedLinks(withUnread)
        else if (data.links?.length === 1) setExpandedLinks(new Set([data.links[0].id]))
      })
      .catch(() => toast.error('Не удалось загрузить отзывы'))
      .finally(() => setLoading(false))
  }, [isOpen, projectId])

  const toggleLink = useCallback((linkId: number) => {
    setExpandedLinks((prev) => {
      const next = new Set(prev)
      if (next.has(linkId)) next.delete(linkId)
      else next.add(linkId)
      return next
    })
  }, [])

  const handleReply = useCallback(async (linkId: number, elementKey: string, elementId?: number, parentId?: number) => {
    const text = replyTexts[elementKey]?.trim()
    if (!text) return
    try {
      if (elementId) {
        // Ответ на комментарий к элементу
        await sharingApi.addElementComment(elementId, text, parentId)
      } else {
        // Ответ на общий комментарий к ссылке
        await sharingApi.addLinkComment(linkId, { text, parent_id: parentId })
      }
      setReplyTexts((prev) => ({ ...prev, [elementKey]: '' }))
      // Refetch
      const data = await sharingApi.getProjectFeedback(projectId)
      setLinks(data.links || [])
    } catch {
      toast.error('Не удалось отправить ответ')
    }
  }, [replyTexts, projectId])

  if (!isOpen) return null

  const totalUnread = links.reduce((sum, l) => sum + l.unread_count, 0)

  return (
    <div className="absolute inset-0 top-[44px] z-40 bg-[#0D0D15]/95 backdrop-blur-sm overflow-y-auto">
      <div className="max-w-[1100px] mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <h2 className="text-lg font-semibold text-foreground">Отзывы проекта</h2>
          {totalUnread > 0 && (
            <span className="bg-emerald-500 text-white text-xs font-bold rounded-full px-2 py-0.5">
              {totalUnread} новых
            </span>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted/30 text-muted-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-12 text-muted-foreground text-sm">Загрузка...</div>
        )}

        {/* Empty state */}
        {!loading && links.length === 0 && (
          <div className="text-center py-12">
            <MessageSquare className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Нет отзывов</p>
          </div>
        )}

        {/* Accordion links */}
        <div className="flex flex-col gap-3">
          {links.map((link) => (
            <div key={link.id} className="rounded-lg bg-card border border-border overflow-hidden">
              {/* Accordion header */}
              <button
                onClick={() => toggleLink(link.id)}
                className="w-full flex items-center gap-2 px-4 py-3 hover:bg-muted/20 transition-colors"
              >
                {expandedLinks.has(link.id)
                  ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                }
                <LinkIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium text-foreground">{link.name || 'Без названия'}</span>
                <div className="flex-1" />
                <span className="text-xs text-muted-foreground">
                  {link.stats.approved > 0 && `${link.stats.approved} согласовано`}
                  {link.stats.changes_requested > 0 && ` · ${link.stats.changes_requested} на доработку`}
                  {link.stats.rejected > 0 && ` · ${link.stats.rejected} отклонено`}
                </span>
                {link.unread_count > 0 && (
                  <span className="bg-emerald-500 text-white text-[10px] font-bold rounded-full px-2 py-0.5">
                    {link.unread_count} нов.
                  </span>
                )}
              </button>

              {/* Accordion content */}
              {expandedLinks.has(link.id) && (
                <div className="border-t border-border">
                  {/* Elements with feedback */}
                  {link.elements.map((el) => (
                    <FeedbackElementRow
                      key={el.id}
                      element={el}
                      linkId={link.id}
                      replyText={replyTexts[`el-${el.id}`] || ''}
                      onReplyTextChange={(text) => setReplyTexts((prev) => ({ ...prev, [`el-${el.id}`]: text }))}
                      onSubmitReply={() => handleReply(link.id, `el-${el.id}`, el.id)}
                      onOpenLightbox={onOpenLightbox}
                    />
                  ))}

                  {/* General comments */}
                  {link.general_comments.length > 0 && (
                    <div className="px-4 py-3 border-t border-border">
                      <div className="flex items-center gap-1.5 mb-3">
                        <MessageSquare className="w-3.5 h-3.5 text-primary" />
                        <span className="text-xs font-medium text-primary">Общий комментарий к ссылке</span>
                      </div>
                      {link.general_comments.map((comment) => (
                        <CommentBubble key={comment.id} comment={comment} />
                      ))}
                      <ReplyInput
                        value={replyTexts[`gen-${link.id}`] || ''}
                        onChange={(text) => setReplyTexts((prev) => ({ ...prev, [`gen-${link.id}`]: text }))}
                        onSubmit={() => handleReply(link.id, `gen-${link.id}`)}
                      />
                    </div>
                  )}

                  {link.elements.length === 0 && link.general_comments.length === 0 && (
                    <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                      Нет отзывов по этой ссылке
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// --- Sub-components ---

function FeedbackElementRow({
  element, linkId, replyText, onReplyTextChange, onSubmitReply, onOpenLightbox,
}: {
  element: ProjectFeedbackElement
  linkId: number
  replyText: string
  onReplyTextChange: (text: string) => void
  onSubmitReply: () => void
  onOpenLightbox?: (id: number) => void
}) {
  return (
    <div className="flex gap-3 px-4 py-3 border-b border-border last:border-b-0">
      {/* Thumbnail */}
      <button
        onClick={() => onOpenLightbox?.(element.id)}
        className="shrink-0 w-14 h-10 rounded bg-muted overflow-hidden hover:ring-2 ring-primary/50 transition-all"
      >
        {element.thumbnail_url ? (
          <img src={element.thumbnail_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[9px] text-muted-foreground">
            {element.element_type === 'VIDEO' ? 'vid' : 'img'}
          </div>
        )}
      </button>

      {/* Body */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        {/* Header: filename + status + reactions */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onOpenLightbox?.(element.id)}
            className="text-xs font-medium text-primary hover:underline truncate"
          >
            {element.original_filename || `Элемент ${element.id}`}
          </button>
          {element.review_summary && (
            <span className={cn(
              "text-[10px] font-medium px-1.5 py-0.5 rounded",
              element.review_summary.action === 'approved' && "bg-emerald-500/10 text-emerald-500",
              element.review_summary.action === 'changes_requested' && "bg-orange-500/10 text-orange-500",
              element.review_summary.action === 'rejected' && "bg-red-500/10 text-red-400",
            )}>
              {element.review_summary.action === 'approved' ? '\u2713' : element.review_summary.action === 'changes_requested' ? '\u21BB' : '\u2715'}
              {' '}{element.review_summary.author_name}
            </span>
          )}
          {element.likes > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <ThumbsUp className="w-3 h-3" /> {element.likes}
            </span>
          )}
          {element.dislikes > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <ThumbsDown className="w-3 h-3" /> {element.dislikes}
            </span>
          )}
        </div>

        {/* Comments */}
        {element.comments.map((comment) => (
          <CommentBubble key={comment.id} comment={comment} />
        ))}

        {/* Reply input */}
        <ReplyInput value={replyText} onChange={onReplyTextChange} onSubmit={onSubmitReply} />
      </div>
    </div>
  )
}

function CommentBubble({ comment }: { comment: Comment }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2 items-start">
        <div
          className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[9px] font-medium text-white"
          style={{ backgroundColor: sessionIdToColor(comment.session_id) }}
        >
          {(comment.author_name || '?')[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs font-medium text-foreground">{comment.author_name || 'Аноним'}</span>
            <span className="text-[10px] text-muted-foreground">{relativeTime(comment.created_at)}</span>
          </div>
          <p className="text-xs text-foreground/80 leading-relaxed break-words">{comment.text}</p>
        </div>
      </div>
      {/* Replies */}
      {comment.replies?.map((reply) => (
        <div key={reply.id} className="flex gap-2 items-start pl-7">
          <div
            className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center text-[8px] font-medium text-white"
            style={{ backgroundColor: sessionIdToColor(reply.session_id || '') }}
          >
            {(reply.author_name || '?')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className={cn("text-[10px] font-medium", reply.author_user ? "text-primary" : "text-foreground")}>
                {reply.author_user ? 'Вы' : reply.author_name || 'Аноним'}
              </span>
              <span className="text-[10px] text-muted-foreground">{relativeTime(reply.created_at)}</span>
            </div>
            <p className="text-[11px] text-foreground/80 leading-relaxed break-words">{reply.text}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function ReplyInput({ value, onChange, onSubmit }: {
  value: string
  onChange: (text: string) => void
  onSubmit: () => void
}) {
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit() } }}
        placeholder="Ответить..."
        className="flex-1 h-7 text-xs bg-muted/10 border border-border rounded px-2 text-foreground placeholder:text-muted-foreground/50"
      />
      <button
        onClick={onSubmit}
        disabled={!value.trim()}
        className="shrink-0 w-7 h-7 flex items-center justify-center rounded bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-30 transition-colors"
      >
        <Send className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// Helpers
function sessionIdToColor(sid: string): string {
  let hash = 0
  for (let i = 0; i < sid.length; i++) {
    hash = sid.charCodeAt(i) + ((hash << 5) - hash)
  }
  const h = Math.abs(hash) % 360
  return `hsl(${h}, 60%, 45%)`
}

function relativeTime(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return 'Только что'
  if (diff < 3600) return `${Math.floor(diff / 60)} мин`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч`
  if (diff < 172800) return 'Вчера'
  return new Date(dateStr).toLocaleDateString('ru-RU')
}
