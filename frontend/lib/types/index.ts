/* ── Auth ──────────────────────────────────────────────────── */

export interface User {
  id: number;
  username: string;
  email: string;
  quota?: UserQuota;
}

export interface UserQuota {
  max_projects: number;
  used_projects: number;
  max_scenes_per_project: number;
  max_scenes_used: number;
  max_elements_per_scene: number;
  max_elements_used: number;
  storage_limit_bytes: number;
  storage_used_bytes: number;
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
  element_count?: number;
  total_spent?: string;
  storage_bytes?: number;
  preview_thumbnails?: string[];
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
  project_name?: string;
  name: string;
  status: SceneStatus;
  status_display?: string;
  order_index: number;
  headliner: number | null;
  headliner_url?: string | null;
  headliner_thumbnail_url?: string | null;
  headliner_type?: ElementType | null;
  element_count?: number;
  elements_count?: number;
  parent: number | null;
  parent_name?: string | null;
  children_count?: number;
  depth?: number;
  total_spent?: string;
  storage_bytes?: number;
  preview_thumbnails?: string[];
  created_at: string;
  updated_at: string;
}

export type Group = Scene;

export interface CreateScenePayload {
  name: string;
  project: number;
  parent?: number | null;
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
export type ElementStatus = "PENDING" | "PROCESSING" | "UPLOADING" | "COMPLETED" | "FAILED";
export type ElementSource = "GENERATED" | "UPLOADED" | "IMG2VID";
export type OptimisticElementKind = "upload" | "generation";
export type GenerationSubmitState = "idle" | "submitting" | "accepted" | "rejected";

export interface Element {
  id: number;
  scene: number | null;
  project: number;
  project_name?: string;
  group_name?: string | null;
  element_type: ElementType;
  order_index: number;
  file_url: string;
  thumbnail_url: string;
  preview_url: string;
  is_favorite: boolean;
  prompt_text: string;
  ai_model: number | null;
  ai_model_name?: string;
  generation_config: Record<string, unknown>;
  seed: number | null;
  status: ElementStatus;
  error_message: string;
  source_type: ElementSource;
  file_size?: number | null;
  generation_cost?: string | null;
  created_at: string;
  updated_at: string;
}

export type UploadPhase = "resize" | "presign" | "upload_thumb" | "upload_full" | "completing";

export interface WorkspaceElement extends Element {
  client_optimistic_kind?: OptimisticElementKind;
  client_generation_submit_state?: GenerationSubmitState;
  client_upload_phase?: UploadPhase;
  client_upload_progress?: number; // 0–100
}

export interface GeneratePayload {
  prompt: string;
  ai_model_id: number;
  generation_config?: Record<string, unknown>;
}

export interface CreateOptimisticGenerationInput {
  sceneId: number;
  promptText: string;
  aiModelId: number | null;
  aiModelName?: string;
  generationConfig?: Record<string, unknown>;
  elementType?: ElementType;
}

export interface GenerationSubmitAcceptedResult {
  ok: true;
  state: "accepted";
  element: Element;
  optimisticId: number | null;
}

export interface GenerationSubmitRejectedResult {
  ok: false;
  state: "rejected";
  errorMessage: string;
  optimisticId: number | null;
}

export type GenerationSubmitResult =
  | GenerationSubmitAcceptedResult
  | GenerationSubmitRejectedResult;

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

export interface ReorderItem {
  type: 'element' | 'group';
  id: number;
}

export interface SetHeadlinerPayload {
  element_id: number;
}



/* ── AI Models ────────────────────────────────────────────── */

export type ModelType = "IMAGE" | "VIDEO";

export interface ParameterOption {
  value: string | number;
  label: string;
  icon?: string;
}

export type UISemantic =
  | "aspect_ratio"
  | "resolution"
  | "quality"
  | "output_format"
  | "duration"
  | "switch"
  | "slider"
  | "number"
  | "select"
  | "toggle_group";

export interface ParameterSchemaItem {
  request_key: string;        // field name in API request body (placeholder in request_schema)
  label: string;
  ui_semantic: UISemantic;
  control?: string;
  options?: ParameterOption[];
  featured_options?: ParameterOption[];
  overflow_options?: ParameterOption[];
  show_other_button?: boolean;
  custom_options?: ParameterOption[];  // optional: options for Custom panel
  default?: unknown;
  min?: number;
  max?: number;
  step?: number;
  visible?: boolean;
  advanced?: boolean;
  affects_pricing?: boolean;
}

export interface ImageInputSchemaItem {
  key: string;
  label: string;
  min: number;
  max: number;
  required?: boolean;
  description?: string;
  icon?: string;
  illustration?: string;
  depends_on?: string;
}

export interface ImageInputGroup {
  key: string;
  label: string;
  description?: string;
  icon?: string;
  illustration?: string;
  collect_to?: string;
  exclusive_with?: string[];
  extra_params?: Record<string, unknown>;
  slots: ImageInputSchemaItem[];
}

export interface ImageInputGroupsSchema {
  mode: "groups";
  groups: ImageInputGroup[];
  no_images_params?: Record<string, unknown>;
}

export type ImageInputsSchema = ImageInputSchemaItem[] | ImageInputGroupsSchema;

export function isGroupsSchema(schema: ImageInputsSchema): schema is ImageInputGroupsSchema {
  return !Array.isArray(schema) && typeof schema === 'object' && schema?.mode === 'groups';
}

export interface AIModel {
  id: number;
  name: string;
  model_type: ModelType;
  provider_name: string;
  parameters_schema: ParameterSchemaItem[];
  preview_url: string;
  description: string;
  tags: string[];
  image_inputs_schema: ImageInputsSchema;
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

export interface PublicElement {
  id: number;
  element_type: ElementType;
  file_url: string;
  thumbnail_url: string;
  is_favorite: boolean;
}

export interface PublicScene {
  id: number;
  name: string;
  status: SceneStatus;
  order_index: number;
  headliner_url: string | null;
  elements: PublicElement[];
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
  preview_url?: string;
  error_message?: string;
  upload_progress?: number;
}

export type WSEvent = WSElementStatusChangedEvent;

/* ── UI Types ─────────────────────────────────────────────── */

export type GridDensity = "sm" | "md" | "lg";
export type ElementFilter = "all" | "favorites" | "images" | "videos";
export type DisplayCardSize = "compact" | "medium" | "large";
export type DisplayAspectRatio = "landscape" | "square" | "portrait";
export type DisplayFitMode = "fill" | "fit";

export interface DisplayPreferences {
  size: DisplayCardSize;
  aspectRatio: DisplayAspectRatio;
  fitMode: DisplayFitMode;
}

// Backward compatibility alias
export type ProjectDisplayPreferences = DisplayPreferences;

export interface SceneNeighbors {
  currentScene: Scene | null;
  previousScene: Scene | null;
  nextScene: Scene | null;
  currentIndex: number;
  total: number;
}

export type ModalSelectionByScene = Record<number, number[]>;

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

/* ── Credits ─────────────────────────────────────────────── */

export interface CreditsBalanceResponse {
  balance: string;
  pricing_percent: number;
  label: string;
}

export interface CreditsEstimateRequest {
  ai_model_id: number;
  generation_config: Record<string, unknown>;
}

export interface CreditsEstimateResponse {
  cost: string | null;
  balance: string;
  can_afford: boolean;
  error: string | null;
}

/* ── Stats / Metrics ─────────────────────────────────────── */

export interface ProjectStats {
  total_spent: string;
  elements_count: number;
  storage_bytes: number;
  storage_display: string;
  groups_count: number;
  last_generation_cost: string | null;
  last_generation_model: string | null;
}

export interface SceneStats {
  total_spent: string;
  elements_count: number;
  storage_bytes: number;
  storage_display: string;
}
