import { WS_BASE_URL } from "@/lib/utils/constants";
import type { WSEvent } from "@/lib/types";

type EventHandler = (event: WSEvent) => void;
type ConnectionHandler = () => void;
type ReconnectExhaustedHandler = () => void;

const PING_INTERVAL_MS = 30_000;
const RECONNECT_DELAY_BASE_MS = 1_000;
const RECONNECT_DELAY_MAX_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 10;

export class WebSocketManager {
  private socket: WebSocket | null = null;
  private projectId: number | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private shouldReconnect = true;

  private eventHandlers = new Set<EventHandler>();
  private connectHandlers = new Set<ConnectionHandler>();
  private disconnectHandlers = new Set<ConnectionHandler>();
  private reconnectExhaustedHandlers = new Set<ReconnectExhaustedHandler>();
  private hasNotifiedReconnectExhausted = false;

  connect(projectId: number): void {
    if (
      this.socket?.readyState === WebSocket.OPEN &&
      this.projectId === projectId
    ) {
      return;
    }

    this.disconnect();
    this.projectId = projectId;
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    this.hasNotifiedReconnectExhausted = false;
    this.openSocket();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.clearTimers();

    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }
  }

  on(handler: EventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  onConnect(handler: ConnectionHandler): () => void {
    this.connectHandlers.add(handler);
    return () => this.connectHandlers.delete(handler);
  }

  onDisconnect(handler: ConnectionHandler): () => void {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }

  onReconnectExhausted(handler: ReconnectExhaustedHandler): () => void {
    this.reconnectExhaustedHandlers.add(handler);
    return () => this.reconnectExhaustedHandlers.delete(handler);
  }

  get isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  private openSocket(): void {
    if (!this.projectId) return;

    const token = this.getToken();
    const url = token
      ? `${WS_BASE_URL}/ws/projects/${this.projectId}/?token=${token}`
      : `${WS_BASE_URL}/ws/projects/${this.projectId}/`;

    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.hasNotifiedReconnectExhausted = false;
      this.startPing();
      this.connectHandlers.forEach((h) => h());
    };

    this.socket.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as WSEvent;
        this.eventHandlers.forEach((h) => h(data));
      } catch {
        // ignore malformed messages
      }
    };

    this.socket.onerror = () => {
      // onclose will trigger reconnect
    };

    this.socket.onclose = () => {
      this.clearTimers();
      this.disconnectHandlers.forEach((h) => h());

      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      if (!this.hasNotifiedReconnectExhausted) {
        this.hasNotifiedReconnectExhausted = true;
        this.reconnectExhaustedHandlers.forEach((h) => h());
      }
      return;
    }

    const delay = Math.min(
      RECONNECT_DELAY_BASE_MS * 2 ** this.reconnectAttempts,
      RECONNECT_DELAY_MAX_MS
    );
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      if (this.shouldReconnect) {
        this.openSocket();
      }
    }, delay);
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: "ping" }));
      }
    }, PING_INTERVAL_MS);
  }

  private clearTimers(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private getToken(): string | null {
    if (typeof window === "undefined") return null;
    const tokenFromCookie = document.cookie
      .split("; ")
      .find((cookie) => cookie.startsWith("access_token="))
      ?.split("=")[1];
    if (tokenFromCookie) return tokenFromCookie;
    try {
      const stored = localStorage.getItem("auth-storage");
      if (!stored) return null;
      const parsed = JSON.parse(stored) as {
        state?: { accessToken?: string };
      };
      return parsed?.state?.accessToken ?? null;
    } catch (error) {
      console.error("Failed to parse auth-storage for websocket token", error);
      return null;
    }
  }
}

/** Singleton instance shared across the app */
export const wsManager = new WebSocketManager();
