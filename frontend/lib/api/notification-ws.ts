import { WS_BASE_URL } from "@/lib/utils/constants";
import { logger } from "@/lib/utils/logger";
import type { WSNewNotificationEvent, WSOnboardingTaskCompletedEvent } from "@/lib/types";

type NotificationHandler = (event: WSNewNotificationEvent) => void;

const RECONNECT_DELAY_BASE_MS = 1_000;
const RECONNECT_DELAY_MAX_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 10;

class NotificationWSManager {
  private ws: WebSocket | null = null;
  private handlers = new Set<NotificationHandler>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const token = this.getToken();
    if (!token) return;

    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    this.openSocket(token);
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  on(handler: NotificationHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private openSocket(token: string): void {
    this.ws = new WebSocket(
      `${WS_BASE_URL}/ws/notifications/?token=${token}`
    );

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as { type: string };
        if (data.type === "new_notification") {
          const notifData = data as WSNewNotificationEvent;
          this.handlers.forEach((h) => h(notifData));
        } else if (data.type === "onboarding_task_completed") {
          const onboardingData = data as unknown as WSOnboardingTaskCompletedEvent;
          void Promise.all([
            import("@/lib/store/onboarding"),
            import("@/lib/store/credits"),
            import("@/components/onboarding/AchievementToast"),
          ]).then(([{ useOnboardingStore }, { useCreditsStore }, { showAchievementToast }]) => {
            const taskIcon = useOnboardingStore.getState().tasks.find(
              (t) => t.code === onboardingData.task_code
            )?.icon ?? "trophy";
            useOnboardingStore.getState().handleTaskCompleted(onboardingData);
            useCreditsStore.getState().loadBalance();
            showAchievementToast({
              taskTitle: onboardingData.task_title,
              taskIcon,
              reward: onboardingData.reward,
              completedCount: onboardingData.completed_count,
              totalCount: onboardingData.total_count,
            });
          });
        } else if (data.type === "credits_changed") {
          const payload = data as { type: "credits_changed"; balance?: string };
          void import("@/lib/store/credits").then(({ useCreditsStore }) => {
            if (payload.balance) {
              useCreditsStore.setState({ balance: payload.balance });
            } else {
              useCreditsStore.getState().loadBalance();
            }
          });
        } else if (data.type === "subscription_changed") {
          // Re-fetch user data to update subscription store
          void Promise.all([
            import("@/lib/api/auth"),
            import("@/lib/store/auth"),
            import("sonner"),
          ]).then(([{ authApi }, { useAuthStore }, { toast }]) => {
            authApi.getMe().then((me) => {
              useAuthStore.getState().setUser(me);
              toast.success(`Тариф обновлён: ${(data as { plan_name?: string }).plan_name ?? ""}`);
            }).catch((err) => logger.warn("notification_ws.refresh_me_failed", { cause: err }));
          });
        }
      } catch {
        // ignore malformed messages
      }
    };

    this.ws.onerror = () => {
      // onclose will trigger reconnect
    };

    this.ws.onclose = () => {
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;

    const delay = Math.min(
      RECONNECT_DELAY_BASE_MS * 2 ** this.reconnectAttempts,
      RECONNECT_DELAY_MAX_MS
    );
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      if (!this.shouldReconnect) return;
      const token = this.getToken();
      if (token) this.openSocket(token);
    }, delay);
  }

  private clearReconnectTimer(): void {
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
      console.error(
        "Failed to parse auth-storage for notification websocket token",
        error
      );
      return null;
    }
  }
}

/** Singleton instance shared across the app */
export const notificationWS = new NotificationWSManager();
