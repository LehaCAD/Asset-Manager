"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PromptThumbnailProps {
  url: string;
  label?: string;
  onRemove: () => void;
  onClick: () => void;
  size?: number;
  className?: string;
}

export function PromptThumbnail({
  url,
  label,
  onRemove,
  onClick,
  size = 100,
  className,
}: PromptThumbnailProps) {
  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove();
  };

  return (
    <div
      className={cn(
        "relative shrink-0 cursor-pointer overflow-hidden rounded-lg group",
        className
      )}
      style={{ width: size, height: size }}
      onClick={onClick}
      title={label}
    >
      {/* Изображение */}
      <img
        src={url}
        alt={label || "Изображение"}
        className="h-full w-full object-cover"
      />

      {/* Hover overlay с X */}
      <div className="absolute inset-0 flex items-start justify-end bg-black/0 p-1.5 transition-colors group-hover:bg-black/30">
        <button
          type="button"
          onClick={handleRemove}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full",
            "bg-destructive text-destructive-foreground",
            "opacity-0 transition-opacity group-hover:opacity-100",
            "hover:bg-destructive/90 focus:outline-none focus:ring-2 focus:ring-ring"
          )}
          aria-label="Удалить"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
