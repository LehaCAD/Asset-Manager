'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams } from 'next/navigation'
import {
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Play,
  Pencil,
  Download,
  ImageOff,
  Clapperboard,
  ThumbsUp,
  ThumbsDown,
  X,
  Video,
  Image as ImageIcon,
  Sun,
  Moon,
  User as UserIcon,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { sharingApi } from '@/lib/api/sharing'
import { ReviewerLightbox } from '@/components/sharing/ReviewerLightbox'
import { ReviewerNameInput } from '@/components/sharing/ReviewerNameInput'
import { CommentThread } from '@/components/sharing/CommentThread'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { DisplaySettingsPopover } from '@/components/display/DisplaySettingsPopover'
import { useDisplayStore } from '@/lib/store/project-display'
import { ASPECT_RATIO_CLASSES, FIT_MODE_CLASSES, DISPLAY_GRID_CONFIG, WS_BASE_URL } from '@/lib/utils/constants'
import type { PublicProject, PublicElement, Comment, DisplayCardSize, DisplayAspectRatio, DisplayFitMode } from '@/lib/types'
import { getDownloadFilename } from '@/lib/utils/download-filename'

/** Aggregate review status (worst-wins): rejected > changes_requested > approved */
function getReviewStatus(reviews?: { action: string }[]): string | null {
  if (!reviews || reviews.length === 0) return null
  const actions = reviews.map(r => r.action)
  if (actions.includes('rejected')) return 'rejected'
  if (actions.includes('changes_requested')) return 'changes_requested'
  return 'approved'
}

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

// ── Error / Loading states ──────────────────────────────────

function ErrorView({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center px-6">
        <div className="flex justify-center mb-4">
          <ImageOff className="w-12 h-12 text-muted-foreground/50" />
        </div>
        <h1 className="text-2xl font-semibold text-foreground mb-2">{title}</h1>
        {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  )
}

function LoadingView() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-muted-foreground">Загрузка...</span>
      </div>
    </div>
  )
}

function totalCommentCount(comments: Comment[]): number {
  return comments.reduce((sum, c) => sum + 1 + (c.replies?.length || 0), 0)
}

// ── Identity + theme popover (reviewer header) ──────────────

