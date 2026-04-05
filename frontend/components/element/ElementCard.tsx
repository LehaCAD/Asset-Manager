import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { WorkspaceElement, DisplayCardSize, DisplayAspectRatio, DisplayFitMode, UploadPhase } from "@/lib/types";
import { ASPECT_RATIO_CLASSES, FIT_MODE_CLASSES, CARD_ICON_SIZES } from "@/lib/utils/constants";
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
  RotateCcw,
  Ellipsis,
  ChevronDown,
  Pencil,
  FolderInput,
  Copy,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PHASE_LABELS: Record<string, string> = {
  resize: "Подготовка...",
  presign: "Подключение...",
  upload_thumb: "Миниатюра...",
  upload_full: "Загрузка...",
  completing: "Сохранение...",
};

const APPROVAL_STATUSES = [
  { value: null, label: 'Нет статуса', textColor: 'text-[#94A3B8]', bgColor: 'bg-[#475569]/[0.125]' },
  { value: 'IN_PROGRESS', label: 'В работе', textColor: 'text-[#60A5FA]', bgColor: 'bg-[#3B82F6]/[0.125]' },
  { value: 'NEEDS_REVIEW', label: 'На согласовании', textColor: 'text-[#FBBF24]', bgColor: 'bg-[#F59E0B]/[0.125]' },
  { value: 'APPROVED', label: 'Одобрено', textColor: 'text-[#4ADE80]', bgColor: 'bg-[#22C55E]/[0.125]' },
  { value: 'CHANGES_REQUESTED', label: 'На доработку', textColor: 'text-[#FB923C]', bgColor: 'bg-[#F97316]/[0.125]' },
  { value: 'REJECTED', label: 'Отклонено', textColor: 'text-[#94A3B8]', bgColor: 'bg-[#475569]/[0.125]' },
] as const;

/** Progress overlay for uploads and generation finalization. */
function UploadProgressOverlay({
  phase,
  progress,
  iconSize,
}: {
  phase?: UploadPhase;
  progress: number;
  iconSize: string;
}) {
  const rounded = Math.round(progress);
  const label = PHASE_LABELS[phase ?? ""] ?? "Сохранение...";

  return (
    <div className="absolute inset-0 z-30 bg-overlay flex flex-col items-center justify-center pointer-events-none gap-2">
      <Loader2 className={cn(iconSize, "text-overlay-text animate-spin")} />
      <span className="text-[10px] text-overlay-text font-medium">{label}</span>
      <div className="w-[70%] h-1 rounded-full bg-white/20 overflow-hidden">
        <div
          className="h-full bg-white/80 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${rounded}%` }}
        />
      </div>
      <span className="text-[10px] text-overlay-text-muted tabular-nums">
        {rounded}%
      </span>
    </div>
  );
}

export interface ElementCardProps {
  element: WorkspaceElement;
  index: number;
  isSelected: boolean;
  isMultiSelectMode: boolean;
  onSelect: (id: number, addToSelection: boolean) => void;
  onOpenLightbox: (id: number) => void;
  onToggleFavorite: (id: number) => void;
  onDelete: (id: number) => void;
  onRetry?: (id: number) => void;
  className?: string;
  style?: React.CSSProperties;
  // Display preferences
  size?: DisplayCardSize;
  aspectRatio?: DisplayAspectRatio;
  fitMode?: DisplayFitMode;
  // Metadata footer
  showMetadata?: boolean;
  onUpdateStatus?: (id: number, status: string | null) => void;
  onRename?: (id: number, currentName: string) => void;
  onMove?: (id: number) => void;
}

