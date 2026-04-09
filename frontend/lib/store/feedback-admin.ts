// frontend/lib/store/feedback-admin.ts
import { create } from 'zustand'
import { feedbackApi } from '@/lib/api/feedback'
import { feedbackWS } from '@/lib/api/feedback-ws'
import type { AdminConversation, FeedbackMessage } from '@/lib/types'

interface FeedbackAdminState {
  conversations: AdminConversation[]
  activeConversation: AdminConversation | null
  messages: FeedbackMessage[]
  filters: { status?: string; tag?: string; search?: string }
  isLoading: boolean

  loadConversations: () => Promise<void>
  selectConversation: (id: number) => Promise<void>
  sendReply: (text: string) => Promise<void>
  updateConversation: (id: number, data: { status?: string; tag?: string }) => Promise<void>
  grantReward: (id: number, amount: number, comment: string) => Promise<void>
  setFilters: (filters: { status?: string; tag?: string; search?: string }) => void
  connectWS: (conversationId: number) => void
  disconnectWS: () => void
}

export const useFeedbackAdminStore = create<FeedbackAdminState>((set, get) => {
  let wsUnsub: (() => void) | null = null

  return {
    conversations: [],
    activeConversation: null,
    messages: [],
    filters: {},
    isLoading: false,

    loadConversations: async () => {
      set({ isLoading: true })
      try {
        const convs = await feedbackApi.getConversations(get().filters)
        set({ conversations: convs })
      } finally {
        set({ isLoading: false })
      }
    },

    selectConversation: async (id) => {
      const conv = get().conversations.find((c) => c.id === id) || null
      set({ activeConversation: conv, messages: [] })

      if (conv) {
        const msgs = await feedbackApi.getConversationMessages(id)
        set({ messages: msgs })
        await feedbackApi.adminMarkRead(id)
        get().connectWS(id)
      }
    },

    sendReply: async (text) => {
      const conv = get().activeConversation
      if (!conv) return
      const msg = await feedbackApi.sendAdminReply(conv.id, text)
      set((s) => ({ messages: [...s.messages, msg] }))
    },

    updateConversation: async (id, data) => {
      const updated = await feedbackApi.updateConversation(id, data)
      set((s) => ({
        conversations: s.conversations.map((c) => (c.id === id ? updated : c)),
        activeConversation: s.activeConversation?.id === id ? updated : s.activeConversation,
      }))
    },

    grantReward: async (id, amount, comment) => {
      await feedbackApi.grantReward(id, amount, comment)
    },

    setFilters: (filters) => {
      set({ filters })
      get().loadConversations()
    },

    connectWS: (conversationId) => {
      wsUnsub?.()
      feedbackWS.disconnect()

      feedbackWS.connect(conversationId)
      wsUnsub = feedbackWS.on((event) => {
        if (event.type === 'new_message' || event.type === 'reward_granted') {
          const msg = 'message' in event ? event.message : null
          if (msg) set((s) => {
            if (s.messages.some((m) => m.id === msg.id)) return s
            return { messages: [...s.messages, msg] }
          })
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
      })
    },

    disconnectWS: () => {
      wsUnsub?.()
      feedbackWS.disconnect()
    },
  }
})
