'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useFeedbackStore, type PendingAttachment } from '@/lib/store/feedback'
import { ChatMessageList } from './ChatMessageList'
import { ChatInput } from './ChatInput'

const PAGE_SIZE = 30

export function FeedbackDropdown() {
  const {
    conversation, messages, isLoading,
    loadConversation, loadMessages, sendMessage, uploadDraftAttachment,
    connectWS, disconnectWS, markAsRead,
  } = useFeedbackStore()
  const [hasMore, setHasMore] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  useEffect(() => {
    const init = async () => {
      await loadConversation()
      const loaded = await loadMessages()
      if (loaded.length < PAGE_SIZE) setHasMore(false)
      connectWS()
      markAsRead()
    }
    init()
    return () => disconnectWS()
  }, [])

  const loadOlder = useCallback(async () => {
    if (isLoadingMore || !messages.length) return
    setIsLoadingMore(true)
    try {
      const loaded = await loadMessages(messages[0].id)
      if (loaded.length < PAGE_SIZE) setHasMore(false)
    } finally {
      setIsLoadingMore(false)
    }
  }, [isLoadingMore, messages, loadMessages])

  const handleSend = async (text: string, attachments?: PendingAttachment[]) => {
    await sendMessage(text || '', attachments)
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-popover">
      {/* Header */}
      <div className="px-4 py-3 border-b shrink-0">
        <h3 className="text-sm font-semibold">Чат поддержки</h3>
      </div>

      {/* Messages — flex-1 fills remaining space, own scroll */}
      <div className="flex-1 min-h-0 flex flex-col">
        {messages.length === 0 && !isLoading ? (
          <div className="px-3 py-2 flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground text-center px-4">
              Нашли баг? Есть идея? Напишите — мы читаем каждое сообщение.
            </p>
          </div>
        ) : (
          <ChatMessageList
            messages={messages}
            isOwnMessage={(m) => !m.is_admin}
            onLoadMore={loadOlder}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            className="flex-1 min-h-0 sm:max-h-[400px]"
          />
        )}
      </div>

      {/* Closed conversation notice */}
      {conversation && !conversation.can_reply && (
        <div className="px-3 py-2 text-center text-xs text-muted-foreground bg-muted/30 shrink-0">
          Обращение закрыто. Напишите, чтобы начать новый диалог.
        </div>
      )}

      {/* Input — now with attachments */}
      <div className="border-t px-3 py-2 shrink-0 bg-popover">
        <ChatInput onSend={handleSend} onUploadFile={uploadDraftAttachment} />
      </div>

      {/* Footer */}
      <div className="border-t px-3 py-2 shrink-0 bg-popover">
        <Link
          href="/cabinet/feedback"
          target="_blank"
          rel="noopener"
          className="text-xs text-primary hover:underline"
        >
          Перейти к полной переписке →
        </Link>
      </div>
    </div>
  )
}
