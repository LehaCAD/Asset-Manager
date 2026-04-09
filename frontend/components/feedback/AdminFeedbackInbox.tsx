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
    <div className="flex flex-1 h-full min-h-0">
      <ConversationList />
      <AdminChatPanel />
    </div>
  )
}
