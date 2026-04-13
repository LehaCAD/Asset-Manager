'use client'

import { useEffect, useState, useCallback } from 'react'
import { useFeedbackStore } from '@/lib/store/feedback'
import { ChatMessageList } from './ChatMessageList'
import { ChatInput } from './ChatInput'
import { Badge } from '@/components/ui/badge'

const PAGE_SIZE = 30

export function FeedbackChat() {
  const {
    conversation, messages, isLoading,
    loadConversation, loadMessages, sendMessage, uploadAttachment,
    connectWS, disconnectWS, markAsRead,
  } = useFeedbackStore()
  const typingIndicator = useFeedbackStore((s) => s.typingIndicator)

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

  const handleSend = async (text: string, files?: File[]) => {
    const msg = await sendMessage(text || '')
    if (files?.length && msg) {
      for (const file of files) {
        try { await uploadAttachment(msg.id, file) } catch { /* toast shown by ChatInput */ }
      }
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Обратная связь</h1>
          {conversation && (
            <Badge variant={conversation.status === 'open' ? 'default' : 'secondary'}>
              {conversation.status === 'open' ? 'Открыт' : 'Решён'}
            </Badge>
          )}
        </div>
      </div>

      {/* Messages — ChatMessageList owns its own scroll container */}
      {!conversation && !isLoading ? (
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <p className="text-muted-foreground">
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
          lastReadAt={null}
        />
      )}

      {/* Typing indicator */}
      {typingIndicator && (
        <div className="px-6 pb-1">
          <span className="text-xs text-muted-foreground animate-pulse">
            Поддержка печатает...
          </span>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border/50 px-4 py-3">
        <ChatInput onSend={handleSend} />
      </div>
    </div>
  )
}
