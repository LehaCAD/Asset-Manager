// frontend/lib/store/feedback.ts
import { create } from 'zustand'
import { feedbackApi } from '@/lib/api/feedback'
import { feedbackWS } from '@/lib/api/feedback-ws'
import type { FeedbackConversation, FeedbackMessage } from '@/lib/types'

interface FeedbackState {
  conversation: FeedbackConversation | null
  messages: FeedbackMessage[]
  hasUnreadReply: boolean
  isLoading: boolean
  wsConnected: boolean
  typingIndicator: boolean
  _typingTimeout: ReturnType<typeof setTimeout> | null

  loadConversation: () => Promise<void>
  loadMessages: (cursor?: number) => Promise<FeedbackMessage[]>
  sendMessage: (text: string) => Promise<FeedbackMessage | null>
  uploadAttachment: (messageId: number, file: File) => Promise<void>
  markAsRead: () => Promise<void>
  connectWS: () => void
  disconnectWS: () => void
  checkUnread: () => Promise<void>
}

export const useFeedbackStore = create<FeedbackState>((set, get) => {
  let wsUnsub: (() => void) | null = null

  return {
    conversation: null,
    messages: [],
    hasUnreadReply: false,
    isLoading: false,
    wsConnected: false,
    typingIndicator: false,
    _typingTimeout: null,

    loadConversation: async () => {
      try {
        const conv = await feedbackApi.getConversation()
        set({ conversation: conv, hasUnreadReply: conv.unread_count > 0 })
      } catch {
        set({ conversation: null })
      }
    },

    loadMessages: async (cursor) => {
      const conv = get().conversation
      if (!conv) return []
      set({ isLoading: true })
      try {
        const msgs = await feedbackApi.getAllMessages(cursor)
        set((s) => ({
          messages: cursor ? [...msgs, ...s.messages] : msgs,
        }))
        return msgs
      } catch {
        return []
      } finally {
        set({ isLoading: false })
      }
    },

    sendMessage: async (text) => {
      try {
        const prevConvId = get().conversation?.id
        const wasClosed = get().conversation && !get().conversation?.can_reply

        // sendMessage POST — backend auto-creates new conversation if needed
        const msg = await feedbackApi.sendMessage(text)

        // Reload conversation state
        await get().loadConversation()
        const newConvId = get().conversation?.id

        const conversationChanged = prevConvId !== newConvId || wasClosed || !prevConvId

        if (conversationChanged) {
          // New conversation created — full reload: reconnect WS + reload all messages
          get().disconnectWS()
          get().connectWS()
          // Reload unified stream to get proper conversation_id boundaries
          await get().loadMessages()
        } else {
          // Same conversation — just append the new message
          set((s) => {
            if (s.messages.some((m) => m.id === msg.id)) return s
            return { messages: [...s.messages, msg] }
          })
        }

        return msg
      } catch {
        return null
      }
    },

    uploadAttachment: async (messageId, file) => {
      const presign = await feedbackApi.presignAttachment(messageId, file.name, file.type)
      // Use XHR instead of fetch — fetch fails on CORS with S3 presigned URLs
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', presign.upload_url)
        xhr.setRequestHeader('Content-Type', file.type)
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`Ошибка загрузки: ${xhr.status}`))
        }
        xhr.onerror = () => reject(new Error('Не удалось загрузить файл'))
        xhr.send(file)
      })
      await feedbackApi.confirmAttachment(
        messageId, presign.file_key, file.name, file.size, file.type,
      )
      // No optimistic update here — the WS attachment_ready event will carry the real attachment with URL
    },

    markAsRead: async () => {
      await feedbackApi.markRead()
      set({ hasUnreadReply: false })
    },

    connectWS: () => {
      const conv = get().conversation
      if (!conv || get().wsConnected) return
      wsUnsub?.()
      feedbackWS.connect(conv.id)
      wsUnsub = feedbackWS.on((event) => {
        if (event.type === 'new_message' || event.type === 'reward_granted') {
          const msg = 'message' in event ? event.message : null
          if (msg) {
            set((s) => {
              if (s.messages.some((m) => m.id === msg.id)) return s
              return {
                messages: [...s.messages, msg],
                // Don't set hasUnreadReply — we auto-mark as read below
              }
            })
            // Auto mark-as-read since chat is open (WS connected = chat visible)
            if (msg.is_admin) {
              get().markAsRead()
              // Clear typing indicator — admin finished typing
              const prev = get()._typingTimeout
              if (prev) clearTimeout(prev)
              set({ typingIndicator: false, _typingTimeout: null })
            }
          }
        }
        if (event.type === 'attachment_ready') {
          set((s) => ({
            messages: s.messages.map((m) => {
              if (m.id !== event.message_id) return m
              if (m.attachments.some((a) => a.id === event.attachment.id)) return m
              return { ...m, attachments: [...m.attachments, event.attachment] }
            }),
          }))
        }
        if (event.type === 'conversation_updated') {
          set((s) => ({
            conversation: s.conversation
              ? {
                  ...s.conversation,
                  status: event.status as 'open' | 'closed',
                  tag: event.tag as '' | 'bug' | 'question' | 'idea',
                  can_reply: event.status !== 'closed',
                }
              : null,
          }))
        }
        if (event.type === 'message_edited') {
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === event.message.id ? event.message : m
            ),
          }))
        }
        if (event.type === 'message_deleted') {
          set((s) => ({
            messages: s.messages.filter((m) => m.id !== event.message_id),
          }))
        }
        if (event.type === 'typing') {
          if (event.is_admin) {
            const prev = get()._typingTimeout
            if (prev) clearTimeout(prev)
            const timeout = setTimeout(() => set({ typingIndicator: false }), 10_000)
            set({ typingIndicator: true, _typingTimeout: timeout })
          }
        }
      })
      set({ wsConnected: true })
    },

    disconnectWS: () => {
      wsUnsub?.()
      feedbackWS.disconnect()
      const timeout = get()._typingTimeout
      if (timeout) clearTimeout(timeout)
      set({ wsConnected: false, typingIndicator: false, _typingTimeout: null })
    },

    checkUnread: async () => {
      try {
        const conv = await feedbackApi.getConversation()
        set({ hasUnreadReply: conv.unread_count > 0 })
      } catch {
        // no conversation yet
      }
    },
  }
})
