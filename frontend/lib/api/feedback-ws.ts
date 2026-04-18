// frontend/lib/api/feedback-ws.ts
import { WS_BASE_URL } from '@/lib/utils/constants'
import type { FeedbackMessage, FeedbackAttachment } from '@/lib/types'

type FeedbackWSEvent =
  | { type: 'new_message'; message: FeedbackMessage }
  | { type: 'attachment_ready'; message_id: number; attachment: FeedbackAttachment }
  | { type: 'conversation_updated'; status: string; tag: string }
  | { type: 'reward_granted'; amount: string; comment: string; message: FeedbackMessage }
  | { type: 'message_edited'; message: FeedbackMessage }
  | { type: 'message_deleted'; message_id: number }
  | { type: 'typing'; sender_name: string; is_admin: boolean }

type Handler = (event: FeedbackWSEvent) => void

const RECONNECT_DELAY_BASE_MS = 1_000
const RECONNECT_DELAY_MAX_MS = 30_000
const MAX_RECONNECT_ATTEMPTS = 10

export class FeedbackWSManager {
  private ws: WebSocket | null = null
  private handlers = new Set<Handler>()
  private conversationId: number | null = null
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private shouldReconnect = false

  connect(conversationId: number): void {
    this.conversationId = conversationId
    this.shouldReconnect = true
    this.reconnectAttempts = 0
    this._openSocket()
  }

  disconnect(): void {
    this.shouldReconnect = false
    this._clearReconnectTimer()

    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
    this.conversationId = null
  }

  on(handler: Handler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  send(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  private _openSocket(): void {
    if (!this.conversationId) return

    const token = this._getToken()
    if (!token) return

    const url = `${WS_BASE_URL}/ws/feedback/${this.conversationId}/?token=${token}`
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
    }

    this.ws.onmessage = (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data as string) as FeedbackWSEvent
        this.handlers.forEach((h) => h(event))
      } catch {
        // ignore parse errors
      }
    }

    this.ws.onerror = () => {
      // onclose will trigger reconnect
    }

    this.ws.onclose = () => {
      if (this.shouldReconnect) {
        this._scheduleReconnect()
      }
    }
  }

  private _scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return

    const delay = Math.min(
      RECONNECT_DELAY_BASE_MS * 2 ** this.reconnectAttempts,
      RECONNECT_DELAY_MAX_MS,
    )
    this.reconnectAttempts++

    this.reconnectTimer = setTimeout(() => {
      if (!this.shouldReconnect) return
      this._openSocket()
    }, delay)
  }

  private _clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private _getToken(): string | null {
    if (typeof window === 'undefined') return null
    const tokenFromCookie = document.cookie
      .split('; ')
      .find((cookie) => cookie.startsWith('access_token='))
      ?.split('=')[1]
    if (tokenFromCookie) return tokenFromCookie
    try {
      const stored = localStorage.getItem('auth-storage')
      if (!stored) return null
      const parsed = JSON.parse(stored) as { state?: { accessToken?: string } }
      return parsed?.state?.accessToken ?? null
    } catch (error) {
      console.error(
        'Failed to parse auth-storage for feedback websocket token',
        error,
      )
      return null
    }
  }
}

/** Singleton instance shared across the app */
export const feedbackWS = new FeedbackWSManager()
