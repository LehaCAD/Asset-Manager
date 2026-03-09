"use client";

import { cn } from "@/lib/utils";
import { Star, Image, Video } from "lucide-react";
import { FIT_MODE_CLASSES } from "@/lib/utils/constants";
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
  const mediaSrc = (isVideo ? videoThumbnailSrc || videoFileSrc : element.file_url)?.trim() || null;
  
  const fitClass = FIT_MODE_CLASSES[fitMode];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group relative rounded-xl overflow-hidden cursor-pointer",
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
            "absolute inset-0 bg-black/10 pointer-events-none",
            "opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          )}
        />
      )}

      {/* Top-right corner: Type icon and Favorite star */}
      <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5">
        {/* Element type icon */}
        <div
          className="rounded-full bg-black/45 text-white p-2"
          title={isVideo ? "Видео" : "Изображение"}
        >
          {isVideo ? (
            <Video className="w-5 h-5" />
          ) : (
            <Image className="w-5 h-5" />
          )}
        </div>

        {/* Favorite star - read only */}
        <div
          className={cn(
            "rounded-full bg-black/45 p-2",
            element.is_favorite ? "text-yellow-400" : "text-white/70"
          )}
          title={element.is_favorite ? "В избранном" : "Не в избранном"}
        >
          <Star
            className={cn(
              "w-5 h-5",
              element.is_favorite && "fill-current"
            )}
          />
        </div>
      </div>
    </button>
  );
}
