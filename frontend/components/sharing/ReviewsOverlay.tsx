'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  MessageSquare, Link as LinkIcon, ChevronDown, ChevronRight,
  SendHorizontal, X, ThumbsUp, ThumbsDown, Copy, Trash2,
} from 'lucide-react'
import { sharingApi } from '@/lib/api/sharing'
import { logger } from '@/lib/utils/logger'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useNotificationStore } from '@/lib/store/notifications'
import type { ProjectFeedbackLink, ProjectFeedbackElement, Comment } from '@/lib/types'

interface ReviewsOverlayProps {
  projectId?: number
  isOpen: boolean
  onClose: () => void
  onOpenLightbox?: (elementId: number, sceneId?: number | null, projectId?: number | null) => void
}

export function ReviewsOverlay({ projectId, isOpen, onClose, onOpenLightbox }: ReviewsOverlayProps) {
  const [links, setLinks] = useState<ProjectFeedbackLink[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedLinks, setExpandedLinks] = useState<Set<number>>(new Set())
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({})
  const [replyTarget, setReplyTarget] = useState<{ key: string; commentId: number; authorName: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null)

  // Load feedback when opened
  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    const fetchPromise = projectId
      ? sharingApi.getProjectFeedback(projectId)
      : sharingApi.getAllFeedback()
    fetchPromise
      .then((data) => {
        setLinks(data.links || [])
        setExpandedLinks(new Set())
      })
      .catch(() => toast.error('Не удалось загрузить отзывы'))
      .finally(() => setLoading(false))
  }, [isOpen, projectId])

  const markLinkRead = useCallback((linkId: number) => {
    const link = links.find((l) => l.id === linkId)
    if (!link || link.unread_count === 0 || link.is_expired) return

    // Single batch request per project instead of per-comment
    const pid = link.project_id
    if (pid) {
      sharingApi.markAllCommentsRead(pid).catch((err) =>
        logger.warn('reviews_overlay.mark_read_failed', { projectId: pid, cause: err })
      )
    }

    // Optimistically update local state + store badge (deferred to avoid setState-during-render)
    const linkUnread = link.unread_count
    setLinks((prev) => prev.map((l) =>
      l.id === linkId ? { ...l, unread_count: 0 } : l
    ))
    queueMicrotask(() => {
      useNotificationStore.setState((s) => ({
        feedbackUnreadCount: Math.max(0, s.feedbackUnreadCount - linkUnread),
      }))
    })
  }, [links])

  const toggleLink = useCallback((linkId: number) => {
    setExpandedLinks((prev) => {
      const next = new Set(prev)
      if (next.has(linkId)) {
        next.delete(linkId)
      } else {
        next.add(linkId)
        // Mark as read when expanding
        markLinkRead(linkId)
      }
      return next
    })
  }, [markLinkRead])

  const submittingRef = useRef(false)
  const handleReply = useCallback(async (linkId: number, elementKey: string, elementId?: number, parentId?: number) => {
    const text = replyTexts[elementKey]?.trim()
    if (!text || submittingRef.current) return
    submittingRef.current = true
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
      const data = projectId
        ? await sharingApi.getProjectFeedback(projectId)
        : await sharingApi.getAllFeedback()
      setLinks(data.links || [])
    } catch {
      toast.error('Не удалось отправить ответ')
    } finally {
      submittingRef.current = false
    }
  }, [replyTexts, projectId])

  // Mark all as read on close + sync notification store
  const handleClose = useCallback(() => {
    // Collect project IDs that had unread content
    const projectIds = new Set<number>()
    for (const link of links) {
      if (link.project_id) projectIds.add(link.project_id)
    }
    // Mark all comments read per project (fire-and-forget)
    for (const pid of projectIds) {
      sharingApi.markAllCommentsRead(pid).catch((err) =>
        logger.warn('reviews_overlay.mark_read_all_failed', { projectId: pid, cause: err })
      )
    }
    // Immediately zero out feedback badge in store
    useNotificationStore.setState({ feedbackUnreadCount: 0 })
    onClose()
  }, [links, onClose])

  // ESC to close
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleClose])

  if (!isOpen) return null

  const totalUnread = links.reduce((sum, l) => l.is_expired ? sum : sum + l.unread_count, 0)

  return (
    <div
      className="fixed inset-0 top-12 z-[60] bg-background/95 backdrop-blur-sm overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div className="max-w-[1100px] mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Ссылки и отзывы</h2>
            <p className="text-xs text-muted-foreground">Обратная связь по ссылкам для просмотра</p>
          </div>
          {totalUnread > 0 && (
            <span className="bg-primary text-white text-xs font-bold rounded px-2 py-0.5">
              {totalUnread}
            </span>
          )}
          <div className="flex-1" />
          <button
            onClick={handleClose}
            aria-label="Закрыть"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
          >
            <X className="w-4 h-4" />
            <span className="text-xs hidden sm:inline">Esc</span>
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
            <div key={link.id} className={cn(
              "rounded-lg bg-card border border-border overflow-hidden",
              link.is_expired && "opacity-60"
            )}>
              {/* Accordion header. Mobile: 2 rows (title+badge; meta+actions). Desktop: single row. */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 hover:bg-muted/20 transition-colors group">
                {/* Row 1: toggle + title + status (+unread on desktop) */}
                <div className="flex items-center gap-2 min-w-0 sm:flex-1">
                  <button
                    onClick={() => toggleLink(link.id)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                  >
                    {expandedLinks.has(link.id)
                      ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    }
                    <LinkIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                      {link.project_name && (
                        <span className="text-sm text-muted-foreground truncate leading-tight">
                          {link.project_name} /
                        </span>
                      )}
                      <span className="text-sm font-semibold text-foreground truncate leading-tight">
                        {link.name || 'Без названия'}
                      </span>
                    </div>
                  </button>
                  <LinkStatusBadge expiresAt={link.expires_at} isExpired={link.is_expired} />
                  {link.unread_count > 0 && !link.is_expired && (
                    <span className="bg-primary text-white text-[10px] font-bold rounded px-2 py-0.5 shrink-0">
                      {link.unread_count}
                    </span>
                  )}
                </div>
                {/* Row 2: meta text (left) + actions (right). Actions visible by default on mobile, hover on desktop. */}
                <div className="flex items-center justify-between gap-2 min-w-0 pl-6 sm:pl-0 sm:shrink-0">
                  <span className="text-[10px] text-muted-foreground truncate">
                    {link.created_at && formatLinkDate(link.created_at)}
                    {' · '}{link.stats.total_elements} эл.
                    {link.stats.approved > 0 && ` · ${link.stats.approved} согласовано`}
                    {link.stats.changes_requested > 0 && ` · ${link.stats.changes_requested} на доработку`}
                  </span>
                  <div className="flex items-center gap-0.5 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 sm:transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        const url = `${window.location.origin}/share/${link.token}`
                        navigator.clipboard.writeText(url).then(() => toast.success('Ссылка скопирована')).catch(() => toast.error('Не удалось скопировать'))
                      }}
                      title="Скопировать ссылку"
                      aria-label="Скопировать ссылку"
                      className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteTarget({ id: link.id, name: link.name || 'Без названия' })
                      }}
                      title="Удалить ссылку"
                      aria-label="Удалить ссылку"
                      className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

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
                      onSubmitReply={() => {
                        const parentId = replyTarget?.key === `el-${el.id}` ? replyTarget.commentId : undefined
                        handleReply(link.id, `el-${el.id}`, el.id, parentId)
                        setReplyTarget(null)
                      }}
                      replyTarget={replyTarget?.key === `el-${el.id}` ? replyTarget : null}
                      onReplyToComment={(commentId, authorName) => setReplyTarget({ key: `el-${el.id}`, commentId, authorName })}
                      onCancelReply={() => setReplyTarget(null)}
                      onOpenLightbox={(elementId, sceneId) => onOpenLightbox?.(elementId, sceneId, link.project_id)}
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
                        <CommentBubble
                          key={comment.id}
                          comment={comment}
                          onReplyToComment={(commentId, authorName) => setReplyTarget({ key: `gen-${link.id}`, commentId, authorName })}
                        />
                      ))}
                      <ReplyInput
                        value={replyTexts[`gen-${link.id}`] || ''}
                        onChange={(text) => setReplyTexts((prev) => ({ ...prev, [`gen-${link.id}`]: text }))}
                        onSubmit={() => {
                          const parentId = replyTarget?.key === `gen-${link.id}` ? replyTarget.commentId : undefined
                          handleReply(link.id, `gen-${link.id}`, undefined, parentId)
                          setReplyTarget(null)
                        }}
                        replyTarget={replyTarget?.key === `gen-${link.id}` ? replyTarget : null}
                        onCancelReply={() => setReplyTarget(null)}
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

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent className="sm:max-w-sm z-[70]" overlayClassName="z-[70]">
          <DialogHeader>
            <DialogTitle>Удалить ссылку?</DialogTitle>
            <DialogDescription>
              Ссылка «{deleteTarget?.name}» будет удалена. Доступ по ней будет закрыт, отзывы сохранятся.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (!deleteTarget) return
                sharingApi.deleteLink(deleteTarget.id).then(() => {
                  toast.success('Ссылка удалена')
                  setLinks((prev) => prev.filter((l) => l.id !== deleteTarget.id))
                  setDeleteTarget(null)
                }).catch(() => toast.error('Не удалось удалить'))
              }}
            >
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// --- Sub-components ---

