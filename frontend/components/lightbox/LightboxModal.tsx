"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LightboxNavigation } from "@/components/lightbox/LightboxNavigation";
import { Filmstrip } from "@/components/lightbox/Filmstrip";
import { Button } from "@/components/ui/button";
import { ElementFilters } from "@/components/element/ElementFilters";
import { cn } from "@/lib/utils";
import {
  X,
  Download,
  ExternalLink,
  Trash2,
  Star,
  Video,
  Image,
  Play,
  Pause,
  Volume2,
  VolumeX,
  FilterX,
  Loader2,
  AlertCircle,
} from "lucide-react";
import type { Element, ElementFilter } from "@/lib/types";
import { BADGE_MD } from "@/lib/utils/constants";

// URL helpers for display hierarchy
function getPreviewUrl(element: Element): string {
  return element.preview_url?.trim() || element.thumbnail_url?.trim() || element.file_url?.trim() || '';
}

interface ImageBounds {
  top: number;
  left: number;
  width: number;
  height: number;
}

// Hook to track actual rendered image/video bounds
function useMediaBounds(containerRef: React.RefObject<HTMLElement | null>, currentElementId: number | null) {
  const [bounds, setBounds] = useState<ImageBounds>({ top: 0, left: 0, width: 0, height: 0 });
  const mediaRef = useRef<HTMLImageElement | HTMLVideoElement>(null);

  const updateBounds = useCallback(() => {
    if (mediaRef.current && containerRef.current) {
      const mediaRect = mediaRef.current.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();
      
      setBounds({
        top: mediaRect.top - containerRect.top,
        left: mediaRect.left - containerRect.left,
        width: mediaRect.width,
        height: mediaRect.height,
      });
    }
  }, [containerRef]);

  // Update on element change, resize, and load
  useEffect(() => {
    updateBounds();
    
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      updateBounds();
    });
    
    resizeObserver.observe(container);
    window.addEventListener('resize', updateBounds);
    
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateBounds);
    };
  }, [containerRef, currentElementId, updateBounds]);

  return { bounds, mediaRef, updateBounds };
}

export interface LightboxModalProps {
  elements: Element[];
  currentElementId: number | null;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (direction: "prev" | "next") => void;
  onSelectElement: (id: number) => void;
  onToggleFavorite: (id: number) => void;
  onSetHeadliner: (id: number) => void;
  onDelete: (id: number) => void;
  headlinerId: number | null;
  filter?: ElementFilter;
  onFilterChange?: (filter: ElementFilter) => void;
  filterCounts?: { all: number; favorites: number; images: number; videos: number };
  children?: React.ReactNode;
}

// --- Video controls overlay (rendered inside bounds div) ---
function VideoControls({
  mediaRef,
}: {
  mediaRef: React.RefObject<HTMLVideoElement>;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setShowControls(true);
    hideTimerRef.current = setTimeout(() => {
      if (mediaRef.current && !mediaRef.current.paused) setShowControls(false);
    }, 2500);
  }, [mediaRef]);

  useEffect(() => {
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, []);

  // Attach video event listeners
  useEffect(() => {
    const v = mediaRef.current;
    if (!v) return;

    const onPlay = () => { setIsPlaying(true); scheduleHide(); };
    const onPause = () => { setIsPlaying(false); setShowControls(true); };
    const onTimeUpdate = () => {
      if (v.duration) setProgress(v.currentTime / v.duration);
    };
    const onEnded = () => { setIsPlaying(false); setProgress(0); setShowControls(true); };
    const onLoaded = () => { setDuration(v.duration); };

    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("ended", onEnded);
    v.addEventListener("loadedmetadata", onLoaded);
    if (v.duration) setDuration(v.duration);

    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("loadedmetadata", onLoaded);
    };
  }, [mediaRef, scheduleHide]);

  const handlePlay = useCallback(() => {
    const v = mediaRef.current;
    if (!v) return;
    if (v.paused) { v.play(); } else { v.pause(); }
  }, [mediaRef]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const v = mediaRef.current;
    if (!v || !v.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = ratio * v.duration;
    setProgress(ratio);
  }, [mediaRef]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <>
      {/* Click area for play/pause + mouse move for controls visibility */}
      <div
        className="absolute inset-0 cursor-pointer pointer-events-auto"
        onClick={handlePlay}
        onMouseMove={scheduleHide}
      />

      {/* Big play button when paused */}
      {!isPlaying && (
        <button
          type="button"
          onClick={handlePlay}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center h-16 w-16 rounded-full bg-black/50 backdrop-blur-sm pointer-events-auto"
        >
          <Play className="h-7 w-7 text-white ml-1" fill="white" />
        </button>
      )}

      {/* Bottom controls bar */}
      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 transition-opacity duration-200 rounded-b-lg bg-gradient-to-t from-black/40 to-transparent pt-6 pointer-events-auto",
          showControls || !isPlaying ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onMouseMove={scheduleHide}
      >
        <div
          className="h-1 mx-3 mb-1 rounded-full bg-white/20 cursor-pointer"
          onClick={handleSeek}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-100"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="flex items-center gap-2 px-3 pb-2">
          <button type="button" onClick={handlePlay} className="text-white/80 hover:text-white transition-colors">
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" fill="currentColor" />}
          </button>
          <span className="text-[11px] text-white/60 font-mono tabular-nums">
            {formatTime(mediaRef.current?.currentTime ?? 0)} / {formatTime(duration)}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => {
              if (mediaRef.current) {
                mediaRef.current.muted = !mediaRef.current.muted;
                setIsMuted(mediaRef.current.muted);
              }
            }}
            className="text-white/80 hover:text-white transition-colors"
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </>
  );
}