function ReviewerIdentityMenu({
  isAuthenticated,
  name,
  onSaveIdentity,
}: {
  isAuthenticated: boolean
  name: string
  onSaveIdentity: (name: string, sessionId: string) => void
}) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const isDark = mounted && resolvedTheme === 'dark'

  const displayName = name || 'Гость'
  const initials = name ? name.slice(0, 2).toUpperCase() : null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center justify-center h-9 w-9 rounded-full transition-colors shrink-0",
            initials
              ? "bg-primary text-primary-foreground font-semibold text-[11px] hover:brightness-110"
              : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
          )}
          aria-label={initials ? `Профиль ${displayName}` : "Войти"}
          title={displayName}
        >
          {initials ? (
            <span className="tracking-wide">{initials}</span>
          ) : (
            <UserIcon className="h-4 w-4" strokeWidth={1.75} />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-64 p-0 overflow-hidden z-[80]"
      >
        {/* Identity header */}
        <div className="px-4 py-3 border-b border-border">
          <p className="text-[11px] text-muted-foreground">Вы вошли как</p>
          <div className="flex items-center gap-1.5 mt-1">
            <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
            {!isAuthenticated && (
              <Pencil className="w-3 h-3 flex-shrink-0 text-muted-foreground opacity-60" />
            )}
          </div>
        </div>

        {/* Guest name input */}
        {!isAuthenticated && (
          <div className="px-4 py-3 border-b border-border">
            <p className="text-[11px] text-muted-foreground mb-2">
              Укажите имя, чтобы оставить отзыв или комментарий.
            </p>
            <ReviewerNameInput onSave={onSaveIdentity} />
          </div>
        )}

        {/* Theme segmented switch — icon-only, full-width, matches navbar */}
        <div className="px-3 py-3">
          <div
            role="group"
            aria-label="Переключение темы"
            className="flex items-center rounded-md border border-border bg-muted/40 p-0.5"
          >
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={cn(
                "flex-1 inline-flex items-center justify-center h-8 rounded-sm transition-colors",
                !isDark
                  ? "bg-primary/15 text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-label="Светлая тема"
              aria-pressed={!isDark}
            >
              <Sun className="h-[18px] w-[18px]" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={cn(
                "flex-1 inline-flex items-center justify-center h-8 rounded-sm transition-colors",
                isDark
                  ? "bg-primary/15 text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-label="Тёмная тема"
              aria-pressed={isDark}
            >
              <Moon className="h-[18px] w-[18px]" strokeWidth={2} />
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ── Element card ─────────────────────────────────────────────

function ElementCard({
  element,
  commentCount,
  newCount,
  onClick,
  aspectRatioClass,
  fitModeClass,
  hasIdentity,
  myReaction,
  onReact,
}: {
  element: PublicElement
  commentCount: number
  newCount?: number
  onClick: () => void
  aspectRatioClass: string
  fitModeClass: string
  hasIdentity: boolean
  myReaction: string | null
  onReact: (elementId: number, value: 'like' | 'dislike') => void
}) {
  const [imgError, setImgError] = useState(false)
  const isVideo = element.element_type === 'VIDEO'
  const reviewStatus = getReviewStatus(element.reviews)
  const hasLikes = (element.likes ?? 0) > 0
  const hasDislikes = (element.dislikes ?? 0) > 0

  return (
    <div className="flex flex-col">
      {/* Image area — clickable to open lightbox */}
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick() }}
        className={`group relative rounded-t-md overflow-hidden bg-muted cursor-pointer ${aspectRatioClass}`}
      >
        {/* Review status bar */}
        {reviewStatus && (
          <div className={cn(
            "absolute top-0 left-0 right-0 h-[3px] z-10",
            reviewStatus === 'approved' && "bg-emerald-500",
            reviewStatus === 'changes_requested' && "bg-orange-500",
            reviewStatus === 'rejected' && "bg-red-500/70",
          )} />
        )}

        {imgError ? (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <ImageOff className="w-8 h-8 text-muted-foreground/30" />
          </div>
        ) : (
          <img
            src={element.preview_url || element.thumbnail_url || element.file_url}
            alt=""
            className={`w-full h-full ${fitModeClass} transition-transform duration-150 group-hover:scale-[1.02]`}
            loading="lazy"
            decoding="async"
            onError={() => setImgError(true)}
          />
        )}

        {/* Hover overlay — same as workspace */}
        <div className={cn(
          "absolute inset-0 z-20 bg-overlay",
          "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
          "flex flex-col justify-between p-2"
        )}>
          <div />
          {/* Center - Play icon for video */}
          {isVideo && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="rounded-md bg-overlay-button hover:bg-overlay-button-hover p-1.5">
                <Play className="h-5 w-5 text-overlay-text fill-white" />
              </div>
            </div>
          )}
          {/* Bottom row — download only (no delete for reviewer) */}
          <div className="flex justify-between items-center">
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleDownload(element.file_url, getDownloadFilename(element))
              }}
              className="rounded-md bg-overlay-button hover:bg-overlay-button-hover transition-colors text-overlay-text p-1.5"
              aria-label="Скачать"
            >
              <Download className="h-4 w-4" />
            </button>
            <div />
          </div>
        </div>

        {/* Top-right badges: media type + AI — same as workspace */}
        <div className="absolute top-2 right-2 z-40 flex items-center gap-1">
          {/* Media type — always visible */}
          <div className="rounded-md bg-black/60 backdrop-blur-sm h-6 w-6 flex items-center justify-center">
            {isVideo ? (
              <Video className="h-3.5 w-3.5 text-white" />
            ) : (
              <ImageIcon className="h-3.5 w-3.5 text-white" />
            )}
          </div>
          {/* AI badge */}
          {element.source_type === 'GENERATED' && (
            <div className="rounded-md bg-black/60 backdrop-blur-sm h-6 w-6 flex items-center justify-center">
              <span className="text-white font-bold leading-none text-[10px]">AI</span>
            </div>
          )}
        </div>

        {/* Top-left: comment count badge */}
        {commentCount > 0 && (
          <div className="absolute top-2 left-2 z-30">
            <div className="rounded-md bg-black/60 backdrop-blur-sm h-6 px-1.5 flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5 text-white" />
              <span className="text-[11px] font-semibold text-white">
                {commentCount > 99 ? '99+' : commentCount}
              </span>
              {(newCount ?? 0) > 0 && (
                <span className="bg-primary text-white text-[9px] font-bold rounded px-1">
                  +{newCount}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Action bar BELOW the image — reactions */}
      <div className="flex items-center rounded-b-md bg-card border border-t-0 border-border px-2 py-1.5">
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (!hasIdentity) { toast.info('Введите имя, чтобы оставить реакцию'); return }
            onReact(element.id, 'like')
          }}
          className={cn(
            'flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium transition-all',
            myReaction === 'like'
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              : 'text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-500/10'
          )}
          aria-label="Нравится"
        >
          <ThumbsUp className="w-4 h-4" />
          {hasLikes && <span>{element.likes}</span>}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (!hasIdentity) { toast.info('Введите имя, чтобы оставить реакцию'); return }
            onReact(element.id, 'dislike')
          }}
          className={cn(
            'flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium transition-all',
            myReaction === 'dislike'
              ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400'
              : 'text-muted-foreground hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-500/10'
          )}
          aria-label="Не нравится"
        >
          <ThumbsDown className="w-4 h-4" />
          {hasDislikes && <span>{element.dislikes}</span>}
        </button>
      </div>
    </div>
  )
}