function FeedbackElementRow({
  element, linkId, replyText, onReplyTextChange, onSubmitReply, onOpenLightbox,
  replyTarget, onReplyToComment, onCancelReply,
}: {
  element: ProjectFeedbackElement
  linkId: number
  replyText: string
  onReplyTextChange: (text: string) => void
  onSubmitReply: () => void
  onOpenLightbox?: (id: number, sceneId?: number | null) => void
  replyTarget: { key: string; commentId: number; authorName: string } | null
  onReplyToComment: (commentId: number, authorName: string) => void
  onCancelReply: () => void
}) {
  // Count unread comments for this element (not authored by creator)
  const unreadCount = element.comments.reduce((sum, c) => {
    let n = (!c.is_read && !c.author_user) ? 1 : 0
    n += (c.replies || []).filter(r => !r.is_read && !r.author_user).length
    return sum + n
  }, 0)

  return (
    <div className={cn("flex gap-3 px-4 py-3 border-b border-border last:border-b-0", unreadCount > 0 && "bg-primary/5")}>
      {/* Thumbnail */}
      <button
        onClick={() => onOpenLightbox?.(element.id, element.scene_id)}
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
            onClick={() => onOpenLightbox?.(element.id, element.scene_id)}
            className="text-xs font-medium text-primary hover:underline truncate"
          >
            {element.original_filename || `Элемент ${element.id}`}
          </button>
          {unreadCount > 0 && (
            <span className="text-[9px] font-medium text-primary bg-primary/10 rounded px-1.5 py-0.5">
              {unreadCount} {unreadCount === 1 ? 'новый' : 'новых'}
            </span>
          )}
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

        {/* Comments — last 3 by default, expandable in batches of 10 */}
        <CollapsedComments comments={element.comments} onReplyToComment={onReplyToComment} />

        {/* Reply input */}
        <ReplyInput
          value={replyText}
          onChange={onReplyTextChange}
          onSubmit={onSubmitReply}
          replyTarget={replyTarget}
          onCancelReply={onCancelReply}
        />
      </div>
    </div>
  )
}

