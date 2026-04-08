/* ── Auth ──────────────────────────────────────────────────── */

export interface User {
  id: number;
  username: string;
  email: string;
  is_email_verified?: boolean;
  quota?: UserQuota;
  subscription?: UserSubscription;
}

export interface UserSubscription {
  plan_code: string;
  plan_name: string;
  status: 'active' | 'trial' | 'expired' | 'cancelled';
  expires_at: string | null;
  features: string[];
  is_trial: boolean;
  trial_days_left: number | null;
}

export interface FeatureGateInfo {
  code: string;
  title: string;
  description: string;
  icon: string;
  min_plan_name: string;
  min_plan_price: number;
}

export interface PlanInfo {
  code: string;
  name: string;
  price: number;
  credits_per_month: number;
  max_projects: number;
  max_scenes_per_project: number;
  max_elements_per_scene: number;
  storage_limit_gb: number;
  features: { code: string; title: string; description: string; icon: string }[];
  is_recommended: boolean;
  display_order: number;
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
  tos_accepted?: boolean;
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
export type ElementSource = "GENERATED" | "UPLOADED";
export type ApprovalStatus = 'IN_PROGRESS' | 'APPROVED';
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
  approval_status: ApprovalStatus | null;
  original_filename: string;
  review_summary?: { action: string; author_name: string } | null;
}

export type UploadPhase = "resize" | "presign" | "upload_thumb" | "upload_full" | "completing";

export interface WorkspaceElement extends Element {
  client_optimistic_kind?: OptimisticElementKind;
  client_generation_submit_state?: GenerationSubmitState;
  client_upload_phase?: UploadPhase;
  client_upload_progress?: number; // 0–100
  comment_count?: number;
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
  approval_status?: ApprovalStatus | null;
  original_filename?: string;
  scene?: number | null;
}

export interface ReorderElementsPayload {
  element_ids: number[];
}

export interface ReorderItem {
  type: 'element' | 'group';
  id: number;
}

// DnD prefixed ID types — prevent collision between group.id and element.id
export type DragItemType = 'element' | 'group';

export interface DragItem {
  type: DragItemType;
  id: number;
}

export interface SectionCollapseState {
  groups: boolean;
  elements: boolean;
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
  id: number
  token: string
  project: number
  project_name: string
  created_by: number
  name: string
  element_ids: number[]
  element_count: number
  comment_count: number
  expires_at: string | null
  created_at: string
  url: string
  display_preferences?: {
    size?: string
    aspectRatio?: string
    fitMode?: string
  }
}

export interface CreateSharedLinkPayload {
  project: number
  element_ids: number[]
  name?: string
  expires_at?: string
}

export interface PublicProject {
  name: string
  scenes: PublicScene[]
  ungrouped_elements: PublicElement[]
  display_preferences?: {
    size?: string
    aspectRatio?: string
    fitMode?: string
  }
}

export interface PublicElementReaction {
  session_id: string
  author_name: string
  value: 'like' | 'dislike'
}

export interface PublicElementReview {
  session_id: string
  author_name: string
  action: 'approved' | 'changes_requested' | 'rejected'
}

export interface PublicElement {
  id: number
  element_type: ElementType
  file_url: string
  thumbnail_url: string
  preview_url?: string
  comment_count: number
  likes?: number
  dislikes?: number
  reactions?: PublicElementReaction[]
  reviews?: PublicElementReview[]
  comments?: Comment[]
  source_type?: ElementSource;
  original_filename?: string;
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
  id: number
  element: number | null
  scene: number | null
  parent: number | null
  author_name: string
  author_user: number | null
  session_id: string
  text: string
  is_read: boolean
  created_at: string
  replies: Comment[]
  is_system?: boolean;
}

export interface CreateCommentPayload {
  text: string
  author_name: string
  session_id: string
  element_id?: number
  scene_id?: number
  parent_id?: number
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

export type NotificationType = 'comment_new' | 'reaction_new' | 'review_new' | 'generation_completed' | 'generation_failed' | 'upload_completed'

export interface Notification {
  id: number
  type: NotificationType
  project: number | null
  element: number | null
  scene: number | null
  comment: number | null
  title: string
  message: string
  is_read: boolean
  created_at: string
}

export interface WSNewCommentEvent {
  type: 'new_comment'
  comment_id: number
  element_id: number | null
  scene_id: number | null
  author_name: string
  text: string
  created_at: string
}

export interface WSNewNotificationEvent {
  type: 'new_notification'
  notification: Notification
}

export type WSEvent = WSElementStatusChangedEvent | WSNewCommentEvent

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
  showMetadata: boolean;
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

/* ── Cabinet ─────────────────────────────────────────────── */

export interface CabinetAnalytics {
  period: { start: string; end: string };
  summary: {
    balance: string;
    total_spent: string;
    total_generations: number;
    success_rate: number;
    storage_used_bytes: number;
    storage_limit_bytes: number;
  };
  spending_by_day: { date: string; amount: string; count: number }[];
  spending_by_model: { model_id: number | null; model_name: string; amount: string; count: number }[];
  spending_by_project: { project_id: number; project_name: string; amount: string; storage_bytes: number }[];
  generation_stats: {
    total: number;
    completed: number;
    failed: number;
    success_rate: number;
    avg_cost: string | null;
    top_model: string | null;
  };
}

export interface CabinetHistoryEntry {
  id: number;
  created_at: string;
  element_type: ElementType;
  source_type: ElementSource;
  status: ElementStatus;
  status_display: string;
  error_message: string;
  ai_model_name: string | null;
  prompt_text: string;
  generation_cost: string | null;
  file_size: number | null;
  project_id: number | null;
  project_name: string | null;
  thumbnail_url: string;
  file_url: string;
}

export interface CabinetTransaction {
  id: number;
  created_at: string;
  reason: string;
  reason_display: string;
  amount: string;
  balance_after: string;
  ai_model_name: string | null;
  element_id: number | null;
}

export interface CabinetStorage {
  storage_used_bytes: number;
  storage_limit_bytes: number;
  by_project: {
    project_id: number;
    project_name: string;
    elements_count: number;
    storage_bytes: number;
  }[];
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
