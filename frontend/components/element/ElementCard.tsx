import { cn } from "@/lib/utils";
import type { WorkspaceElement, GridDensity } from "@/lib/types";
import {
  Star,
  Trash2,
  Download,
  Check,
  Play,
  Loader2,
  AlertCircle,
  Image,
  Video,
} from "lucide-react";

export interface ElementCardProps {
  element: WorkspaceElement;
  index: number;
  density: GridDensity;
  isSelected: boolean;
  isMultiSelectMode: boolean;
  onSelect: (id: number, addToSelection: boolean) => void;
  onOpenLightbox: (id: number) => void;
  onToggleFavorite: (id: number) => void;
  onDelete: (id: number) => void;
  className?: string;
  style?: React.CSSProperties;
}

export function ElementCard({
  element,
  index,
  density,
  isSelected,
  isMultiSelectMode,
  onSelect,
  onOpenLightbox,
  onToggleFavorite,
  onDelete,
  className,
  style,
}: ElementCardProps) {
  const isProcessing = element.status === "PENDING" || element.status === "PROCESSING";
  const isFailed = element.status === "FAILED";
  const isSubmitting = 
    element.client_optimistic_kind === "generation" && 
    element.client_generation_submit_state === "submitting";
  const isVideo = element.element_type === "VIDEO";
  const isSmallDensity = density === "sm";
  const videoThumbnailSrc = element.thumbnail_url?.trim() || null;
  const videoFileSrc = element.file_url?.trim() || null;
  const mediaSrc = (isVideo ? videoThumbnailSrc || videoFileSrc : element.file_url)?.trim() || null;

  const handleCardClick = (e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      onSelect(element.id, true);
    } else if (isMultiSelectMode) {
      onSelect(element.id, true);
    } else {
      onOpenLightbox(element.id);
    }
  };

  const handleSelectClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(element.id, true);
  };

  const handleControlPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
  };

  const handleToggleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFavorite(element.id);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(element.id);
  };

  const handleOpenLightboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenLightbox(element.id);
  };

  const handleDownloadClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!element.file_url?.trim()) return;

    const anchor = document.createElement("a");
    anchor.href = element.file_url;
    const filenameFromUrl = element.file_url.split("/").pop() || "element-file";
    anchor.download = filenameFromUrl.split("?")[0];
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  return (
    <div
      className={cn(
        "group relative aspect-square rounded-xl overflow-hidden cursor-pointer",
        "bg-muted transition-transform duration-150 ease-out",
        "hover:scale-[1.02] hover:shadow-lg",
        isSelected && "ring-2 ring-primary scale-[1.01]",
        className
      )}
      style={style}
      onClick={handleCardClick}
    >
      {/* Media layer — never render <video> elements; use thumbnail or placeholder */}
      {isVideo ? (
        videoThumbnailSrc ? (
          <img
            src={videoThumbnailSrc}
            alt={`Видео ${index + 1}`}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-contain bg-muted"
          />
        ) : (
          <div className="absolute inset-0 bg-muted flex items-center justify-center">
            <Video className="w-12 h-12 text-muted-foreground/30" />
          </div>
        )
      ) : mediaSrc ? (
        <img
          src={mediaSrc}
          alt={`Элемент ${index + 1}`}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-contain bg-muted"
        />
      ) : (
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
          <Image className="w-8 h-8 text-muted-foreground/40" />
        </div>
      )}

      {/* Selection overlay - checkbox badge */}
      <button
        type="button"
        role="checkbox"
        aria-checked={isSelected}
        aria-label={
          isSelected ? "Снять выделение элемента" : "Выбрать элемент для массовых действий"
        }
        title={isSelected ? "Снять выделение" : "Выбрать для массовых действий"}
        onPointerDown={handleControlPointerDown}
        onClick={handleSelectClick}
        className={cn(
          "absolute top-2 left-2 z-40 rounded-full flex items-center justify-center transition-all duration-150",
          isMultiSelectMode || isSelected
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto",
          isSmallDensity ? "w-6 h-6" : "w-9 h-9",
          isSelected
            ? "bg-primary text-primary-foreground"
            : "bg-black/50 text-white hover:bg-black/70",
          isMultiSelectMode && !isSelected && "bg-white/40 hover:bg-white/60"
        )}
      >
        {isSelected && <Check className={cn(isSmallDensity ? "w-4 h-4" : "w-6 h-6")} />}
      </button>

      <div
        className={cn(
          "absolute top-2 right-2 z-40 flex items-center",
          isSmallDensity ? "gap-1" : "gap-1.5"
        )}
      >
        {/* Element type icon */}
        <div
          className={cn(
            "rounded-full bg-black/50 text-white",
            isSmallDensity ? "p-1.5" : "p-2.5"
          )}
          title={isVideo ? "Видео" : "Изображение"}
        >
          {isVideo ? (
            <Video className={cn(isSmallDensity ? "w-4 h-4" : "w-6 h-6")} />
          ) : (
            <Image className={cn(isSmallDensity ? "w-4 h-4" : "w-6 h-6")} />
          )}
        </div>

        {/* Favorite star */}
        <button
          type="button"
          onPointerDown={handleControlPointerDown}
          onClick={handleToggleFavoriteClick}
          className={cn(
            "rounded-full transition-colors",
            isSmallDensity ? "p-1.5" : "p-2.5",
            element.is_favorite
              ? "bg-black/50 text-yellow-400 hover:bg-black/70"
              : "bg-black/50 text-white hover:bg-black/70"
          )}
          aria-label={element.is_favorite ? "Убрать из избранного" : "Добавить в избранное"}
          title={element.is_favorite ? "Убрать из избранного" : "Добавить в избранное"}
        >
          <Star
            className={cn(
              isSmallDensity ? "w-4 h-4" : "w-6 h-6",
              element.is_favorite && "fill-current"
            )}
          />
        </button>
      </div>

      {/* Hover overlay — image-safe: no blur, just dark scrim */}
      <div
        className={cn(
          "absolute inset-0 z-20 bg-black/50",
          "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
          "flex flex-col justify-between p-2"
        )}
      >
        <div />

        {/* Center - Play icon for video */}
        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <button
              type="button"
              onPointerDown={handleControlPointerDown}
              onClick={handleOpenLightboxClick}
              className={cn(
                "rounded-full bg-white/20 hover:bg-white/40 transition-colors pointer-events-auto",
                isSmallDensity ? "p-3" : "p-4"
              )}
            >
              <Play className={cn(isSmallDensity ? "w-6 h-6" : "w-9 h-9", "text-white fill-white")} />
            </button>
          </div>
        )}

        {/* Bottom row */}
        <div className="flex justify-between items-center">
          {/* Download */}
          {element.file_url?.trim() ? (
            <button
              type="button"
              onPointerDown={handleControlPointerDown}
              onClick={handleDownloadClick}
              className={cn(
                "rounded-full bg-white/20 hover:bg-white/35 transition-colors text-white",
                isSmallDensity ? "p-2" : "p-3"
              )}
            >
              <Download className={cn(isSmallDensity ? "w-4 h-4" : "w-6 h-6")} />
            </button>
          ) : (
            <button
              type="button"
              disabled
              onPointerDown={handleControlPointerDown}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "rounded-full bg-white/10 text-white/40 cursor-not-allowed",
                isSmallDensity ? "p-2" : "p-3"
              )}
            >
              <Download className={cn(isSmallDensity ? "w-4 h-4" : "w-6 h-6")} />
            </button>
          )}

          {/* Delete */}
          <button
            type="button"
            onPointerDown={handleControlPointerDown}
            onClick={handleDeleteClick}
            className={cn(
              "rounded-full bg-white/20 hover:bg-red-500/50 transition-colors text-white",
              isSmallDensity ? "p-2" : "p-3"
            )}
          >
            <Trash2 className={cn(isSmallDensity ? "w-4 h-4" : "w-6 h-6")} />
          </button>
        </div>
      </div>

      {/* Status overlay */}
      {isSubmitting && (
        <div className="absolute inset-0 z-30 bg-black/60 flex flex-col items-center justify-center pointer-events-none">
          <Loader2 className="w-8 h-8 text-white animate-spin mb-2" />
          <span className="text-xs text-white font-medium">Отправка...</span>
        </div>
      )}
      {!isSubmitting && isProcessing && (
        <div className="absolute inset-0 z-30 bg-black/50 flex items-center justify-center pointer-events-none">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
      )}
      {isFailed && (
        <div className="absolute inset-0 z-30 bg-red-500/30 flex items-center justify-center pointer-events-none">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
      )}
    </div>
  );
}
