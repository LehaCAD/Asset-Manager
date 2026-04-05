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
// Compact: ~36-38k px² (как был medium - чтобы текст влезал)
// Medium: ~58-60k px² (как был large)
// Large: ~80-85k px² (новый большой размер)

export const CARD_SIZES = {
  compact: {
    landscape: { width: 260, height: 146 },  // 16:9, площадь: 37,960
    square:    { width: 190, height: 190 },  // 1:1,  площадь: 36,100
    portrait:  { width: 165, height: 220 },  // 3:4,  площадь: 36,300
  },
  medium: {
    landscape: { width: 320, height: 180 },  // 16:9, площадь: 57,600
    square:    { width: 240, height: 240 },  // 1:1,  площадь: 57,600
    portrait:  { width: 210, height: 280 },  // 3:4,  площадь: 58,800
  },
  large: {
    landscape: { width: 380, height: 214 },  // 16:9, площадь: 81,320
    square:    { width: 290, height: 290 },  // 1:1,  площадь: 84,100
    portrait:  { width: 250, height: 334 },  // 3:4,  площадь: 83,500
  },
} as const;

// GroupCard sizes — proportions ~5:4, pixel area ≈ CARD_SIZES landscape.
// stackStep = offset per layer (same in X and Y). 2 layers → stackWidth = width + step*2.
export const GROUP_CARD_SIZES = {
  compact: { width: 220, height: 175, stackStep: 5, stackWidth: 230 },  // 220+5*2
  medium:  { width: 270, height: 215, stackStep: 6, stackWidth: 282 },  // 270+6*2
  large:   { width: 320, height: 255, stackStep: 7, stackWidth: 334 },  // 320+7*2
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

// CSS классы для grid с auto-fit
export const DISPLAY_GRID_CONFIG = {
  compact: {
    landscape: {
      gridStyle: "grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))",
      gap: "gap-2"
    },
    square:    {
      gridStyle: "grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))",
      gap: "gap-2"
    },
    portrait:  {
      gridStyle: "grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))",
      gap: "gap-2"
    },
  },
  medium: {
    landscape: {
      gridStyle: "grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))",
      gap: "gap-2.5"
    },
    square:    {
      gridStyle: "grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))",
      gap: "gap-2.5"
    },
    portrait:  {
      gridStyle: "grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))",
      gap: "gap-2.5"
    },
  },
  large: {
    landscape: {
      gridStyle: "grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))",
      gap: "gap-3"
    },
    square:    {
      gridStyle: "grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))",
      gap: "gap-3"
    },
    portrait:  {
      gridStyle: "grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))",
      gap: "gap-3"
    },
  },
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
