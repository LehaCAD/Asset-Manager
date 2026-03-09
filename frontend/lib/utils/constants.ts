export const ASPECT_RATIOS = [
  { value: "16:9", label: "16:9 (Горизонтальный)" },
  { value: "9:16", label: "9:16 (Вертикальный)" },
] as const;

export type AspectRatio = (typeof ASPECT_RATIOS)[number]["value"];

export const PROJECT_STATUSES = [
  { value: "ACTIVE", label: "Активен", color: "text-green-500" },
  { value: "PAUSED", label: "На паузе", color: "text-yellow-500" },
  { value: "COMPLETED", label: "Завершён", color: "text-blue-500" },
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
  sm: { minSize: "140px", gap: "8px" },
  md: { minSize: "200px", gap: "12px" },
  lg: { minSize: "280px", gap: "16px" },
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

export const DEFAULT_PROJECT_DISPLAY_PREFERENCES = {
  size: "medium",
  aspectRatio: "landscape",
  fitMode: "fill",
} as const;
