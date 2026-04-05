'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams } from 'next/navigation'
import {
  ChevronDown,
  ChevronRight,
  MessageCircle,
  Play,
  Pencil,
  Download,
  ExternalLink,
  ImageOff,
  Clapperboard,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { sharingApi } from '@/lib/api/sharing'
import { ReviewerLightbox } from '@/components/sharing/ReviewerLightbox'
import { ReviewerNameInput } from '@/components/sharing/ReviewerNameInput'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { DisplaySettingsPopover } from '@/components/display/DisplaySettingsPopover'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { useDisplayStore } from '@/lib/store/project-display'
import { ASPECT_RATIO_CLASSES, FIT_MODE_CLASSES, DISPLAY_GRID_CONFIG, CARD_SIZES } from '@/lib/utils/constants'
import type { PublicProject, PublicElement, Comment, DisplayCardSize, DisplayAspectRatio, DisplayFitMode } from '@/lib/types'

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

// ── Element card ─────────────────────────────────────────────

function ElementCard({
  element,
  commentCount,
  onClick,
  aspectRatioClass,
  fitModeClass,
  hasIdentity,
  myReaction,
  onReact,
}: {
  element: PublicElement
  commentCount: number
  onClick: () => void
  aspectRatioClass: string
  fitModeClass: string
  hasIdentity: boolean
  myReaction: string | null
  onReact: (elementId: number, value: 'like' | 'dislike') => void
}) {
  const [imgError, setImgError] = useState(false)
  const isVideo = element.element_type === 'VIDEO'
  const hasLikes = (element.likes ?? 0) > 0
  const hasDislikes = (element.dislikes ?? 0) > 0
  const hasReactions = hasLikes || hasDislikes

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

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-150" />

        {/* Video play button */}
        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-11 h-11 rounded-full bg-overlay-button flex items-center justify-center">
              <Play className="w-5 h-5 text-overlay-text fill-overlay-text" />
            </div>
          </div>
        )}

        {/* Hover: download + original — top-right */}
        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10">
          <button
            onClick={(e) => { e.stopPropagation(); handleDownload(element.file_url, `element-${element.id}`) }}
            className="w-7 h-7 rounded-full bg-overlay-button hover:bg-overlay-button-hover flex items-center justify-center"
            aria-label="Скачать"
          >
            <Download className="w-3.5 h-3.5 text-overlay-text" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); window.open(element.file_url, '_blank') }}
            className="w-7 h-7 rounded-full bg-overlay-button hover:bg-overlay-button-hover flex items-center justify-center"
            aria-label="Открыть оригинал"
          >
            <ExternalLink className="w-3.5 h-3.5 text-overlay-text" />
          </button>
        </div>

        {/* Top-left badges */}
        <div className="absolute top-2 left-2 flex items-center gap-1 z-10">
          {element.source_type === 'GENERATED' && (
            <div className="bg-black/60 text-white text-[11px] rounded-md px-2 py-1 font-bold leading-none">
              AI
            </div>
          )}
          {commentCount > 0 && (
            <div className="flex items-center gap-1 bg-black/60 text-white text-xs rounded-full px-2 py-0.5">
              <MessageCircle className="w-3 h-3" />
              {commentCount}
            </div>
          )}
        </div>
      </div>

      {/* Filename below image */}
      {element.original_filename && (
        <div className="px-2 py-1 text-xs text-muted-foreground truncate bg-card border border-t-0 border-border border-b-0">
          {element.original_filename}
        </div>
      )}

      {/* Action bar BELOW the image — always visible, not overlapping */}
      <div className="flex items-center rounded-b-md bg-card border border-t-0 border-border px-2 py-1.5">
        {/* Like button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (!hasIdentity) {
              toast.info('Введите имя, чтобы оставить реакцию')
              return
            }
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

        {/* Dislike button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (!hasIdentity) {
              toast.info('Введите имя, чтобы оставить реакцию')
              return
            }
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
  onElementClick,
  gridStyle,
  gridGap,
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
  onElementClick: (element: PublicElement) => void
  gridStyle: React.CSSProperties
  gridGap: string
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
        <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
          {elements.length}
        </span>
      </button>

      {/* Elements grid */}
      {open && (
        <div className="px-4 pb-4">
          <div className={`grid ${gridGap}`} style={gridStyle}>
            {elements.map((el) => (
              <ElementCard
                key={el.id}
                element={el}
                commentCount={(commentsMap[el.id] || []).length}
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

  // Reviewer name (display in header)
  const [reviewerName, setReviewerName] = useState('')

  // Comments map: elementId -> Comment[]
  const [commentsMap, setCommentsMap] = useState<Record<number, Comment[]>>({})

  // Reactions state: elementId -> 'like' | 'dislike' | null
  const [reactionsMap, setReactionsMap] = useState<Record<number, string | null>>({})
  const [sessionId, setSessionId] = useState('')

  // Review state: elementId -> 'approved' | 'changes_requested' | 'rejected' | null
  const [reviewMap, setReviewMap] = useState<Record<number, string | null>>({})

  // Authenticated user detection — skip name input & CTA
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  // Display preferences
  const { preferences, hydratePreferences } = useDisplayStore()
  useEffect(() => { hydratePreferences() }, [hydratePreferences])
  const gridConfig = DISPLAY_GRID_CONFIG[preferences.size][preferences.aspectRatio]
  const minWidth = CARD_SIZES[preferences.size][preferences.aspectRatio].width
  const gridStyle: React.CSSProperties = { gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))` }
  const aspectRatioClass = ASPECT_RATIO_CLASSES[preferences.aspectRatio]
  const fitModeClass = FIT_MODE_CLASSES[preferences.fitMode]

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
          setSessionId(stored?.state?.user?.id?.toString() || crypto.randomUUID())
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
        // Build comments map from element-level comments returned by backend
        const map: Record<number, Comment[]> = {}
        for (const el of data.ungrouped_elements) {
          map[el.id] = el.comments || []
        }
        for (const scene of data.scenes) {
          for (const el of scene.elements) {
            map[el.id] = el.comments || []
          }
        }
        setCommentsMap(map)

        // Initialize reactionsMap — resolve effective session_id the same way
        // as the identity effect: auth user → user.id, guest → reviewer_session_id
        let effectiveSid = ''
        try {
          const authData = JSON.parse(localStorage.getItem('auth-storage') || '{}')
          effectiveSid = authData?.state?.user?.id?.toString() || ''
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

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between">
          {/* Logo */}
          <a href="/" className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity">
            <Clapperboard className="h-5 w-5 text-primary" strokeWidth={1.75} />
            <span className="text-sm font-semibold text-foreground tracking-tight hidden sm:inline">
              Раскадровка
            </span>
          </a>

          {/* Project name — center */}
          <h1 className="text-sm font-medium text-foreground truncate mx-4 max-w-[40%] text-center">
            {project.name}
          </h1>

          {/* Controls */}
          <div className="flex items-center gap-1">
            <DisplaySettingsPopover />
            <ThemeToggle />
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-1.5 h-9 px-3 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-150">
                  <span className="truncate max-w-[100px]">{reviewerName || 'Гость'}</span>
                  {!isAuthenticated && <Pencil className="w-3 h-3 flex-shrink-0 opacity-50" />}
                </button>
              </PopoverTrigger>
              {!isAuthenticated && (
                <PopoverContent align="end" className="w-64 p-3">
                  <ReviewerNameInput onSave={(name, sid) => {
                    setReviewerName(name)
                    setSessionId(sid)
                  }} />
                </PopoverContent>
              )}
            </Popover>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 space-y-6">
        {/* Ungrouped elements */}
        {hasUngrouped && (
          <div className="rounded-lg bg-background border border-border p-4">
            <div className={`grid ${gridConfig.gap}`} style={gridStyle}>
              {project.ungrouped_elements.map((el) => (
                <ElementCard
                  key={el.id}
                  element={el}
                  commentCount={(commentsMap[el.id] || []).length}
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
            onElementClick={handleElementClick}
            gridStyle={gridStyle}
            gridGap={gridConfig.gap}
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
