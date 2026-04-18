"use client";

import { Upload, ImagePlus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  onUploadClick: () => void;
  isDragActive?: boolean;
}

export function EmptyState({ onUploadClick, isDragActive = false }: EmptyStateProps) {
  return (
    <div className="flex flex-col gap-4 w-full h-full">
    <button
      type="button"
      onClick={onUploadClick}
      className={cn(
        "w-full h-full min-h-[300px] flex flex-col items-center justify-center gap-5",
        "rounded-lg border-2 border-dashed transition-all duration-200",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        "active:scale-[0.99]",
        isDragActive
          ? "border-primary bg-primary/5 scale-[1.01]"
          : "border-muted-foreground/20 bg-muted/30 hover:border-muted-foreground/40 hover:bg-muted/50"
      )}
    >
      {/* Large upload icon container */}
      <div
        className={cn(
          "relative w-24 h-24 rounded-lg flex items-center justify-center",
          "transition-all duration-200",
          isDragActive
            ? "bg-primary/10 scale-110"
            : "bg-muted-foreground/10 group-hover:bg-muted-foreground/15"
        )}
      >
        {/* Animated arrow indicators */}
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex flex-col items-center">
          <div
            className={cn(
              "w-0.5 h-3 bg-primary/60 rounded-full transition-all duration-200",
              isDragActive && "h-4 bg-primary"
            )}
          />
          <div
            className={cn(
              "w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent transition-all duration-200",
              isDragActive ? "border-t-primary" : "border-t-primary/60"
            )}
          />
        </div>

        {/* Main icon */}
        {isDragActive ? (
          <Upload className="w-12 h-12 text-primary animate-pulse" />
        ) : (
          <ImagePlus className="w-12 h-12 text-muted-foreground/60" />
        )}
      </div>

      {/* Text content */}
      <div className="flex flex-col items-center gap-2 text-center px-6">
        <h3
          className={cn(
            "text-lg font-semibold transition-colors",
            isDragActive ? "text-primary" : "text-foreground"
          )}
        >
          {isDragActive ? "Отпустите файлы здесь" : "Перетащите файлы сюда"}
        </h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          {isDragActive
            ? "Файлы будут загружены в эту группу"
            : "или нажмите в любое место для выбора файлов (JPG, PNG, MP4, MOV)"}
        </p>
      </div>

      {/* Large click target hint */}
      {!isDragActive && (
        <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary/10 text-primary text-sm font-medium">
          <Upload className="w-4 h-4" />
          <span>Загрузить файлы</span>
        </div>
      )}
    </button>
    </div>
  );
}
