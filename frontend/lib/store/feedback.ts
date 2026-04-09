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

  loadConversation: () => Promise<void>
  loadMessages: (cursor?: number) => Promise<void>
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
      if (!conv) return
      set({ isLoading: true })
      try {
        const msgs = await feedbackApi.getMessages(cursor)
        set((s) => ({
          messages: cursor ? [...msgs, ...s.messages] : msgs,
        }))
      } finally {
        set({ isLoading: false })
      }
    },

    sendMessage: async (text) => {
      try {
        const msg = await feedbackApi.sendMessage(text)
        if (!get().conversation) {
          await get().loadConversation()
          get().connectWS()
        }
        set((s) => ({ messages: [...s.messages, msg] }))
        return msg
      } catch {
        return null
      }
    },

    uploadAttachment: async (messageId, file) => {
      try {
        const presign = await feedbackApi.presignAttachment(messageId, file.name, file.type)
        await fetch(presign.upload_url, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        })
        await feedbackApi.confirmAttachment(
          messageId, presign.file_key, file.name, file.size, file.type,
        )
        // No optimistic update here — the WS attachment_ready event will carry the real attachment with URL
      } catch (err) {
        throw err
      }
    },

    markAsRead: async () => {
      await feedbackApi.markRead()
      set({ hasUnreadReply: false })
    },

    connectWS: () => {
      const conv = get().conversation
      if (!conv || get().wsConnected) return

      feedbackWS.connect(conv.id)
      wsUnsub = feedbackWS.on((event) => {
        if (event.type === 'new_message' || event.type === 'reward_granted') {
          const msg = 'message' in event ? event.message : null
          if (msg) {
            set((s) => {
              if (s.messages.some((m) => m.id === msg.id)) return s
              return {
                messages: [...s.messages, msg],
                hasUnreadReply: msg.is_admin ? true : s.hasUnreadReply,
              }
            })
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
                  status: event.status as 'open' | 'resolved',
                  tag: event.tag as '' | 'bug' | 'question' | 'idea',
                }
              : null,
          }))
        }
      })
      set({ wsConnected: true })
    },

    disconnectWS: () => {
      wsUnsub?.()
      feedbackWS.disconnect()
      set({ wsConnected: false })
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
