export const ASPECT_RATIOS = [
  { value: "16:9", label: "16:9 (Горизонтальный)" },
  { value: "9:16", label: "9:16 (Вертикальный)" },
] as const;

export type AspectRatio = (typeof ASPECT_RATIOS)[number]["value"];

export const PROJECT_STATUSES = [
  { value: "ACTIVE", label: "Активен", color: "bg-success" },
  { value: "PAUSED", label: "На паузе", color: "bg-warning" },
  { value: "COMPLETED", label: "Завершён", color: "bg-blue-400" },
] as const;

export const SCENE_STATUSES = [
  { value: "DRAFT", label: "Черновик", variant: "secondary" as const },
  { value: "IN_PROGRESS", label: "В работе", variant: "default" as const },
  { value: "REVIEW", label: "На проверке", variant: "outline" as const },
  { value: "APPROVED", label: "Утверждено", variant: "default" as const },
] as const;

export const ELEMENT_STATUSES = [
  { value: "PENDING", label: "Ожидание" },
  { value: "PROCESSING", label: "В работе" },
  { value: "COMPLETED", label: "Готово" },
  { value: "FAILED", label: "Ошибка" },
] as const;

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const WS_BASE_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/mov"];
export const MAX_FILE_SIZE_MB = 100;

export const GRID_DENSITY_CONFIG = {
  sm: { minSize: "140px", gap: "6px" },
  md: { minSize: "180px", gap: "8px" },
  lg: { minSize: "240px", gap: "12px" },
} as const;

export const DISPLAY_CARD_SIZES = [
  { value: "compact", label: "Компактный" },
  { value: "medium", label: "Средний" },
  { value: "large", label: "Крупный" },
] as const;

export const DISPLAY_ASPECT_RATIO_OPTIONS = [
  { value: "landscape", label: "Горизонтальный" },
  { value: "square", label: "Квадрат" },
  { value: "portrait", label: "Вертикальный" },
] as const;

export const DISPLAY_FIT_MODE_OPTIONS = [
  { value: "fill", label: "Заполнить" },
  { value: "fit", label: "Целиком" },
] as const;

export const DEFAULT_DISPLAY_PREFERENCES = {
  size: "medium",
  aspectRatio: "landscape",
  fitMode: "fill",
  showMetadata: true,
} as const;

// Backward compatibility alias
export const DEFAULT_PROJECT_DISPLAY_PREFERENCES = DEFAULT_DISPLAY_PREFERENCES;

// ============================================
// Grid configuration с фиксированными размерами
// Цель: примерно одинаковая площадь внутри размера, 
// заметная разница между размерами
// ============================================

// Размеры карточек в пикселях для каждого сочетания
// Landscape: ширина × высота (16:9)
// Square: ширина × высота (1:1)  
// Portrait: ширина × высота (3:4)

// Площади примерно:
// Compact: ~76k px² (крупные карточки, текст хорошо читается)
// Medium: ~115k px² (основной рабочий размер)
// Large: ~180k px² (детальный просмотр)

export const CARD_SIZES = {
  compact: {
    landscape: { width: 360, height: 202 },  // 16:9, площадь: 72,720
    square:    { width: 270, height: 270 },  // 1:1,  площадь: 72,900
    portrait:  { width: 235, height: 313 },  // 3:4,  площадь: 73,555
  },
  medium: {
    landscape: { width: 440, height: 248 },  // 16:9, площадь: 109,120
    square:    { width: 330, height: 330 },  // 1:1,  площадь: 108,900
    portrait:  { width: 290, height: 387 },  // 3:4,  площадь: 112,230
  },
  large: {
    landscape: { width: 560, height: 315 },  // 16:9, площадь: 176,400
    square:    { width: 420, height: 420 },  // 1:1,  площадь: 176,400
    portrait:  { width: 365, height: 487 },  // 3:4,  площадь: 177,755
  },
} as const;

// GroupCard sizes — proportions ~5:4, pixel area ≈ CARD_SIZES landscape.
// stackStep = offset per layer (same in X and Y). 2 layers → stackWidth = width + step*2.
export const GROUP_CARD_SIZES = {
  compact: { width: 300, height: 240, stackStep: 5, stackWidth: 310 },  // 300+5*2
  medium:  { width: 380, height: 304, stackStep: 6, stackWidth: 392 },  // 380+6*2
  large:   { width: 480, height: 384, stackStep: 7, stackWidth: 494 },  // 480+7*2
} as const;

// ── Badge System (фиксированные, НЕ зависят от view mode) ──
export const BADGE_SM = {
  wrapper: "h-6 w-6",         // 24px
  icon: "h-3.5 w-3.5",        // 14px
  padding: "p-[5px]",
} as const;

export const BADGE_MD = {
  wrapper: "h-7 w-7",         // 28px
  icon: "h-4 w-4",            // 16px
  padding: "p-1.5",
} as const;

// ── Grid minWidth per aspect ratio ──
// Разный minmax для разных AR обеспечивает примерно равную площадь карточек.
// Portrait получает меньший minWidth → больше колонок → каждая уже → площадь не раздувается.
// Формула: для равной площади при AR r=w/h, ширина ∝ sqrt(r).
// landscape(16:9) : square(1:1) : portrait(3:4) ≈ 1.0 : 0.75 : 0.65
export const DISPLAY_GRID_CONFIG = {
  compact: {
    landscape: { minWidth: 260, gap: "gap-2.5" },
    square:    { minWidth: 195, gap: "gap-2.5" },
    portrait:  { minWidth: 170, gap: "gap-2.5" },
  },
  medium: {
    landscape: { minWidth: 320, gap: "gap-3" },
    square:    { minWidth: 240, gap: "gap-3" },
    portrait:  { minWidth: 210, gap: "gap-3" },
  },
  large: {
    landscape: { minWidth: 400, gap: "gap-4" },
    square:    { minWidth: 300, gap: "gap-4" },
    portrait:  { minWidth: 260, gap: "gap-4" },
  },
} as const;

// minWidth для грида групп — зависит только от size, не от aspect ratio.
// Группы всегда одного соотношения сторон (~5:4), меняется только масштаб.
export const GROUP_GRID_MIN_WIDTH = {
  compact: 260,
  medium: 320,
  large: 400,
} as const;

// Aspect ratio classes - только aspect, без max-width!
export const ASPECT_RATIO_CLASSES = {
  landscape: "aspect-video",    // 16:9
  square:    "aspect-square",   // 1:1
  portrait:  "aspect-[3/4]",    // 3:4
} as const;

// Object fit classes
export const FIT_MODE_CLASSES = {
  fill: "object-cover",
  fit: "object-contain",
} as const;
