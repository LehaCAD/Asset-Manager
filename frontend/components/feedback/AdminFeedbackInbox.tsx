'use client'

import { useEffect } from 'react'
import { useFeedbackAdminStore } from '@/lib/store/feedback-admin'
import { ConversationList } from './ConversationList'
import { AdminChatPanel } from './AdminChatPanel'

export function AdminFeedbackInbox() {
  const disconnectWS = useFeedbackAdminStore((s) => s.disconnectWS)

  useEffect(() => {
    return () => disconnectWS()
  }, [disconnectWS])

  return (
    <div className="flex h-[calc(100vh-64px)]">
      <ConversationList />
      <AdminChatPanel />
    </div>
  )
}
