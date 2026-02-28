/* ── Auth ──────────────────────────────────────────────────── */

export interface User {
  id: number;
  username: string;
  email: string;
}

export interface TokenPair {
  access: string;
  refresh: string;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
}

/* ── Projects ─────────────────────────────────────────────── */

export type ProjectStatus = "ACTIVE" | "PAUSED" | "COMPLETED";
export type AspectRatio = "16:9" | "9:16";

export interface Project {
  id: number;
  name: string;
  status: ProjectStatus;
  aspect_ratio: AspectRatio;
  created_at: string;
  updated_at: string;
  scene_count?: number;
}

export interface CreateProjectPayload {
  name: string;
  aspect_ratio: AspectRatio;
}

export interface UpdateProjectPayload {
  name?: string;
  status?: ProjectStatus;
  aspect_ratio?: AspectRatio;
}

/* ── Scenes ───────────────────────────────────────────────── */

export type SceneStatus = "DRAFT" | "IN_PROGRESS" | "REVIEW" | "APPROVED";

export interface Scene {
  id: number;
  project: number;
  name: string;
  status: SceneStatus;
  order_index: number;
  headliner: number | null;
  headliner_url?: string | null;
  element_count?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateScenePayload {
  name: string;
  project: number;
}

export interface UpdateScenePayload {
  name?: string;
  status?: SceneStatus;
  order_index?: number;
  headliner?: number | null;
}

export interface ReorderScenesPayload {
  scene_ids: number[];
}

/* ── Elements ─────────────────────────────────────────────── */

export type ElementType = "IMAGE" | "VIDEO";
export type ElementStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
export type ElementSource = "GENERATED" | "UPLOADED" | "IMG2VID";

export interface Element {
  id: number;
  scene: number;
  element_type: ElementType;
  order_index: number;
  file_url: string;
  thumbnail_url: string;
  is_favorite: boolean;
  prompt_text: string;
  ai_model: number | null;
  ai_model_name?: string;
  generation_config: Record<string, unknown>;
  seed: number | null;
  status: ElementStatus;
  error_message: string;
  source_type: ElementSource;
  parent_element: number | null;
  created_at: string;
  updated_at: string;
}

export interface GenerateElementPayload {
  scene: number;
  ai_model: number;
  prompt_text: string;
  generation_config?: Record<string, unknown>;
}

export interface UploadElementPayload {
  scene: number;
  file: File;
}

export interface UpdateElementPayload {
  is_favorite?: boolean;
  order_index?: number;
  prompt_text?: string;
}

export interface ReorderElementsPayload {
  element_ids: number[];
}

export interface SetHeadlinerPayload {
  element_id: number;
}

export interface Img2VidPayload {
  parent_element: number;
  ai_model: number;
  prompt_text?: string;
  generation_config?: Record<string, unknown>;
}

/* ── AI Models ────────────────────────────────────────────── */

export type ModelType = "IMAGE" | "VIDEO";

export interface ParameterOption {
  value: string | number;
  label: string;
}

export interface ParameterSchema {
  type: "select" | "toggle" | "slider" | "number" | "text";
  label: string;
  options?: ParameterOption[];
  default?: unknown;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}

export interface AIModel {
  id: number;
  name: string;
  model_type: ModelType;
  provider_name: string;
  api_endpoint: string;
  parameters_schema: Record<string, ParameterSchema>;
  is_active: boolean;
}

/* ── Sharing ──────────────────────────────────────────────── */

export interface SharedLink {
  id: number;
  token: string;
  project: number;
  expires_at: string | null;
  created_at: string;
}

export interface CreateSharedLinkPayload {
  project: number;
  expires_at?: string;
}

export interface PublicProject {
  id: number;
  name: string;
  aspect_ratio: AspectRatio;
  scenes: PublicScene[];
}

export interface PublicScene {
  id: number;
  name: string;
  status: SceneStatus;
  order_index: number;
  headliner_url: string | null;
  comments: Comment[];
}

export interface Comment {
  id: number;
  author_name: string;
  text: string;
  created_at: string;
}

export interface CreateCommentPayload {
  scene: number;
  author_name: string;
  text: string;
  token: string;
}

/* ── WebSocket events ─────────────────────────────────────── */

export interface WSElementStatusChangedEvent {
  type: "element_status_changed";
  element_id: number;
  scene_id: number;
  status: ElementStatus;
  file_url?: string;
  thumbnail_url?: string;
  error_message?: string;
}

export type WSEvent = WSElementStatusChangedEvent;

/* ── API responses ────────────────────────────────────────── */

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ApiError {
  message: string;
  detail?: string;
  code?: string;
}
