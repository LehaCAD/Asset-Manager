// frontend/lib/store/feedback-admin.ts
import { create } from 'zustand'
import { feedbackApi } from '@/lib/api/feedback'
import { FeedbackWSManager } from '@/lib/api/feedback-ws'
import type { AdminConversation, FeedbackMessage } from '@/lib/types'

const adminFeedbackWS = new FeedbackWSManager()

interface FeedbackAdminState {
  conversations: AdminConversation[]
  activeConversation: AdminConversation | null
  messages: FeedbackMessage[]
  filters: { status?: string; tag?: string; search?: string }
  isLoading: boolean
  totalUnread: number
  _pollInterval: ReturnType<typeof setInterval> | null

  loadConversations: () => Promise<void>
  selectConversation: (id: number) => Promise<void>
  sendReply: (text: string) => Promise<FeedbackMessage | null>
  updateConversation: (id: number, data: { status?: string; tag?: string }) => Promise<void>
  grantReward: (id: number, amount: number, comment: string) => Promise<void>
  setFilters: (filtersOrUpdater: { status?: string; tag?: string; search?: string } | ((prev: { status?: string; tag?: string; search?: string }) => { status?: string; tag?: string; search?: string })) => void
  connectWS: (conversationId: number) => void
  disconnectWS: () => void
  startPolling: () => void
  stopPolling: () => void
  uploadAttachment: (messageId: number, file: File) => Promise<void>
}

export const useFeedbackAdminStore = create<FeedbackAdminState>((set, get) => {
  let wsUnsub: (() => void) | null = null

  return {
    conversations: [],
    activeConversation: null,
    messages: [],
    filters: {},
    isLoading: false,
    totalUnread: 0,
    _pollInterval: null,

    loadConversations: async () => {
      set({ isLoading: true })
      try {
        const convs = await feedbackApi.getConversations(get().filters)
        const totalUnread = convs.reduce((sum, c) => sum + c.unread_by_admin, 0)
        set({ conversations: convs, totalUnread })
        // Auto-select first conversation if none active
        if (convs.length > 0 && !get().activeConversation) {
          await get().selectConversation(convs[0].id)
        }
      } finally {
        set({ isLoading: false })
      }
    },

    selectConversation: async (id) => {
      const conv = get().conversations.find((c) => c.id === id) || null
      set({ activeConversation: conv })

      if (conv) {
        const msgs = await feedbackApi.getConversationMessages(id)
        set({ messages: msgs })
        await feedbackApi.adminMarkRead(id)
        // Clear unread badge locally — no need to reload the full list
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, unread_by_admin: 0 } : c,
          ),
        }))
        get().connectWS(id)
      }
    },

    sendReply: async (text) => {
      const conv = get().activeConversation
      if (!conv) return null
      const msg = await feedbackApi.sendAdminReply(conv.id, text)
      set((s) => ({ messages: [...s.messages, msg] }))
      return msg
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
      const msgs = await feedbackApi.getConversationMessages(id)
      set({ messages: msgs })
      get().loadConversations()
    },

    setFilters: (filtersOrUpdater) => {
      const next =
        typeof filtersOrUpdater === 'function'
          ? filtersOrUpdater(get().filters)
          : filtersOrUpdater
      set({ filters: next })
      get().loadConversations()
    },

    connectWS: (conversationId) => {
      wsUnsub?.()
      adminFeedbackWS.disconnect()

      adminFeedbackWS.connect(conversationId)
      wsUnsub = adminFeedbackWS.on((event) => {
        if (event.type === 'new_message' || event.type === 'reward_granted') {
          const msg = 'message' in event ? event.message : null
          if (msg) set((s) => {
            if (s.messages.some((m) => m.id === msg.id)) return s
            return { messages: [...s.messages, msg] }
          })
          // Increment unread badge for conversations that are not currently open
          if (event.type === 'new_message' && !event.message.is_admin) {
            // If this conversation is currently active, mark as read immediately
            if (get().activeConversation?.id === conversationId) {
              feedbackApi.adminMarkRead(conversationId)
              set((s) => ({
                conversations: s.conversations.map((c) =>
                  c.id === conversationId ? { ...c, unread_by_admin: 0 } : c,
                ),
              }))
            } else {
              set((s) => ({
                conversations: s.conversations.map((c) =>
                  c.id === conversationId
                    ? { ...c, unread_by_admin: c.unread_by_admin + 1 }
                    : c,
                ),
              }))
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
      })
    },

    disconnectWS: () => {
      wsUnsub?.()
      adminFeedbackWS.disconnect()
    },

    startPolling: () => {
      const interval = setInterval(() => get().loadConversations(), 30000)
      set({ _pollInterval: interval as unknown as ReturnType<typeof setInterval> })
    },
    stopPolling: () => {
      const interval = get()._pollInterval
      if (interval) clearInterval(interval)
      set({ _pollInterval: null })
    },
    uploadAttachment: async (messageId, file) => {
      const presign = await feedbackApi.adminPresignAttachment(messageId, file.name, file.type)
      await fetch(presign.upload_url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      await feedbackApi.adminConfirmAttachment(
        messageId, presign.file_key, file.name, file.size, file.type,
      )
    },
  }
})
