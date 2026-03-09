"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PromptThumbnail } from "./PromptThumbnail";
import { Trash2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PromptThumbnailPopupProps {
  url: string;
  label?: string;
  onReplace: (fileIndex: number) => void;
  onRemove: () => void;
  fileIndex: number;
  previewMaxSize?: number;
  className?: string;
}

export function PromptThumbnailPopup({
  url,
  label,
  onReplace,
  onRemove,
  fileIndex,
  previewMaxSize = 240,
  className,
}: PromptThumbnailPopupProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className={cn("inline-block", className)}>
          <PromptThumbnail
            url={url}
            label={label}
            onRemove={onRemove}
            onClick={() => {}}
            size={100}
          />
        </div>
      </PopoverTrigger>

      <PopoverContent
        className="w-auto p-0 overflow-hidden"
        align="start"
        side="top"
        sideOffset={8}
      >
        <div className="flex flex-col">
          {/* Шапка с иконками */}
          <div className="flex items-center justify-end gap-1 p-2 border-b bg-muted/50">
            <button
              type="button"
              onClick={() => onReplace(fileIndex)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md",
                "text-muted-foreground hover:text-foreground hover:bg-accent",
                "transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
              )}
              title="Заменить"
              aria-label="Заменить"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onRemove}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md",
                "text-muted-foreground hover:text-destructive hover:bg-destructive/10",
                "transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
              )}
              title="Удалить"
              aria-label="Удалить"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {/* Тело с изображением */}
          <button
            type="button"
            onClick={() => onReplace(fileIndex)}
            className="p-3 hover:bg-accent/50 transition-colors cursor-pointer"
          >
            <div
              className="flex items-center justify-center"
              style={{ maxWidth: previewMaxSize, maxHeight: previewMaxSize }}
            >
              <img
                src={url}
                alt={label || "Изображение"}
                className="object-contain rounded-md"
                style={{
                  maxWidth: previewMaxSize,
                  maxHeight: previewMaxSize,
                }}
              />
            </div>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
