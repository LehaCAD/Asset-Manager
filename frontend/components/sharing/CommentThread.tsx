'use client'

import { useState, useRef } from 'react'
import { MessageCircle, Send, X } from 'lucide-react'
import { Comment } from '@/lib/types'

// ── Helpers ──────────────────────────────────────────────────

function sessionIdToColor(sessionId: string): string {
  if (!sessionId) return 'hsl(0, 0%, 50%)'
  let hash = 0
  for (let i = 0; i < sessionId.length; i++) {
    hash = sessionId.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash % 360)
  return `hsl(${hue}, 60%, 60%)`
}

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return 'Только что'
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`
  if (diff < 172800) return 'Вчера'
  return new Date(dateStr).toLocaleDateString('ru-RU')
}

// ── Sub-components ────────────────────────────────────────────

interface AvatarProps {
  name: string
  sessionId: string
  size?: 'sm' | 'md'
}

function Avatar({ name, sessionId, size = 'sm' }: AvatarProps) {
  const color = sessionIdToColor(sessionId)
  const initial = name ? name.charAt(0).toUpperCase() : '?'
  const sizeClass = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-8 h-8 text-sm'

  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center font-medium text-white flex-shrink-0 select-none`}
      style={{ backgroundColor: color }}
      title={name}
    >
      {initial}
    </div>
  )
}

interface CommentItemProps {
  comment: Comment
  onReply: (comment: Comment) => void
  isReply?: boolean
}

function CommentItem({ comment, onReply, isReply = false }: CommentItemProps) {
  const parentSnippet = isReply && comment.parent !== null ? null : null

  return (
    <div className={`flex gap-2.5 ${isReply ? 'pl-8' : ''}`}>
      <Avatar name={comment.author_name} sessionId={comment.session_id} />
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-xs font-medium text-foreground truncate">
            {comment.author_name || 'Аноним'}
          </span>
          <span className="text-xs text-muted-foreground flex-shrink-0">
            {relativeTime(comment.created_at)}
          </span>
        </div>

        {/* Text */}
        <p className="text-sm text-foreground/90 break-words leading-snug">
          {comment.text}
        </p>

        {/* Reply action */}
        {!isReply && (
          <button
            onClick={() => onReply(comment)}
            className="mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <MessageCircle className="w-3 h-3" />
            Ответить
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────

export interface CommentThreadProps {
  comments: Comment[]
  onSubmit: (text: string, parentId?: number) => Promise<void>
  isAuthenticated: boolean
  isLoading?: boolean
}

export function CommentThread({
  comments,
  onSubmit,
  isAuthenticated,
  isLoading = false,
}: CommentThreadProps) {
  const [text, setText] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleReply = (comment: Comment) => {
    setReplyTo(comment)
    textareaRef.current?.focus()
  }

  const handleCancelReply = () => {
    setReplyTo(null)
  }

  const handleSubmit = async () => {
    const trimmed = text.trim()
    if (!trimmed) return
    if (!isAuthenticated && !authorName.trim()) return

    setSubmitting(true)
    try {
      await onSubmit(trimmed, replyTo?.id)
      setText('')
      setReplyTo(null)
    } finally {
      setSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const isEmpty = comments.length === 0

  return (
    <div className="flex flex-col gap-3">
      {/* Comment list */}
      {isEmpty ? (
        <div className="flex flex-col items-center gap-1.5 py-6 text-muted-foreground">
          <MessageCircle className="w-5 h-5 opacity-40" />
          <span className="text-xs">Комментариев пока нет</span>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {comments.map((comment) => (
            <div key={comment.id} className="flex flex-col gap-2">
              <CommentItem comment={comment} onReply={handleReply} />

              {/* Replies (1 level only) */}
              {comment.replies && comment.replies.length > 0 && (
                <div className="flex flex-col gap-2">
                  {comment.replies.map((reply) => (
                    <div key={reply.id} className="pl-8 flex gap-2.5">
                      <Avatar
                        name={reply.author_name}
                        sessionId={reply.session_id}
                      />
                      <div className="flex-1 min-w-0">
                        {/* Quoted parent reference */}
                        <div className="text-xs text-muted-foreground mb-0.5 truncate">
                          ↩{' '}
                          <span className="font-medium">
                            {comment.author_name || 'Аноним'}
                          </span>
                          :{' '}
                          {comment.text.length > 50
                            ? comment.text.slice(0, 50) + '…'
                            : comment.text}
                        </div>
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span className="text-xs font-medium text-foreground truncate">
                            {reply.author_name || 'Аноним'}
                          </span>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {relativeTime(reply.created_at)}
                          </span>
                        </div>
                        <p className="text-sm text-foreground/90 break-words leading-snug">
                          {reply.text}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-border pt-3 flex flex-col gap-2">
        {/* Anonymous name input */}
        {!isAuthenticated && (
          <input
            type="text"
            placeholder="Ваше имя"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            disabled={submitting || isLoading}
            className="w-full text-sm bg-muted/10 border border-border rounded-md px-3 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          />
        )}

        {/* Reply indicator */}
        {replyTo && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/10 rounded-md px-2.5 py-1.5">
            <span className="flex-1 truncate">
              ↩ Ответ для{' '}
              <span className="font-medium text-foreground">
                {replyTo.author_name || 'Аноним'}
              </span>
            </span>
            <button
              onClick={handleCancelReply}
              className="flex-shrink-0 hover:text-foreground transition-colors"
              aria-label="Отменить ответ"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Textarea + send */}
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            rows={2}
            placeholder="Написать комментарий… (Ctrl+Enter)"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={submitting || isLoading}
            className="flex-1 text-sm bg-muted/10 border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none disabled:opacity-50 leading-snug"
          />
          <button
            onClick={handleSubmit}
            disabled={
              submitting ||
              isLoading ||
              !text.trim() ||
              (!isAuthenticated && !authorName.trim())
            }
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Отправить"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default CommentThread
