interface TokenPair {
  access: string;
  refresh: string;
}

interface UserQuota {
  max_projects: number;
  used_projects: number;
  max_scenes_per_project: number;
  max_elements_per_scene: number;
}

interface User {
  id: number;
  username: string;
  email: string;
  quota?: UserQuota;
}

interface Project {
  id: number;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  status_display: string;
  aspect_ratio: '16:9' | '9:16';
  scenes_count: number;
  scenes_approved_count: number;
  created_at: string;
  updated_at: string;
}

interface Scene {
  id: number;
  project: number;
  project_name: string;
  name: string;
  status: 'DRAFT' | 'IN_PROGRESS' | 'REVIEW' | 'APPROVED';
  status_display: string;
  order_index: number;
  headliner: number | null;
  headliner_url: string;
  headliner_thumbnail_url: string;
  headliner_type: string;
  elements_count: number;
  created_at: string;
  updated_at: string;
}

interface Element {
  id: number;
  scene: number;
  scene_name: string;
  asset_type: 'IMAGE' | 'VIDEO';
  order_index: number;
  file_url: string;
  thumbnail_url: string;
  is_favorite: boolean;
  prompt_text: string;
  ai_model: number | null;
  ai_model_name: string | null;
  generation_config: Record<string, unknown>;
  seed: number | null;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  status_display: string;
  error_message: string;
  source_type: 'GENERATED' | 'UPLOADED' | 'IMG2VID';
  source_type_display: string;
  parent_element: number | null;
  external_task_id: string;
  created_at: string;
  updated_at: string;
}

function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    // Browser: use the env var or derive from current location
    const envUrl = process.env.NEXT_PUBLIC_API_URL;
    if (envUrl) return envUrl;
    // Fallback: same host, port 8000
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
}

class APIClient {
  private get baseURL(): string {
    return getApiBaseUrl();
  }
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  setTokens(tokens: TokenPair) {
    this.accessToken = tokens.access;
    this.refreshToken = tokens.refresh;
    if (typeof window !== 'undefined') {
      localStorage.setItem('access_token', tokens.access);
      localStorage.setItem('refresh_token', tokens.refresh);
    }
  }

  getAccessToken(): string | null {
    if (!this.accessToken && typeof window !== 'undefined') {
      this.accessToken = localStorage.getItem('access_token');
    }
    return this.accessToken;
  }

