"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LightboxNavigation } from "@/components/lightbox/LightboxNavigation";
import { Filmstrip } from "@/components/lightbox/Filmstrip";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  FilterX,
  Loader2,
  AlertCircle,
} from "lucide-react";
import type { Element, ElementFilter } from "@/lib/types";

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
      {/* Header - keyboard hints centered, close button on right */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <div className="w-10" /> {/* Spacer for centering */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-xs text-muted-foreground/70 tracking-wide cursor-help select-none hidden sm:inline">
              ← → навигация · Esc закрыть · F избранное · Del удалить
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Горячие клавиши</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Закрыть"
            >
              <X className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Закрыть (Esc)</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Filter bar - centered */}
      {onFilterChange && (
        <div className="border-b px-4 py-2 shrink-0 bg-background">
          <div className="flex justify-center">
            <ElementFilters
              filter={filter}
              onFilterChange={onFilterChange}
              counts={filterCounts}
            />
          </div>
        </div>
      )}

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
              "bg-muted/30 rounded-md overflow-hidden"
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
                      controls
                      autoPlay
                      muted
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
                ) : currentElement.status === "PENDING" || currentElement.status === "PROCESSING" ? (
                  // In progress — placeholder
                  <div className="flex flex-col items-center justify-center text-muted-foreground gap-3">
                    <Loader2 className="h-12 w-12 animate-spin opacity-60" />
                    <p className="text-sm font-medium">
                      {currentElement.status === "PENDING" ? "Ожидание генерации..." : "Генерация видео..."}
                    </p>
                    {currentElement.ai_model_name && (
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
                    {/* Type and favorite icons - top right, like ElementCard */}
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                      {/* Type icon */}
                      <div className="rounded-full bg-overlay-medium text-overlay-text p-1.5">
                        {isVideo ? (
                          <Video className="w-3.5 h-3.5" />
                        ) : (
                          <Image className="w-3.5 h-3.5" />
                        )}
                      </div>

                      {/* Favorite icon - clickable */}
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (currentElement) onToggleFavorite(currentElement.id);
                        }}
                        className="rounded-full bg-overlay-medium p-1.5 hover:bg-overlay-heavy transition-colors cursor-pointer pointer-events-auto focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                      >
                        <Star
                          className={cn(
                            "w-3.5 h-3.5",
                            isFavorite
                              ? "text-favorite fill-current"
                              : "text-overlay-text-muted"
                          )}
                        />
                      </button>
                    </div>

                    {/* Play button for video - center */}
                    {isVideo && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
                        <div className="rounded-full bg-overlay p-4 hover:bg-overlay-medium transition-colors">
                          <Play className="w-10 h-10 text-overlay-text fill-current" />
                        </div>
                      </div>
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
            <div className="mt-4 flex items-center gap-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDelete(currentElement.id)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Удалить
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Удалить элемент</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    disabled={!hasFileUrl}
                    className={cn(!hasFileUrl && "opacity-30 cursor-not-allowed")}
                  >
                    <a
                      href={hasFileUrl ? currentElement.file_url : undefined}
                      download
                      className="flex items-center"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Скачать
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Скачать файл</p>
                </TooltipContent>
              </Tooltip>

              {/* "View original" button — shown for images when preview_url differs from file_url */}
              {!isVideo && hasFileUrl && currentElement.preview_url?.trim() && currentElement.preview_url.trim() !== currentElement.file_url.trim() && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      asChild
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <a
                        href={currentElement.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center"
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Оригинал
                      </a>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Открыть оригинал в новой вкладке</p>
                  </TooltipContent>
                </Tooltip>
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