export function ElementCard({
  element,
  index,
  isSelected,
  isMultiSelectMode,
  onSelect,
  onOpenLightbox,
  onToggleFavorite,
  onDelete,
  onRetry,
  className,
  style,
  size = "medium",
  aspectRatio = "landscape",
  fitMode = "fill",
  showMetadata = true,
  onUpdateStatus,
  onRename,
  onMove,
}: ElementCardProps) {
  const isProcessing = element.status === "PENDING" || element.status === "PROCESSING";
  const hasUploadProgress = element.client_upload_phase != null && (element.client_upload_progress ?? 0) < 100;
  const isUploading = element.status === "UPLOADING" || hasUploadProgress;
  const isFailed = element.status === "FAILED";
  const isSubmitting =
    element.client_optimistic_kind === "generation" &&
    element.client_generation_submit_state === "submitting";
  const isVideo = element.element_type === "VIDEO";
  const videoThumbnailSrc = element.preview_url?.trim() || element.thumbnail_url?.trim() || null;
  const videoFileSrc = element.file_url?.trim() || null;
  // Grid cards: preview_url (medium 800px) → thumbnail_url (small 256px) → file_url (original)
  const mediaSrc = (isVideo
    ? videoThumbnailSrc || videoFileSrc
    : element.preview_url?.trim() || element.thumbnail_url?.trim() || element.file_url)?.trim() || null;

  // Получаем размеры иконок для текущего size
  const iconSizes = CARD_ICON_SIZES[size];

  // Filename for download and display
  const filename = element.original_filename ||
    (element.file_url ? element.file_url.split('/').pop()?.split('?')[0] || `element-${element.id}` : `element-${element.id}`);

  // Current approval status
  const currentStatus = APPROVAL_STATUSES.find(s => s.value === element.approval_status) || APPROVAL_STATUSES[0];

  // Elapsed time for processing elements (updates every 5s)
  const [elapsed, setElapsed] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isProcessing && !isSubmitting && !isUploading) {
      setElapsed("");
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    const tick = () => {
      const diffMs = Date.now() - new Date(element.created_at).getTime();
      const totalSec = Math.max(0, Math.floor(diffMs / 1000));
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      setElapsed(`${min}:${sec.toString().padStart(2, "0")}`);
    };

    tick();
    intervalRef.current = setInterval(tick, 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isProcessing, isSubmitting, isUploading, element.created_at]);

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

  const handleRetryClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRetry?.(element.id);
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!element.file_url) return;
    try {
      const response = await fetch(element.file_url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch { /* silent fail */ }
  };

  // Get aspect ratio and fit mode classes
  const aspectClass = ASPECT_RATIO_CLASSES[aspectRatio];
  const fitClass = FIT_MODE_CLASSES[fitMode];

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-md bg-muted cursor-pointer flex flex-col",
        "transition-colors duration-150",
        isSelected && "ring-2 ring-primary",
        className
      )}
      style={style}
      onClick={handleCardClick}
    >
      {/* Thumbnail area — has aspect ratio */}
      <div className={cn("relative overflow-hidden", aspectClass)}>
        {/* Media layer — never render <video> elements; use thumbnail or placeholder */}
        {isVideo ? (
          videoThumbnailSrc ? (
            <img
              src={videoThumbnailSrc}
              alt={`Видео ${index + 1}`}
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
            alt={`Элемент ${index + 1}`}
            loading="lazy"
            decoding="async"
            className={cn("absolute inset-0 w-full h-full bg-muted", fitClass)}
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
            iconSizes.padding,
            isFailed
              ? "opacity-0 pointer-events-none"
              : isMultiSelectMode || isSelected
                ? "opacity-100 pointer-events-auto"
                : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto",
            isSelected
              ? "bg-primary text-primary-foreground"
              : "bg-overlay text-overlay-text hover:bg-overlay-heavy",
            isMultiSelectMode && !isSelected && "bg-overlay-selection hover:bg-overlay-selection-hover"
          )}
        >
          {isSelected ? (
            <Check className={iconSizes.md} />
          ) : (
            <Check className={cn(iconSizes.md, "opacity-0")} />
          )}
        </button>

        {/* Top-right badges: star + type + AI */}
        <div className="absolute top-2 right-2 z-40 flex items-center gap-1">
          {/* Star - hover for empty, always for filled */}
          <button
            type="button"
            onPointerDown={handleControlPointerDown}
            onClick={handleToggleFavoriteClick}
            className={cn(
              "rounded-md bg-black/60 p-1.5 transition-opacity duration-150",
              element.is_favorite ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            )}
            title={element.is_favorite ? "Убрать из избранного" : "В избранное"}
          >
            <Star className={cn(iconSizes.sm, "text-white", element.is_favorite && "fill-amber-400 text-amber-400")} />
          </button>

          {/* Media type - always visible */}
          <div className="rounded-md bg-black/60 p-1.5">
            {isVideo ? (
              <Video className={cn(iconSizes.sm, "text-white")} />
            ) : (
              <Image className={cn(iconSizes.sm, "text-white")} />
            )}
          </div>

          {/* AI pill - only for GENERATED */}
          {element.source_type === "GENERATED" && (
            <div className="rounded-md bg-black/60 px-2 py-1.5 flex items-center">
              <span className="text-white text-[11px] font-bold leading-none">AI</span>
            </div>
          )}
        </div>

        {/* Bottom-left: Play for video */}
        {isVideo && element.status === 'COMPLETED' && (
          <div className="absolute bottom-2 left-2 z-30 rounded-md bg-black/60 p-1.5">
            <Play className={cn(iconSizes.sm, "text-white fill-white")} />
          </div>
        )}

        {/* Hover overlay — image-safe: no blur, just dark scrim */}
        {!isFailed && (
          <div
            className={cn(
              "absolute inset-0 z-20 bg-overlay",
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
                    "rounded-full bg-overlay-button hover:bg-overlay-button-hover transition-colors pointer-events-auto",
                    iconSizes.padding
                  )}
                >
                  <Play className={cn(iconSizes.lg, "text-overlay-text fill-white")} />
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
                  onClick={handleDownload}
                  className={cn(
                    "rounded-full bg-overlay-button hover:bg-overlay-button-hover transition-colors text-overlay-text",
                    iconSizes.padding
                  )}
                >
                  <Download className={iconSizes.md} />
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  onPointerDown={handleControlPointerDown}
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    "rounded-full bg-overlay-light text-overlay-text-muted cursor-not-allowed",
                    iconSizes.padding
                  )}
                >
                  <Download className={iconSizes.md} />
                </button>
              )}

              {/* Delete */}
              <button
                type="button"
                onPointerDown={handleControlPointerDown}
                onClick={handleDeleteClick}
                className={cn(
                  "rounded-full bg-overlay-button hover:bg-error/50 transition-colors text-overlay-text",
                  iconSizes.padding
                )}
              >
                <Trash2 className={iconSizes.md} />
              </button>
            </div>
          </div>
        )}

        {isFailed && (
          <div
            className={cn(
              "absolute inset-0 z-20 bg-overlay-heavy",
              "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
              "flex flex-col items-center justify-center gap-3 p-3"
            )}
          >
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-error" />
              <span className="text-xs font-medium text-error">{element.source_type === "UPLOADED" ? "Ошибка загрузки" : "Ошибка генерации"}</span>
            </div>
            {element.error_message && (
              <span className="text-[10px] text-overlay-text-muted text-center line-clamp-2 max-w-[90%]">
                {element.error_message}
              </span>
            )}
            <button
              type="button"
              onPointerDown={handleControlPointerDown}
              onClick={handleRetryClick}
              className="flex items-center gap-1.5 rounded-md bg-white text-black px-5 py-2 text-xs font-semibold hover:bg-white/90 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Повторить
            </button>
            <button
              type="button"
              onPointerDown={handleControlPointerDown}
              onClick={handleDeleteClick}
              className="flex items-center gap-1.5 rounded-md bg-overlay-button text-overlay-text-muted px-4 py-1.5 text-[11px] hover:bg-overlay-button-hover transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Удалить
            </button>
          </div>
        )}

        {/* Status overlay */}
        {isSubmitting && (
          <div className="absolute inset-0 z-30 bg-overlay-heavy flex flex-col items-center justify-center pointer-events-none">
            <Loader2 className={cn(iconSizes.lg, "text-overlay-text animate-spin mb-1")} />
            <span className="text-[10px] text-overlay-text font-medium">Отправка...</span>
            {elapsed && <span className="text-[10px] text-overlay-text-muted">{elapsed}</span>}
          </div>
        )}
        {!isSubmitting && isUploading && (
          <UploadProgressOverlay
            phase={element.client_upload_phase}
            progress={element.client_upload_progress ?? 0}
            iconSize={iconSizes.lg}
          />
        )}
        {!isSubmitting && !isUploading && isProcessing && (
          <div className="absolute inset-0 z-30 bg-overlay flex flex-col items-center justify-center pointer-events-none gap-1">
            <Loader2 className={cn(iconSizes.lg, "text-overlay-text animate-spin")} />
            <span className="text-[10px] text-overlay-text font-medium truncate max-w-[90%] text-center">
              {element.status === "PENDING"
                ? "Ожидание..."
                : element.source_type === "UPLOADED"
                  ? "Обработка..."
                  : `Генерация${element.ai_model_name ? `: ${element.ai_model_name}` : ""}`}
            </span>
            {elapsed && <span className="text-[10px] text-overlay-text-muted">{elapsed}</span>}
          </div>
        )}
        {isFailed && (
          <div className="absolute inset-0 z-30 flex flex-col pointer-events-none">
            {/* Top area — muted error icon */}
            <div className="flex-1 bg-error/10 flex flex-col items-center justify-center gap-1.5">
              <AlertCircle className={cn(iconSizes.lg, "text-error/25")} />
              <span className="text-[10px] text-overlay-text-muted">{element.source_type === "UPLOADED" ? "Загрузка не удалась" : "Генерация не удалась"}</span>
            </div>
            {/* Bottom info bar */}
            <div className="bg-error/20 px-2.5 py-2 flex items-center justify-between gap-2 pointer-events-auto">
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-error shrink-0" />
                  <span className="text-[10px] font-semibold text-error">Ошибка</span>
                  {element.ai_model_name && (
                    <>
                      <span className="text-[10px] text-overlay-text-muted">·</span>
                      <span className="text-[10px] text-overlay-text-muted truncate">{element.ai_model_name}</span>
                    </>
                  )}
                </div>
                {element.error_message && (
                  <span className="text-[9px] text-overlay-text-muted truncate">{element.error_message}</span>
                )}
              </div>
              <button
                type="button"
                onPointerDown={handleControlPointerDown}
                onClick={handleRetryClick}
                className="flex items-center gap-1 rounded px-2 py-1 bg-overlay-button text-[10px] text-overlay-text font-medium hover:bg-overlay-button-hover transition-colors shrink-0"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                Повторить
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Metadata footer - only when showMetadata and element is completed */}
      {showMetadata && element.status === 'COMPLETED' && (
        <div className="bg-[#151B2B] px-3 py-2.5 space-y-1.5" onClick={(e) => e.stopPropagation()}>
          {/* Row 1: filename + dots menu */}
          <div className="flex items-center justify-between gap-2 min-w-0">
            <span className="text-xs font-medium text-foreground truncate flex-1 min-w-0">
              {filename}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="shrink-0 p-0.5 rounded hover:bg-white/5">
                  <Ellipsis className="w-4 h-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={handleDownload}>
                  <Download className="w-4 h-4 mr-2" />Скачать
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onRename?.(element.id, filename)}>
                  <Pencil className="w-4 h-4 mr-2" />Переименовать
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onMove?.(element.id)}>
                  <FolderInput className="w-4 h-4 mr-2" />Переместить
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <Copy className="w-4 h-4 mr-2" />Копировать
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={handleDeleteClick}>
                  <Trash2 className="w-4 h-4 mr-2" />Удалить
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Row 2: status dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground shrink-0">Статус</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={cn(
                  "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold",
                  currentStatus.bgColor, currentStatus.textColor
                )}>
                  {currentStatus.label}
                  <ChevronDown className="w-3 h-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {APPROVAL_STATUSES.map((status) => (
                  <DropdownMenuItem
                    key={status.value ?? 'null'}
                    onClick={() => onUpdateStatus?.(element.id, status.value)}
                    className={cn(status.value === element.approval_status && "font-semibold")}
                  >
                    <span className={cn("w-2 h-2 rounded-full mr-2 shrink-0", status.bgColor.replace('/[0.125]', ''))} />
                    {status.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}
    </div>
  );
}