function CommentBubble({ comment, onReplyToComment }: { comment: Comment; onReplyToComment?: (commentId: number, authorName: string) => void }) {
  const isNew = !comment.is_read && !comment.author_user
  return (
    <div className={cn("flex flex-col gap-1", isNew && "bg-primary/5 -mx-2 px-2 py-1 rounded")}>
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
            {isNew && <span className="text-[9px] font-medium text-primary">новое</span>}
          </div>
          <p className="text-xs text-foreground/80 leading-relaxed break-words">{comment.text}</p>
          {onReplyToComment && (
            <button
              onClick={() => onReplyToComment(comment.id, comment.author_name || 'Аноним')}
              className="mt-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5"
            >
              <MessageSquare className="w-2.5 h-2.5" />
              Ответить
            </button>
          )}
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

function ReplyInput({ value, onChange, onSubmit, replyTarget, onCancelReply }: {
  value: string
  onChange: (text: string) => void
  onSubmit: () => void
  replyTarget?: { key: string; commentId: number; authorName: string } | null
  onCancelReply?: () => void
}) {
  return (
    <div className="flex flex-col gap-1 mt-1">
      {replyTarget && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="truncate">
            ↩ Ответ для <span className="font-medium text-foreground">{replyTarget.authorName}</span>
          </span>
          <button onClick={onCancelReply} className="shrink-0 hover:text-foreground transition-colors">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit() } }}
          placeholder={replyTarget ? `Ответить ${replyTarget.authorName}...` : 'Ответить...'}
          className="flex-1 h-7 text-xs bg-muted/10 border border-border rounded px-2 text-foreground placeholder:text-muted-foreground/50"
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={!value.trim()}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-30 transition-colors"
        >
          <SendHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

function CollapsedComments({ comments, onReplyToComment }: {
  comments: Comment[]
  onReplyToComment: (commentId: number, authorName: string) => void
}) {
  const [showCount, setShowCount] = useState(3)
  const visible = comments.length > showCount ? comments.slice(-showCount) : comments
  const hidden = comments.length - visible.length

  return (
    <>
      {hidden > 0 && (
        <button
          onClick={() => setShowCount((p) => p + 10)}
          className="text-xs text-primary hover:text-primary/80 transition-colors py-0.5"
        >
          Показать ещё {Math.min(hidden, 10)} из {hidden} {pluralizeRu(hidden, 'комментарий', 'комментария', 'комментариев')}
        </button>
      )}
      {visible.map((comment) => (
        <CommentBubble key={comment.id} comment={comment} onReplyToComment={onReplyToComment} />
      ))}
    </>
  )
}

function LinkStatusBadge({ expiresAt, isExpired }: { expiresAt: string | null; isExpired: boolean }) {
  if (isExpired) {
    return (
      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
        Истекла
      </span>
    )
  }
  if (!expiresAt) {
    return (
      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">
        Бессрочная
      </span>
    )
  }
  const daysLeft = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000)
  if (daysLeft <= 0) {
    return (
      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
        Истекла
      </span>
    )
  }
  const label = daysLeft === 1 ? '1 день' : daysLeft < 5 ? `${daysLeft} дня` : `${daysLeft} дней`
  return (
    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">
      {label}
    </span>
  )
}

// Helpers
function pluralizeRu(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return many
  if (last === 1) return one
  if (last >= 2 && last <= 4) return few
  return many
}

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

function formatLinkDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
}
