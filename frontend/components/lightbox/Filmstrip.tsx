"use client";

import { useRef, useEffect } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Element } from "@/lib/types";
import { Video, Image, Star } from "lucide-react";

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

              {/* Type and favorite icons - top right, like ElementCard */}
              <div className="absolute top-1 right-1 flex items-center gap-0.5">
                {/* Type icon */}
                <div className="rounded-full bg-overlay-medium p-0.5">
                  {isVideo ? (
                    <Video className="w-2.5 h-2.5 text-overlay-text" />
                  ) : (
                    <Image className="w-2.5 h-2.5 text-overlay-text" />
                  )}
                </div>

                {/* Favorite icon */}
                {el.is_favorite && (
                  <div className="rounded-full bg-overlay-medium p-0.5">
                    <Star className="w-2.5 h-2.5 text-favorite fill-current" />
                  </div>
                )}
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
