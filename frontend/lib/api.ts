interface TokenPair {
  access: string;
  refresh: string;
}

interface UserQuota {
  max_projects: number;
  used_projects: number;
  max_boxes_per_project: number;
  max_assets_per_box: number;
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
  boxes_count: number;
  boxes_approved_count: number;
  created_at: string;
  updated_at: string;
}

interface Box {
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
  assets_count: number;
  created_at: string;
  updated_at: string;
}

interface Asset {
  id: number;
  box: number;
  box_name: string;
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
  parent_asset: number | null;
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

  // ─── Boxes ───────────────────────────────────────────────

  async getBoxes(projectId: number): Promise<Box[]> {
    return this.request<Box[]>(`/api/boxes/?project=${projectId}`);
  }

  async getBox(id: number): Promise<Box> {
    return this.request<Box>(`/api/boxes/${id}/`);
  }

  async createBox(projectId: number, name: string): Promise<Box> {
    return this.request<Box>('/api/boxes/', {
      method: 'POST',
      body: JSON.stringify({ project: projectId, name }),
    });
  }

  async updateBox(id: number, data: Partial<Pick<Box, 'name' | 'status'>>): Promise<Box> {
    return this.request<Box>(`/api/boxes/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteBox(id: number): Promise<void> {
    await this.request<void>(`/api/boxes/${id}/`, {
      method: 'DELETE',
    });
  }

  async reorderBoxes(boxIds: number[]): Promise<void> {
    await this.request<void>('/api/boxes/reorder/', {
      method: 'POST',
      body: JSON.stringify({ box_ids: boxIds }),
    });
  }

  async setHeadliner(boxId: number, assetId: number | null): Promise<Box> {
    return this.request<Box>(`/api/boxes/${boxId}/set_headliner/`, {
      method: 'POST',
      body: JSON.stringify({ asset_id: assetId }),
    });
  }

  // ─── Assets ──────────────────────────────────────────────

  async getAssets(boxId: number, filters?: { asset_type?: string; is_favorite?: boolean }): Promise<Asset[]> {
    let url = `/api/assets/?box=${boxId}`;
    if (filters?.asset_type) {
      url += `&asset_type=${filters.asset_type}`;
    }
    if (filters?.is_favorite !== undefined) {
      url += `&is_favorite=${filters.is_favorite}`;
    }
    return this.request<Asset[]>(url);
  }

  async getAsset(id: number): Promise<Asset> {
    return this.request<Asset>(`/api/assets/${id}/`);
  }

  async updateAsset(id: number, data: Partial<Pick<Asset, 'is_favorite' | 'prompt_text'>>): Promise<Asset> {
    return this.request<Asset>(`/api/assets/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteAsset(id: number): Promise<void> {
    await this.request<void>(`/api/assets/${id}/`, {
      method: 'DELETE',
    });
  }

  async reorderAssets(assetIds: number[]): Promise<void> {
    await this.request<void>('/api/assets/reorder/', {
      method: 'POST',
      body: JSON.stringify({ asset_ids: assetIds }),
    });
  }

  async uploadFile(
    boxId: number,
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<Asset> {
    const url = `${this.baseURL}/api/boxes/${boxId}/upload/`;
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
export type { User, UserQuota, TokenPair, Project, Box, Asset };