  getRefreshToken(): string | null {
    if (!this.refreshToken && typeof window !== 'undefined') {
      this.refreshToken = localStorage.getItem('refresh_token');
    }
    return this.refreshToken;
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    }
  }

  async refreshAccessToken(): Promise<boolean> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      return false;
    }

    try {
      const response = await fetch(`${this.baseURL}/api/auth/token/refresh/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh: refreshToken }),
      });

      if (response.ok) {
        const data = await response.json();
        this.accessToken = data.access;
        if (typeof window !== 'undefined') {
          localStorage.setItem('access_token', data.access);
        }
        return true;
      }
      
      this.clearTokens();
      return false;
    } catch (error) {
      console.error('Failed to refresh token:', error);
      return false;
    }
  }

  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const accessToken = this.getAccessToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (options.headers) {
      const existingHeaders = new Headers(options.headers);
      existingHeaders.forEach((value, key) => {
        headers[key] = value;
      });
    }

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers,
      });
    } catch (err) {
      console.error(`[API] Network error on ${options.method || 'GET'} ${endpoint}:`, err);
      throw new Error('Ошибка сети. Проверьте подключение к серверу.');
    }

    // If we get 401, try to refresh the token
    if (response.status === 401) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        const newAccessToken = this.getAccessToken();
        if (newAccessToken) {
          headers['Authorization'] = `Bearer ${newAccessToken}`;
        }
        try {
          response = await fetch(url, {
            ...options,
            headers,
          });
        } catch (err) {
          console.error(`[API] Network error on retry ${endpoint}:`, err);
          throw new Error('Ошибка сети. Проверьте подключение к серверу.');
        }
      } else {
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        throw new Error('Authentication failed');
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (errorData.detail) {
        throw new Error(errorData.detail);
      }
      if (errorData.message) {
        throw new Error(errorData.message);
      }
      const fieldErrors: string[] = [];
      for (const key of Object.keys(errorData)) {
        const val = errorData[key];
        if (Array.isArray(val)) {
          fieldErrors.push(...val);
        } else if (typeof val === 'string') {
          fieldErrors.push(val);
        }
      }
      if (fieldErrors.length > 0) {
        throw new Error(fieldErrors.join(' '));
      }
      throw new Error(`Ошибка ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  // Auth endpoints
  async register(username: string, email: string, password: string, password_confirm: string): Promise<TokenPair> {
    const data = await this.request<TokenPair>('/api/auth/register/', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, password_confirm }),
    });
    this.setTokens(data);
    return data;
  }

  async login(username: string, password: string): Promise<TokenPair> {
    const data = await this.request<TokenPair>('/api/auth/login/', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    this.setTokens(data);
    return data;
  }

  async getMe(): Promise<User> {
    return this.request<User>('/api/auth/me/');
  }

  logout() {
    this.clearTokens();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }

  // ─── Projects ────────────────────────────────────────────

  async getProjects(): Promise<Project[]> {
    return this.request<Project[]>('/api/projects/');
  }

  async getProject(id: number): Promise<Project> {
    return this.request<Project>(`/api/projects/${id}/`);
  }

  async createProject(name: string, aspect_ratio?: '16:9' | '9:16'): Promise<Project> {
    return this.request<Project>('/api/projects/', {
      method: 'POST',
      body: JSON.stringify({ name, aspect_ratio: aspect_ratio || '16:9' }),
    });
  }

  async updateProject(id: number, data: Partial<Pick<Project, 'name' | 'status' | 'aspect_ratio'>>): Promise<Project> {
    return this.request<Project>(`/api/projects/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteProject(id: number): Promise<void> {
    await this.request<void>(`/api/projects/${id}/`, {
      method: 'DELETE',
    });
  }

  // ─── Scenes ──────────────────────────────────────────────

  async getScenes(projectId: number): Promise<Scene[]> {
    return this.request<Scene[]>(`/api/scenes/?project=${projectId}`);
  }

  async getScene(id: number): Promise<Scene> {
    return this.request<Scene>(`/api/scenes/${id}/`);
  }

  async createScene(projectId: number, name: string): Promise<Scene> {
    return this.request<Scene>('/api/scenes/', {
      method: 'POST',
      body: JSON.stringify({ project: projectId, name }),
    });
  }

  async updateScene(id: number, data: Partial<Pick<Scene, 'name' | 'status'>>): Promise<Scene> {
    return this.request<Scene>(`/api/scenes/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteScene(id: number): Promise<void> {
    await this.request<void>(`/api/scenes/${id}/`, {
      method: 'DELETE',
    });
  }

  async reorderScenes(sceneIds: number[]): Promise<void> {
    await this.request<void>('/api/scenes/reorder/', {
      method: 'POST',
      body: JSON.stringify({ scene_ids: sceneIds }),
    });
  }

  async setHeadliner(sceneId: number, elementId: number | null): Promise<Scene> {
    return this.request<Scene>(`/api/scenes/${sceneId}/set_headliner/`, {
      method: 'POST',
      body: JSON.stringify({ element_id: elementId }),
    });
  }

  // ─── Elements ────────────────────────────────────────────

  async getElements(sceneId: number, filters?: { asset_type?: string; is_favorite?: boolean }): Promise<Element[]> {
    let url = `/api/elements/?scene=${sceneId}`;
    if (filters?.asset_type) {
      url += `&asset_type=${filters.asset_type}`;
    }
    if (filters?.is_favorite !== undefined) {
      url += `&is_favorite=${filters.is_favorite}`;
    }
    return this.request<Element[]>(url);
  }

  async getElement(id: number): Promise<Element> {
    return this.request<Element>(`/api/elements/${id}/`);
  }

  async updateElement(id: number, data: Partial<Pick<Element, 'is_favorite' | 'prompt_text'>>): Promise<Element> {
    return this.request<Element>(`/api/elements/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteElement(id: number): Promise<void> {
    await this.request<void>(`/api/elements/${id}/`, {
      method: 'DELETE',
    });
  }

  async reorderElements(elementIds: number[]): Promise<void> {
    await this.request<void>('/api/elements/reorder/', {
      method: 'POST',
      body: JSON.stringify({ element_ids: elementIds }),
    });
  }

  async uploadFile(
    sceneId: number,
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<Element> {
    const url = `${this.baseURL}/api/scenes/${sceneId}/upload/`;
    const accessToken = this.getAccessToken();

    const formData = new FormData();
    formData.append('file', file);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100);
            onProgress(progress);
          }
        });
      }

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve(data);
          } catch {
            reject(new Error('Не удалось распарсить ответ'));
          }
        } else {
          try {
            const errorData = JSON.parse(xhr.responseText);
            reject(new Error(errorData.detail || errorData.error || `Ошибка ${xhr.status}`));
          } catch {
            reject(new Error(`Ошибка ${xhr.status}`));
          }
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Ошибка сети'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Загрузка отменена'));
      });

      xhr.open('POST', url);
      if (accessToken) {
        xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
      }

      xhr.send(formData);
    });
  }
}

export const apiClient = new APIClient();
export type { User, UserQuota, TokenPair, Project, Scene, Element };
