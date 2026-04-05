"use client";

import { useRef, useEffect } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Element } from "@/lib/types";
import { Video, Image, Star, Sparkles } from "lucide-react";
import { BADGE_SM } from "@/lib/utils/constants";

export interface FilmstripProps {
  elements: Element[];
  currentElementId: number | null;
  onSelect: (id: number) => void;
}

export function Filmstrip({ elements, currentElementId, onSelect }: FilmstripProps) {
  const activeRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll active element into view
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [currentElementId]);

  return (
    <ScrollArea className="w-full whitespace-nowrap">
      <div className="flex gap-2 py-2 px-1">
        {elements.map((el) => {
          const isActive = el.id === currentElementId;
          const isVideo = el.element_type === "VIDEO";
          const isGenerated = el.source_type === "GENERATED";

          return (
            <button
              key={el.id}
              ref={isActive ? activeRef : null}
              onClick={() => onSelect(el.id)}
              className={cn(
                "shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all",
                "relative group",
                isActive
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-transparent hover:border-muted-foreground/30"
              )}
              aria-label={isActive ? "Текущий элемент" : `Перейти к элементу ${el.id}`}
              aria-current={isActive ? "true" : undefined}
            >
              {/* Thumbnail */}
              {el.thumbnail_url ? (
                <img
                  src={el.thumbnail_url}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center">
                  {isVideo ? (
                    <Video className="w-5 h-5 text-muted-foreground/50" />
                  ) : (
                    <Image className="w-5 h-5 text-muted-foreground/50" />
                  )}
                </div>
              )}

              {/* Badges - top right: AI (leftmost) → Star → Type (rightmost) */}
              <div className="absolute top-1 right-1 flex items-center gap-0.5">
                {/* AI badge - only for generated elements */}
                {isGenerated && (
                  <div className={cn(BADGE_SM.wrapper, "rounded-md bg-black/60 backdrop-blur-sm flex items-center justify-center text-overlay-text")}>
                    <Sparkles className={BADGE_SM.icon} />
                  </div>
                )}

                {/* Favorite icon */}
                {el.is_favorite && (
                  <div className={cn(BADGE_SM.wrapper, "rounded-md bg-black/60 backdrop-blur-sm flex items-center justify-center")}>
                    <Star className={cn(BADGE_SM.icon, "text-favorite fill-current")} />
                  </div>
                )}

                {/* Type icon */}
                <div className={cn(BADGE_SM.wrapper, "rounded-md bg-black/60 backdrop-blur-sm flex items-center justify-center text-overlay-text")}>
                  {isVideo ? (
                    <Video className={BADGE_SM.icon} />
                  ) : (
                    <Image className={BADGE_SM.icon} />
                  )}
                </div>
              </div>

              {/* Hover overlay for better visibility */}
              <div className={cn(
                "absolute inset-0 bg-transparent group-hover:bg-overlay-light-hover transition-colors",
                isActive && "bg-transparent"
              )} />
            </button>
          );
        })}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