export function LightboxModal({
  elements,
  currentElementId,
  isOpen,
  onClose,
  onNavigate,
  onSelectElement,
  onToggleFavorite,
  onSetHeadliner,
  onDelete,
  headlinerId,
  filter = "all",
  onFilterChange,
  filterCounts = { all: 0, favorites: 0, images: 0, videos: 0 },
  children,
}: LightboxModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { bounds, mediaRef, updateBounds } = useMediaBounds(containerRef, currentElementId);

  // Current element
  const currentElement = useMemo(() => {
    if (!currentElementId) return null;
    return elements.find((e) => e.id === currentElementId) || null;
  }, [elements, currentElementId]);

  // Navigation state
  const currentIndex = useMemo(() => {
    if (!currentElementId) return -1;
    return elements.findIndex((e) => e.id === currentElementId);
  }, [elements, currentElementId]);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < elements.length - 1;

  // Navigation handlers
  const handlePrev = useCallback(() => {
    if (hasPrev) {
      onNavigate("prev");
    } else if (elements.length > 1) {
      onSelectElement(elements[elements.length - 1].id);
    }
  }, [hasPrev, elements, onNavigate, onSelectElement]);

  const handleNext = useCallback(() => {
    if (hasNext) {
      onNavigate("next");
    } else if (elements.length > 1) {
      onSelectElement(elements[0].id);
    }
  }, [hasNext, elements, onNavigate, onSelectElement]);

  // Keyboard handlers
  useEffect(() => {
    if (!isOpen) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        handlePrev();
      } else if (e.key === "ArrowRight") {
        handleNext();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose, handlePrev, handleNext]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Reset video when element changes
  useEffect(() => {
    if (mediaRef.current && 'currentTime' in mediaRef.current) {
      mediaRef.current.currentTime = 0;
    }
  }, [currentElementId, mediaRef]);

  if (!isOpen) return null;

  // Empty state - no elements match the filter
  const isEmpty = elements.length === 0;
  
  const isVideo = currentElement?.element_type === "VIDEO";
  const isFavorite = currentElement?.is_favorite ?? false;
  const isGenerated = currentElement?.source_type === "GENERATED";
  const hasFileUrl = !!currentElement?.file_url?.trim();
  const previewUrl = currentElement ? getPreviewUrl(currentElement) : '';
  const hasPreviewUrl = !!previewUrl;

  return (
    <div
      className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр элемента"
    >
      {/* Header */}
      <div className="relative flex items-center justify-between px-4 py-2 border-b shrink-0 bg-surface">
        <div className="flex items-center gap-3">
          {onFilterChange && (
            <ElementFilters
              filter={filter}
              onFilterChange={onFilterChange}
              counts={filterCounts}
            />
          )}
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 hidden sm:flex items-center gap-2 text-[11px] text-muted-foreground/60 select-none pointer-events-none">
          <span>Горячие клавиши:</span>
          <kbd className="px-1.5 py-0.5 rounded bg-card text-muted-foreground text-[10px] font-mono">← →</kbd>
          <kbd className="px-1.5 py-0.5 rounded bg-card text-muted-foreground text-[10px] font-mono">Esc</kbd>
          <kbd className="px-1.5 py-0.5 rounded bg-card text-muted-foreground text-[10px] font-mono">F</kbd>
          <kbd className="px-1.5 py-0.5 rounded bg-card text-muted-foreground text-[10px] font-mono">Del</kbd>
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
        {/* Image/Video area with navigation */}
        <div className="flex-1 relative flex flex-col items-center justify-center p-4 md:p-8">
          {!isEmpty && currentElement && (
            <LightboxNavigation
              onPrev={handlePrev}
              onNext={handleNext}
              hasPrev={hasPrev}
              hasNext={hasNext}
            />
          )}

          {/* Fixed-size container */}
          <div
            ref={containerRef}
            className={cn(
              "relative flex items-center justify-center",
              "w-full max-w-[80vw] md:max-w-[900px]",
              "h-full max-h-[65vh] md:max-h-[600px]",
              "rounded-md overflow-hidden"
            )}
          >
            {isEmpty ? (
              // Empty state - no elements match the filter
              <div className="flex flex-col items-center justify-center text-muted-foreground">
                <FilterX className="h-16 w-16 mb-4 opacity-50" />
                <p className="text-lg font-medium">Нет элементов по выбранному фильтру</p>
                <p className="text-sm mt-2">Выберите другой фильтр или закройте окно</p>
              </div>
            ) : currentElement ? (
              <>
                {/* Media or status placeholder */}
                {currentElement.status === "COMPLETED" && (hasFileUrl || hasPreviewUrl) ? (
                  // Completed — show media
                  isVideo ? (
                    <video
                      ref={mediaRef as React.RefObject<HTMLVideoElement>}
                      src={currentElement.file_url}
                      playsInline
                      onLoadedMetadata={updateBounds}
                      className="max-w-full max-h-full object-contain rounded-lg"
                    />
                  ) : (
                    <img
                      ref={mediaRef as React.RefObject<HTMLImageElement>}
                      src={previewUrl}
                      alt=""
                      onLoad={updateBounds}
                      className="max-w-full max-h-full object-contain rounded-lg"
                    />
                  )
                ) : currentElement.status === "PENDING" || currentElement.status === "PROCESSING" || currentElement.status === "UPLOADING" ? (
                  // In progress — placeholder
                  <div className="flex flex-col items-center justify-center text-muted-foreground gap-3">
                    <Loader2 className="h-12 w-12 animate-spin opacity-60" />
                    <p className="text-sm font-medium">
                      {currentElement.status === "UPLOADING"
                        ? "Загрузка..."
                        : currentElement.source_type === "UPLOADED"
                          ? "Обработка..."
                          : currentElement.status === "PENDING"
                            ? "Ожидание генерации..."
                            : `Генерация${currentElement.ai_model_name ? `: ${currentElement.ai_model_name}` : ""}...`}
                    </p>
                    {currentElement.source_type !== "UPLOADED" && currentElement.ai_model_name && (
                      <p className="text-xs text-muted-foreground/60">{currentElement.ai_model_name}</p>
                    )}
                  </div>
                ) : currentElement.status === "FAILED" ? (
                  // Failed — error placeholder
                  <div className="flex flex-col items-center justify-center text-destructive gap-3">
                    <AlertCircle className="h-12 w-12 opacity-60" />
                    <p className="text-sm font-medium">Ошибка генерации</p>
                    {currentElement.error_message && (
                      <p className="text-xs text-muted-foreground max-w-md text-center">{currentElement.error_message}</p>
                    )}
                  </div>
                ) : (
                  // Completed but no file
                  <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
                    {isVideo ? <Video className="h-12 w-12 opacity-40" /> : <Image className="h-12 w-12 opacity-40" />}
                    <p className="text-sm">Файл недоступен</p>
                  </div>
                )}

                {/* Icons positioned relative to actual media bounds */}
                {bounds.width > 0 && currentElement.status === "COMPLETED" && (hasFileUrl || hasPreviewUrl) && (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      top: bounds.top,
                      left: bounds.left,
                      width: bounds.width,
                      height: bounds.height,
                    }}
                  >
                    {/* Badges - top right: Star (leftmost) → Type → AI */}
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                      {/* Favorite icon - always leftmost to prevent layout jump */}
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (currentElement) onToggleFavorite(currentElement.id);
                        }}
                        className={cn(BADGE_MD.wrapper, "rounded-md bg-black/60 backdrop-blur-sm flex items-center justify-center hover:bg-black/80 transition-colors cursor-pointer pointer-events-auto focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0")}
                      >
                        <Star
                          className={cn(
                            BADGE_MD.icon,
                            isFavorite
                              ? "text-favorite fill-current"
                              : "text-overlay-text-muted"
                          )}
                        />
                      </button>

                      {/* Type icon */}
                      <div className={cn(BADGE_MD.wrapper, "rounded-md bg-black/60 backdrop-blur-sm flex items-center justify-center text-overlay-text")}>
                        {isVideo ? (
                          <Video className={BADGE_MD.icon} />
                        ) : (
                          <Image className={BADGE_MD.icon} />
                        )}
                      </div>

                      {/* AI badge - only for generated elements */}
                      {isGenerated && (
                        <div className={cn(BADGE_MD.wrapper, "rounded-md bg-black/60 backdrop-blur-sm flex items-center justify-center")}>
                          <span className="text-white font-bold leading-none text-[10px]">AI</span>
                        </div>
                      )}
                    </div>

                    {/* Video controls - positioned within bounds */}
                    {isVideo && (
                      <VideoControls mediaRef={mediaRef as React.RefObject<HTMLVideoElement>} />
                    )}
                  </div>
                )}
              </>
            ) : (
              // No current element selected
              <div className="flex flex-col items-center justify-center text-muted-foreground">
                <Image className="h-16 w-16 mb-4 opacity-50" />
                <p className="text-lg font-medium">Элемент не найден</p>
              </div>
            )}
          </div>

          {/* Action buttons below the box - only when element exists */}
          {!isEmpty && currentElement && (
            <div className="mt-4 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onDelete(currentElement.id)}
                className="flex items-center gap-1.5 h-7 px-3 rounded text-xs font-medium text-destructive bg-card hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Удалить
              </button>

              {hasFileUrl && (
                <button
                  type="button"
                  onClick={async () => {
                    const fileUrl = currentElement.file_url;
                    const ext = fileUrl.split("/").pop()?.split("?")[0]?.split(".").pop() ?? "file";
                    const fileName = `element-${currentElement.id}.${ext}`;

                    const downloadBlob = (blob: Blob) => {
                      const blobUrl = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = blobUrl;
                      a.download = fileName;
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                    };

                    try {
                      // Direct S3 fetch — cache: no-store forces fresh request with Origin header
                      const res = await fetch(fileUrl, { mode: "cors", cache: "no-store" });
                      if (!res.ok) throw new Error("fetch failed");
                      downloadBlob(await res.blob());
                    } catch {
                      try {
                        // Fallback: proxy through backend
                        const { apiClient } = await import("@/lib/api/client");
                        const res = await apiClient.get(`/api/elements/${currentElement.id}/download/`, {
                          responseType: "blob",
                        });
                        downloadBlob(res.data);
                      } catch {
                        window.open(fileUrl, "_blank");
                      }
                    }
                  }}
                  className="flex items-center gap-1.5 h-7 px-3 rounded text-xs font-medium text-muted-foreground bg-card hover:text-foreground transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Скачать
                </button>
              )}

              {hasFileUrl && (
                <a
                  href={currentElement.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 h-7 px-3 rounded text-xs font-medium text-muted-foreground bg-card hover:text-foreground transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Оригинал
                </a>
              )}
            </div>
          )}
        </div>

        {/* Detail panel slot */}
        {children && (
          <div className="w-80 border-l overflow-auto bg-background shrink-0 hidden md:block">
            {children}
          </div>
        )}
      </div>

      {/* Filmstrip - only when there are elements */}
      {!isEmpty && (
        <div className="border-t px-4 py-2 shrink-0 bg-background">
          <Filmstrip
            elements={elements}
            currentElementId={currentElementId}
            onSelect={onSelectElement}
          />
        </div>
      )}
    </div>
  );
}
