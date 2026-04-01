'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { ChevronDown, ChevronRight, MessageCircle, Play, Pencil } from 'lucide-react'
import { sharingApi } from '@/lib/api/sharing'
import { ReviewerLightbox } from '@/components/sharing/ReviewerLightbox'
import type { PublicProject, PublicElement, Comment } from '@/lib/types'

// ── Error states ─────────────────────────────────────────────

function ErrorView({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center px-6">
        <h1 className="text-2xl font-semibold text-foreground mb-2">{title}</h1>
        {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  )
}

function LoadingView() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-muted-foreground animate-pulse">Загрузка...</div>
    </div>
  )
}

// ── Element card ─────────────────────────────────────────────

function ElementCard({
  element,
  onClick,
}: {
  element: PublicElement
  onClick: () => void
}) {
  const isVideo = element.element_type === 'VIDEO'

  return (
    <button
      onClick={onClick}
      className="group relative aspect-square rounded-lg overflow-hidden bg-muted/20 border border-border hover:border-primary/50 transition-all cursor-pointer"
    >
      <img
        src={element.thumbnail_url || element.file_url}
        alt=""
        className="w-full h-full object-cover transition-transform group-hover:scale-[1.02]"
        loading="lazy"
      />

      {/* Video overlay */}
      {isVideo && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
            <Play className="w-5 h-5 text-white fill-white" />
          </div>
        </div>
      )}

      {/* Comment badge */}
      {element.comment_count > 0 && (
        <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/60 text-white text-xs rounded-full px-2 py-0.5">
          <MessageCircle className="w-3 h-3" />
          {element.comment_count}
        </div>
      )}
    </button>
  )
}

// ── Scene section ────────────────────────────────────────────

function SceneSection({
  name,
  elements,
  collapsible,
  onElementClick,
}: {
  name: string
  elements: PublicElement[]
  collapsible: boolean
  onElementClick: (element: PublicElement) => void
}) {
  const [open, setOpen] = useState(true)

  if (elements.length === 0) return null

  return (
    <div>
      {collapsible && (
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 mb-3 text-foreground hover:text-foreground/80 transition-colors"
        >
          {open ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          <h2 className="text-base font-medium">{name}</h2>
          <span className="text-xs text-muted-foreground">({elements.length})</span>
        </button>
      )}

      {open && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {elements.map((el) => (
            <ElementCard
              key={el.id}
              element={el}
              onClick={() => onElementClick(el)}
            />
          ))}
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

  // Load reviewer name from localStorage
  useEffect(() => {
    setReviewerName(localStorage.getItem('reviewer_name') || '')
    const onStorage = () => setReviewerName(localStorage.getItem('reviewer_name') || '')
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
    setCommentsMap((prev) => ({
      ...prev,
      [elementId]: [...(prev[elementId] || []), comment],
    }))
  }, [])

  const handleEditName = () => {
    const name = prompt('Как вас зовут?', reviewerName)
    if (name && name.trim()) {
      localStorage.setItem('reviewer_name', name.trim())
      setReviewerName(name.trim())
    }
  }

  // Render states
  if (loading) return <LoadingView />
  if (error) return <ErrorView title={error.message} />
  if (!project) return <ErrorView title="Ошибка загрузки" />

  // Determine layout: single scene with no ungrouped = flat grid
  const hasUngrouped = project.ungrouped_elements.length > 0
  const hasMultipleSections = project.scenes.length > 1 || (project.scenes.length === 1 && hasUngrouped)
  const showCollapsible = hasMultipleSections

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground tracking-tight">
            Раскадровка
          </span>
          <h1 className="text-sm font-medium text-foreground truncate mx-4 max-w-[50%] text-center">
            {project.name}
          </h1>
          <div className="flex items-center gap-1.5">
            {reviewerName ? (
              <button
                onClick={handleEditName}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <span className="truncate max-w-[120px]">{reviewerName}</span>
                <Pencil className="w-3 h-3 flex-shrink-0" />
              </button>
            ) : (
              <span className="text-sm text-muted-foreground">Гость</span>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 space-y-6">
        {/* Ungrouped elements */}
        {hasUngrouped && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {project.ungrouped_elements.map((el) => (
              <ElementCard
                key={el.id}
                element={el}
                onClick={() => handleElementClick(el)}
              />
            ))}
          </div>
        )}

        {/* Scene sections */}
        {project.scenes.map((scene) => (
          <SceneSection
            key={scene.id}
            name={scene.name}
            elements={scene.elements}
            collapsible={showCollapsible}
            onElementClick={handleElementClick}
          />
        ))}

        {/* Empty state */}
        {allElements.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <p className="text-lg">В этой раскадровке пока нет материалов</p>
          </div>
        )}
      </main>

      {/* Footer CTA */}
      <footer className="border-t border-border py-6">
        <div className="text-center">
          <a
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Создавайте свои проекты на Раскадровке &rarr;
          </a>
        </div>
      </footer>

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
      />
    </div>
  )
}
