"use client";

import { cn } from "@/lib/utils";
import { Star, Image, Video } from "lucide-react";
import { FIT_MODE_CLASSES } from "@/lib/utils/constants";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import type { Element, DisplayFitMode } from "@/lib/types";

export interface ElementSelectionCardProps {
  element: Element;
  isSelected: boolean;
  disabled: boolean;
  onClick: () => void;
  aspectClass?: string;
  fitMode?: DisplayFitMode;
}

export function ElementSelectionCard({
  element,
  isSelected,
  disabled,
  onClick,
  aspectClass = "aspect-video",
  fitMode = "fill",
}: ElementSelectionCardProps) {
  const isVideo = element.element_type === "VIDEO";
  const videoThumbnailSrc = element.thumbnail_url?.trim() || null;
  const videoFileSrc = element.file_url?.trim() || null;
  const mediaSrc = (isVideo ? videoThumbnailSrc || videoFileSrc : element.preview_url?.trim() || element.thumbnail_url?.trim() || element.file_url)?.trim() || null;

  const fitClass = FIT_MODE_CLASSES[fitMode];

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={cn(
              "group relative rounded-md overflow-hidden cursor-pointer",
              "bg-muted transition-all duration-150",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              aspectClass,
              isSelected && "ring-2 ring-primary",
              disabled && "opacity-40 cursor-not-allowed"
            )}
          >
            {/* Media layer — never render <video> elements; use thumbnail or placeholder */}
            {isVideo ? (
              videoThumbnailSrc ? (
                <img
                  src={videoThumbnailSrc}
                  alt={`Видео ${element.id}`}
                  loading="lazy"
                  decoding="async"
                  className={cn("absolute inset-0 w-full h-full bg-muted", fitClass)}
                />
              ) : (
                <div className="absolute inset-0 bg-muted flex items-center justify-center">
                  <Video className="w-12 h-12 text-muted-foreground/30" />
                </div>
              )
            ) : mediaSrc ? (
              <img
                src={mediaSrc}
                alt={`Элемент ${element.id}`}
                loading="lazy"
                decoding="async"
                className={cn("absolute inset-0 w-full h-full bg-muted", fitClass)}
              />
            ) : (
              <div className="absolute inset-0 bg-muted flex items-center justify-center">
                <Image className="w-8 h-8 text-muted-foreground/40" />
              </div>
            )}

            {/* Selection overlay */}
            {isSelected && (
              <div className="absolute inset-0 bg-primary/10 pointer-events-none" />
            )}

            {/* Hover overlay */}
            {!disabled && (
              <div
                className={cn(
                  "absolute inset-0 bg-overlay-light pointer-events-none",
                  "opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                )}
              />
            )}

            {/* Top-right badges: Star (leftmost) → Type → AI */}
            <div className="absolute top-2 right-2 z-20 flex items-center gap-1">
              {/* Favorite star - leftmost, read only */}
              {element.is_favorite && (
                <div
                  className="rounded-md bg-black/60 backdrop-blur-sm h-6 w-6 flex items-center justify-center"
                  title="В избранном"
                >
                  <Star className="h-3.5 w-3.5 text-white fill-amber-400" />
                </div>
              )}

              {/* Element type icon */}
              <div
                className="rounded-md bg-black/60 backdrop-blur-sm h-6 w-6 flex items-center justify-center"
                title={isVideo ? "Видео" : "Изображение"}
              >
                {isVideo ? (
                  <Video className="h-3.5 w-3.5 text-white" />
                ) : (
                  <Image className="h-3.5 w-3.5 text-white" />
                )}
              </div>

              {/* AI badge - only for generated */}
              {element.source_type === "GENERATED" && (
                <div className="rounded-md bg-black/60 backdrop-blur-sm h-6 w-6 flex items-center justify-center">
                  <span className="text-white font-bold leading-none text-[10px]">AI</span>
                </div>
              )}
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs max-w-[200px] truncate">
          {element.original_filename || `element-${element.id}`}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