// ── Scene section ────────────────────────────────────────────

function SceneSection({
  name,
  elements,
  collapsible,
  commentsMap,
  newCommentCounts,
  onElementClick,
  gridStyle,
  gridGap,
  mobileGridClass,
  aspectRatioClass,
  fitModeClass,
  hasIdentity,
  reactionsMap,
  onReact,
}: {
  name: string
  elements: PublicElement[]
  collapsible: boolean
  commentsMap: Record<number, Comment[]>
  newCommentCounts: Record<number, number>
  onElementClick: (element: PublicElement) => void
  gridStyle: React.CSSProperties
  gridGap: string
  mobileGridClass: string
  aspectRatioClass: string
  fitModeClass: string
  hasIdentity: boolean
  reactionsMap: Record<number, string | null>
  onReact: (elementId: number, value: 'like' | 'dislike') => void
}) {
  const [open, setOpen] = useState(true)

  if (elements.length === 0) return null

  return (
    <div className="rounded-lg bg-background border border-border overflow-hidden">
      {/* Scene header */}
      <button
        onClick={() => collapsible && setOpen(!open)}
        className={`w-full flex items-center gap-2 px-4 py-3 text-left ${
          collapsible ? 'hover:bg-muted/30 cursor-pointer' : 'cursor-default'
        } transition-colors`}
      >
        {collapsible && (
          open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        <h2 className="text-sm font-medium text-foreground">{name}</h2>
        <span className="text-xs text-muted-foreground bg-muted rounded px-2 py-0.5">
          {elements.length}
        </span>
      </button>

      {/* Elements grid */}
      {open && (
        <div className="px-4 pb-4">
          <div className={`grid ${mobileGridClass} ${gridGap}`} style={gridStyle}>
            {elements.map((el) => (
              <ElementCard
                key={el.id}
                element={el}
                commentCount={totalCommentCount(commentsMap[el.id] || [])}
                newCount={newCommentCounts[el.id]}
                onClick={() => onElementClick(el)}
                aspectRatioClass={aspectRatioClass}
                fitModeClass={fitModeClass}
                hasIdentity={hasIdentity}
                myReaction={reactionsMap[el.id] ?? null}
                onReact={onReact}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────

export default function PublicSharePage() {
  const params = useParams<{ token: string }>()
  const token = params.token

  const [project, setProject] = useState<PublicProject | null>(null)
  const [error, setError] = useState<{ status: number; message: string } | null>(null)
  const [loading, setLoading] = useState(true)

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  // Discussion overlay for reviewer
  const [discussionOpen, setDiscussionOpen] = useState(false)
  useEffect(() => {
    if (!discussionOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setDiscussionOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [discussionOpen])

  // Reviewer name (display in header)
  const [reviewerName, setReviewerName] = useState('')

  // Comments map: elementId -> Comment[]
  const [commentsMap, setCommentsMap] = useState<Record<number, Comment[]>>({})

  // General (link-level) comments
  const [generalComments, setGeneralComments] = useState<Comment[]>([])

  // Reactions state: elementId -> 'like' | 'dislike' | null
  const [reactionsMap, setReactionsMap] = useState<Record<number, string | null>>({})
  const [sessionId, setSessionId] = useState('')

  // Review state: elementId -> 'approved' | 'changes_requested' | 'rejected' | null
  const [reviewMap, setReviewMap] = useState<Record<number, string | null>>({})

  // Track new updates from others (for badges on element cards)
  const [newCommentCounts, setNewCommentCounts] = useState<Record<number, number>>({})
  const [newGeneralCount, setNewGeneralCount] = useState(0)

  // Authenticated user detection — skip name input & CTA
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  // Display preferences
  const { preferences, hydratePreferences } = useDisplayStore()
  useEffect(() => { hydratePreferences() }, [hydratePreferences])
  const gridConfig = DISPLAY_GRID_CONFIG[preferences.size][preferences.aspectRatio]
  const gridStyle: React.CSSProperties = { gridTemplateColumns: `repeat(auto-fill, minmax(${gridConfig.minWidth}px, 1fr))` }
  const aspectRatioClass = ASPECT_RATIO_CLASSES[preferences.aspectRatio]
  const fitModeClass = FIT_MODE_CLASSES[preferences.fitMode]
  // Mobile density: landscape/square cards span full width; portrait packs 2 per row.
  const mobileGridClass = preferences.aspectRatio === 'portrait' ? 'grid-mobile-2' : 'grid-mobile-1'

  // Check if user is authenticated — use their identity and hide CTA
  useEffect(() => {
    const hasToken = /(?:^|;\s*)access_token=/.test(document.cookie) || !!localStorage.getItem('auth-storage')
    setIsAuthenticated(hasToken)
    if (hasToken) {
      try {
        const stored = JSON.parse(localStorage.getItem('auth-storage') || '{}')
        const username = stored?.state?.user?.username
        if (username) {
          setReviewerName(username)
          setSessionId(`user_${stored.state.user.id}`)
          return // skip guest identity loading
        }
      } catch { /* ignore parse errors */ }
    }
    // Fallback: load guest reviewer identity from localStorage
    setReviewerName(localStorage.getItem('reviewer_name') || '')
    setSessionId(localStorage.getItem('reviewer_session_id') || '')
    const onStorage = () => {
      setReviewerName(localStorage.getItem('reviewer_name') || '')
      setSessionId(localStorage.getItem('reviewer_session_id') || '')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Fetch project
  useEffect(() => {
    if (!token) return
    setLoading(true)
    sharingApi
      .getPublicProject(token)
      .then((data) => {
        setProject(data)
        // Apply saved display preferences from the shared link
        if (data.display_preferences && data.display_preferences.size) {
          useDisplayStore.getState().setPreferences({
            size: data.display_preferences.size as DisplayCardSize,
            aspectRatio: (data.display_preferences.aspectRatio || 'landscape') as DisplayAspectRatio,
            fitMode: (data.display_preferences.fitMode || 'fill') as DisplayFitMode,
            showMetadata: (data.display_preferences as any).showMetadata ?? true,
          })
        }
        // Build comments map from element-level comments (filter out system comments from old review actions)
        const filterSystem = (comments: Comment[]): Comment[] =>
          comments.filter(c => !c.is_system).map(c => ({
            ...c,
            replies: c.replies ? filterSystem(c.replies) : [],
          }))
        const map: Record<number, Comment[]> = {}
        for (const el of data.ungrouped_elements) {
          map[el.id] = filterSystem(el.comments || [])
        }
        for (const scene of data.scenes) {
          for (const el of scene.elements) {
            map[el.id] = filterSystem(el.comments || [])
          }
        }
        setCommentsMap(map)

        // Load general (link-level) comments
        if (data.general_comments) {
          setGeneralComments(data.general_comments.filter((c: any) => !c.is_system))
        }

        // Initialize reactionsMap — resolve effective session_id the same way
        // as the identity effect: auth user → user.id, guest → reviewer_session_id
        let effectiveSid = ''
        try {
          const authData = JSON.parse(localStorage.getItem('auth-storage') || '{}')
          effectiveSid = authData?.state?.user?.id ? `user_${authData.state.user.id}` : ''
        } catch { /* ignore */ }
        if (!effectiveSid) {
          effectiveSid = localStorage.getItem('reviewer_session_id') || ''
        }
        if (effectiveSid) {
          const rMap: Record<number, string | null> = {}
          const allEls = [...data.ungrouped_elements, ...data.scenes.flatMap(s => s.elements)]
          for (const el of allEls) {
            const myReaction = el.reactions?.find(r => r.session_id === effectiveSid)
            rMap[el.id] = myReaction?.value ?? null
          }
          setReactionsMap(rMap)

          // Initialize reviewMap from element reviews data
          const rvMap: Record<number, string | null> = {}
          for (const el of allEls) {
            const myReview = el.reviews?.find(r => r.session_id === effectiveSid)
            rvMap[el.id] = myReview?.action ?? null
          }
          setReviewMap(rvMap)
        }
      })
      .catch((err) => {
        const status = err?.response?.status || 0
        if (status === 410) {
          setError({ status: 410, message: 'Срок ссылки истёк' })
        } else if (status === 404) {
          setError({ status: 404, message: 'Ссылка не найдена' })
        } else {
          setError({ status: 0, message: 'Ошибка загрузки' })
        }
      })
      .finally(() => setLoading(false))
  }, [token])

  // Flat list of all elements for lightbox navigation
  const allElements = useMemo(() => {
    if (!project) return []
    const els: PublicElement[] = [...project.ungrouped_elements]
    for (const scene of project.scenes) {
      els.push(...scene.elements)
    }
    return els
  }, [project])

  const handleElementClick = useCallback(
    (element: PublicElement) => {
      const idx = allElements.findIndex((e) => e.id === element.id)
      if (idx >= 0) {
        setLightboxIndex(idx)
        setLightboxOpen(true)
        // Clear new comment badge for this element
        setNewCommentCounts((prev) => {
          if (!prev[element.id]) return prev
          const next = { ...prev }
          delete next[element.id]
          return next
        })
      }
    },
    [allElements]
  )

  const handleCommentAdded = useCallback((elementId: number, comment: Comment) => {
    setCommentsMap((prev) => {
      const existing = prev[elementId] || []

      // If reply, nest under parent comment
      if (comment.parent) {
        const nestReply = (comments: Comment[]): Comment[] =>
          comments.map((c) => {
            if (c.id === comment.parent) {
              return { ...c, replies: [...(c.replies || []), comment] }
            }
            if (c.replies?.length) {
              return { ...c, replies: nestReply(c.replies) }
            }
            return c
          })
        return { ...prev, [elementId]: nestReply(existing) }
      }

      // Top-level comment — append
      return { ...prev, [elementId]: [...existing, comment] }
    })
  }, [])

  const handleReviewChanged = useCallback((elementId: number, action: string | null) => {
    setReviewMap((prev) => ({ ...prev, [elementId]: action }))
  }, [])

  // General comment submit handler
  const handleGeneralCommentSubmit = useCallback(async (text: string, parentId?: number) => {
    const resp = await sharingApi.addPublicComment(token as string, {
      text,
      author_name: reviewerName,
      session_id: sessionId,
      parent_id: parentId,
    })
    if (resp) {
      setGeneralComments((prev) => {
        if (parentId) {
          return prev.map(c =>
            c.id === parentId
              ? { ...c, replies: [...(c.replies || []), resp] }
              : c
          )
        }
        return [...prev, resp]
      })
    }
  }, [token, reviewerName, sessionId])

  // WebSocket подключение для real-time обновлений
  const projectLoaded = !!project
  useEffect(() => {
    if (!projectLoaded) return

    const wsUrl = `${WS_BASE_URL}/ws/sharing/${token}/`
    let ws: WebSocket | null = null
    let pingInterval: ReturnType<typeof setInterval> | null = null
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
    let reconnectAttempts = 0
    const MAX_RECONNECT = 5

    function connect() {
      ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        reconnectAttempts = 0
        pingInterval = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }))
          }
        }, 30000)
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          if (data.type === 'new_comment') {
            // Skip own comments — already added optimistically from API response
            if (data.session_id && data.session_id === sessionId) return

            const newComment: Comment = {
              id: data.comment_id,
              element: data.element_id || null,
              scene: data.scene_id || null,
              parent: data.parent_id || null,
              author_name: data.author_name,
              author_user: null,
              session_id: data.session_id || '',
              text: data.text,
              is_read: false,
              created_at: data.created_at,
              replies: [],
            }

            // Helper: check if comment exists anywhere in tree
            const existsInTree = (comments: Comment[], id: number): boolean =>
              comments.some((c) => c.id === id || (c.replies || []).some((r) => r.id === id))

            if (data.element_id) {
              setCommentsMap((prev) => {
                const existing = prev[data.element_id] || []
                if (existsInTree(existing, data.comment_id)) return prev

                if (data.parent_id) {
                  return {
                    ...prev,
                    [data.element_id]: existing.map((c) =>
                      c.id === data.parent_id
                        ? { ...c, replies: [...(c.replies || []), newComment] }
                        : c
                    ),
                  }
                }
                return { ...prev, [data.element_id]: [...existing, newComment] }
              })
              // Track new comment for badge
              setNewCommentCounts((prev) => ({ ...prev, [data.element_id]: (prev[data.element_id] || 0) + 1 }))
              // Toast with click-to-open
              toast.info(`${data.author_name}: ${data.text.slice(0, 60)}${data.text.length > 60 ? '…' : ''}`)
            } else if (data.shared_link_id) {
              setGeneralComments((prev) => {
                if (existsInTree(prev, data.comment_id)) return prev

                if (data.parent_id) {
                  return prev.map((c) =>
                    c.id === data.parent_id
                      ? { ...c, replies: [...(c.replies || []), newComment] }
                      : c
                  )
                }
                return [...prev, newComment]
              })
              setNewGeneralCount((prev) => prev + 1)
              toast.info(`${data.author_name}: ${data.text.slice(0, 60)}${data.text.length > 60 ? '…' : ''}`)
            }
          } else if (data.type === 'reaction_updated') {
            setProject((prev) => {
              if (!prev) return prev
              const updateElement = (el: PublicElement) => {
                if (el.id === data.element_id) {
                  return { ...el, likes: data.likes, dislikes: data.dislikes }
                }
                return el
              }
              return {
                ...prev,
                ungrouped_elements: prev.ungrouped_elements.map(updateElement),
                scenes: prev.scenes.map((s) => ({
                  ...s,
                  elements: s.elements.map(updateElement),
                })),
              }
            })
            if (data.session_id === sessionId) {
              setReactionsMap((prev) => ({
                ...prev,
                [data.element_id]: data.value,
              }))
            }
          } else if (data.type === 'review_updated') {
            // Обновить reviews на элементе для полоски
            setProject((prev) => {
              if (!prev) return prev
              const updateEl = (el: any) => {
                if (el.id !== data.element_id) return el
                const reviews = (el.reviews || []).filter((r: any) => r.session_id !== data.session_id)
                if (data.action) {
                  reviews.push({ session_id: data.session_id, author_name: data.author_name, action: data.action })
                }
                return { ...el, reviews }
              }
              return {
                ...prev,
                ungrouped_elements: prev.ungrouped_elements.map(updateEl),
                scenes: prev.scenes.map((s: any) => ({ ...s, elements: s.elements.map(updateEl) })),
              }
            })
            if (data.session_id === sessionId) {
              setReviewMap((prev) => ({
                ...prev,
                [data.element_id]: data.action,
              }))
            }
          }
        } catch {
          // ignore malformed messages
        }
      }

      ws.onclose = () => {
        if (pingInterval) clearInterval(pingInterval)
        pingInterval = null
        if (reconnectAttempts < MAX_RECONNECT) {
          const delay = Math.min(1000 * 2 ** reconnectAttempts, 30000)
          reconnectAttempts++
          reconnectTimeout = setTimeout(connect, delay)
        }
      }

      ws.onerror = () => {
        // onclose will handle reconnect
      }
    }

    connect()

    return () => {
      if (pingInterval) clearInterval(pingInterval)
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      if (ws) {
        ws.onclose = null
        ws.close()
      }
    }
  }, [projectLoaded, token, sessionId])

  const handleIdentitySaved = useCallback((name: string, sid: string) => {
    setReviewerName(name)
    setSessionId(sid)
  }, [])

  const hasIdentity = !!reviewerName && !!sessionId

  const reactingRef = useRef<Set<number>>(new Set())

  const handleCardReaction = useCallback(async (elementId: number, value: 'like' | 'dislike') => {
    if (!sessionId || reactingRef.current.has(elementId)) return
    reactingRef.current.add(elementId)

    const previousValue = reactionsMap[elementId] ?? null
    const newValue = previousValue === value ? null : value

    // Optimistic update of button highlight only (not counts)
    setReactionsMap((prev) => ({ ...prev, [elementId]: newValue }))

    try {
      const res = await sharingApi.setReaction(token, {
        element_id: elementId,
        session_id: sessionId,
        value: newValue,
        author_name: reviewerName,
      })

      // Use SERVER counts — source of truth, no drift
      const serverData = res.data ?? res
      const serverLikes = serverData.likes ?? 0
      const serverDislikes = serverData.dislikes ?? 0

      setProject((prev) => {
        if (!prev) return prev
        const updateEl = (el: PublicElement): PublicElement =>
          el.id === elementId ? { ...el, likes: serverLikes, dislikes: serverDislikes } : el
        return {
          ...prev,
          ungrouped_elements: prev.ungrouped_elements.map(updateEl),
          scenes: prev.scenes.map((s) => ({ ...s, elements: s.elements.map(updateEl) })),
        }
      })
    } catch {
      // Revert button highlight
      setReactionsMap((prev) => ({ ...prev, [elementId]: previousValue }))
    } finally {
      reactingRef.current.delete(elementId)
    }
  }, [sessionId, reactionsMap, token, reviewerName])

  // Render states
  if (loading) return <LoadingView />
  if (error) return <ErrorView title={error.message} />
  if (!project) return <ErrorView title="Ошибка загрузки" />

  // Determine layout: single scene with no ungrouped = flat grid
  const hasUngrouped = project.ungrouped_elements.length > 0
  const hasMultipleSections = project.scenes.length > 1 || (project.scenes.length === 1 && hasUngrouped)
  const showCollapsible = hasMultipleSections

  const totalNewCount = newGeneralCount + Object.values(newCommentCounts).reduce((s, n) => s + n, 0)

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-[70] bg-background/80 backdrop-blur-sm border-b border-border">
        {/* Main bar */}
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 px-3 py-2 sm:px-4 sm:py-2.5">
          {/* Logo */}
          <a href="/" className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity">
            <Clapperboard className="h-5 w-5 text-primary" strokeWidth={1.75} />
            <span className="text-sm font-semibold text-foreground tracking-tight hidden md:inline">
              Раскадровка
            </span>
          </a>

          {/* Project name — truncated, centered on tablet+, hidden on xs (shown below) */}
          <div className="hidden sm:flex flex-1 flex-col items-center mx-4 max-w-[50%] min-w-0">
            <h1 className="text-sm font-medium text-foreground truncate w-full text-center">
              {project.name}
            </h1>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              {project.created_at && (
                <span>{new Date(project.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              )}
              {project.total_elements != null && (
                <span>· {project.total_elements} эл.</span>
              )}
              {project.expires_at ? (
                <span>· до {new Date(project.expires_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>
              ) : (
                <span>· бессрочная</span>
              )}
            </div>
          </div>

          {/* Controls — all h-9, breathing gap-2, right-aligned */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Обсуждение — icon-only on xs, label on sm+ */}
            <button
              onClick={() => { setDiscussionOpen(!discussionOpen); setNewGeneralCount(0); setNewCommentCounts({}) }}
              className={cn(
                "relative inline-flex items-center justify-center gap-1.5 h-9 rounded-md text-sm font-medium transition-colors",
                "w-9 sm:w-auto sm:px-3",
                discussionOpen ? "bg-primary/20 text-primary" : "bg-primary/10 text-primary hover:bg-primary/20"
              )}
              aria-label="Обсуждение"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">Обсуждение</span>
              {totalNewCount > 0 && !discussionOpen && (
                <span className={cn(
                  "bg-primary text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center leading-none",
                  "sm:static absolute -top-1 -right-1"
                )}>
                  {totalNewCount}
                </span>
              )}
            </button>

            <DisplaySettingsPopover />

            {/* User / guest identity popover (also holds theme toggle) */}
            <ReviewerIdentityMenu
              isAuthenticated={isAuthenticated}
              name={reviewerName}
              onSaveIdentity={(name, sid) => { setReviewerName(name); setSessionId(sid) }}
            />
          </div>
        </div>

        {/* Mobile-only secondary row with project title — больше воздуха, читаемый размер */}
        <div className="sm:hidden border-t border-border/50 px-4 py-3">
          <h1 className="text-base font-semibold text-foreground truncate leading-tight">{project.name}</h1>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">
            {project.total_elements != null && (
              <span>{project.total_elements} эл.</span>
            )}
            {project.expires_at ? (
              <span>· до {new Date(project.expires_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>
            ) : (
              <span>· бессрочная</span>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 space-y-6">
        {/* Ungrouped elements */}
        {hasUngrouped && (
          <div className="rounded-lg bg-background border border-border p-4">
            <div className={`grid ${mobileGridClass} ${gridConfig.gap}`} style={gridStyle}>
              {project.ungrouped_elements.map((el) => (
                <ElementCard
                  key={el.id}
                  element={el}
                  commentCount={totalCommentCount(commentsMap[el.id] || [])}
                  newCount={newCommentCounts[el.id]}
                  onClick={() => handleElementClick(el)}
                  aspectRatioClass={aspectRatioClass}
                  fitModeClass={fitModeClass}
                  hasIdentity={hasIdentity}
                  myReaction={reactionsMap[el.id] ?? null}
                  onReact={handleCardReaction}
                />
              ))}
            </div>
          </div>
        )}

        {/* Scene sections */}
        {project.scenes.map((scene) => (
          <SceneSection
            key={scene.id}
            name={scene.name}
            elements={scene.elements}
            collapsible={showCollapsible}
            commentsMap={commentsMap}
            newCommentCounts={newCommentCounts}
            onElementClick={handleElementClick}
            gridStyle={gridStyle}
            gridGap={gridConfig.gap}
            mobileGridClass={mobileGridClass}
            aspectRatioClass={aspectRatioClass}
            fitModeClass={fitModeClass}
            hasIdentity={hasIdentity}
            reactionsMap={reactionsMap}
            onReact={handleCardReaction}
          />
        ))}

        {/* Empty state */}
        {allElements.length === 0 && (
          <div className="rounded-lg bg-background border border-border p-16 flex flex-col items-center justify-center text-muted-foreground">
            <ImageOff className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-base">В этой раскадровке пока нет материалов</p>
          </div>
        )}
      </main>

      {/* Footer CTA — only for unauthenticated visitors */}
      {!isAuthenticated && (
        <footer className="border-t border-border mt-auto">
          <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Clapperboard className="h-8 w-8 text-primary shrink-0" strokeWidth={1.5} />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Управляйте проектами вместе с командой
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Собирайте обратную связь, отслеживайте прогресс, храните все материалы в одном месте
                  </p>
                </div>
              </div>
              <a
                href="/register"
                className="shrink-0 inline-flex items-center gap-2 h-9 px-5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Зарегистрироваться
              </a>
            </div>
          </div>
        </footer>
      )}

      {/* Discussion overlay */}
      {discussionOpen && (
        <div
          className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-sm overflow-y-auto pt-[72px] sm:pt-[60px]"
          onClick={(e) => { if (e.target === e.currentTarget) setDiscussionOpen(false) }}
        >
          <div className="max-w-[1100px] mx-auto px-3 py-4 sm:p-6">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Обсуждение</h2>
                <p className="text-xs text-muted-foreground">Все отзывы и комментарии по элементам</p>
              </div>
              <div className="flex-1" />
              <button
                onClick={() => setDiscussionOpen(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
              >
                <X className="w-4 h-4" />
                <span className="text-xs">Esc</span>
              </button>
            </div>

            {/* Elements with feedback */}
            <div className="flex flex-col gap-3">
              {allElements.map((el) => {
                const comments = commentsMap[el.id] || []
                const myReaction = reactionsMap[el.id]
                const reviews = el.reviews || []
                const reviewStatus = getReviewStatus(reviews)
                const hasContent = comments.length > 0 || (el.likes ?? 0) > 0 || (el.dislikes ?? 0) > 0 || reviews.length > 0

                return (
                  <div key={el.id} className="rounded-lg bg-card border border-border overflow-hidden">
                    <div className="flex gap-3 px-4 py-3">
                      {/* Thumbnail — clickable */}
                      <button
                        onClick={() => { setDiscussionOpen(false); handleElementClick(el) }}
                        className="shrink-0 w-14 h-10 rounded bg-muted overflow-hidden hover:ring-2 ring-primary/50 transition-all"
                      >
                        {el.thumbnail_url ? (
                          <img src={el.thumbnail_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[9px] text-muted-foreground">
                            {el.element_type === 'VIDEO' ? 'vid' : 'img'}
                          </div>
                        )}
                      </button>

                      {/* Info row */}
                      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => { setDiscussionOpen(false); handleElementClick(el) }}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Открыть
                        </button>
                        {reviewStatus && (
                          <span className={cn(
                            "text-[10px] font-medium px-1.5 py-0.5 rounded",
                            reviewStatus === 'approved' && "bg-emerald-500/10 text-emerald-500",
                            reviewStatus === 'changes_requested' && "bg-orange-500/10 text-orange-500",
                            reviewStatus === 'rejected' && "bg-red-500/10 text-red-400",
                          )}>
                            {reviewStatus === 'approved' ? '✓ Согласовано' : reviewStatus === 'changes_requested' ? '↻ На доработку' : '✕ Отклонено'}
                          </span>
                        )}
                        {(el.likes ?? 0) > 0 && (
                          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                            <ThumbsUp className="w-3 h-3" /> {el.likes}
                          </span>
                        )}
                        {(el.dislikes ?? 0) > 0 && (
                          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                            <ThumbsDown className="w-3 h-3" /> {el.dislikes}
                          </span>
                        )}
                        {comments.length > 0 && (
                          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                            <MessageSquare className="w-3 h-3" /> {totalCommentCount(comments)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Comments under element */}
                    {comments.length > 0 && (
                      <div className="border-t border-border px-4 py-3">
                        <CommentThread
                          comments={comments}
                          collapsedLimit={3}
                          onSubmit={async (text, parentId) => {
                            if (!reviewerName || !sessionId) return
                            const comment = await sharingApi.addPublicComment(token as string, {
                              text,
                              author_name: reviewerName,
                              session_id: sessionId,
                              element_id: el.id,
                              parent_id: parentId,
                            })
                            handleCommentAdded(el.id, comment)
                          }}
                          isAuthenticated={hasIdentity}
                        />
                      </div>
                    )}

                    {/* Empty state + quick comment */}
                    {comments.length === 0 && hasIdentity && (
                      <div className="border-t border-border px-4 py-2">
                        <CommentThread
                          comments={[]}
                          onSubmit={async (text, parentId) => {
                            if (!reviewerName || !sessionId) return
                            const comment = await sharingApi.addPublicComment(token as string, {
                              text,
                              author_name: reviewerName,
                              session_id: sessionId,
                              element_id: el.id,
                              parent_id: parentId,
                            })
                            handleCommentAdded(el.id, comment)
                          }}
                          isAuthenticated={hasIdentity}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* General comments */}
            <div className="mt-6 rounded-lg bg-card border border-border p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <MessageSquare className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-medium text-primary">Общее обсуждение</span>
              </div>
              {!hasIdentity ? (
                <div className="flex flex-col items-center gap-3 py-6">
                  <p className="text-sm text-muted-foreground text-center">Представьтесь, чтобы участвовать</p>
                  <ReviewerNameInput onSave={(name, sid) => {
                    setReviewerName(name)
                    setSessionId(sid)
                  }} />
                </div>
              ) : (
                <CommentThread
                  comments={generalComments}
                  onSubmit={handleGeneralCommentSubmit}
                  isAuthenticated={hasIdentity}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      <ReviewerLightbox
        elements={allElements}
        currentIndex={lightboxIndex}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        onNavigate={setLightboxIndex}
        token={token}
        commentsMap={commentsMap}
        onCommentAdded={handleCommentAdded}
        reactionsMap={reactionsMap}
        onReact={handleCardReaction}
        reviewerName={reviewerName}
        sessionId={sessionId}
        onIdentitySaved={handleIdentitySaved}
        reviewMap={reviewMap}
        onReviewChanged={handleReviewChanged}
      />
    </div>
  )
}
