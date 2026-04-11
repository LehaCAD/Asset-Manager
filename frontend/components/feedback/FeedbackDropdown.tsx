'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useFeedbackStore } from '@/lib/store/feedback'
import { ChatMessageList } from './ChatMessageList'
import { ChatInput } from './ChatInput'

const PAGE_SIZE = 30

export function FeedbackDropdown() {
  const {
    conversation, messages, isLoading,
    loadConversation, loadMessages, sendMessage, uploadAttachment,
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

  const handleSend = async (text: string) => {
    await sendMessage(text)
  }

  const handleAttachment = async (file: File) => {
    let msg = messages[messages.length - 1]
    if (!msg || msg.is_admin) {
      const newMsg = await sendMessage('')
      if (!newMsg) throw new Error('Не удалось создать сообщение')
      msg = newMsg
    }
    await uploadAttachment(msg.id, file)
  }

  return (
    <div className="flex flex-col">
      {/* Header — changed from "Связаться с нами" */}
      <div className="px-4 py-3 border-b">
        <h3 className="text-sm font-semibold">Чат поддержки</h3>
      </div>

      {/* Messages — ChatMessageList owns scroll, max-h applied via className */}
      {messages.length === 0 && !isLoading ? (
        <div className="px-3 py-2">
          <p className="text-sm text-muted-foreground text-center py-4">
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
          className="max-h-[400px]"
        />
      )}

      {/* Input — now with attachments */}
      <div className="border-t px-3 py-2">
        <ChatInput
          onSend={handleSend}
          onAttachment={handleAttachment}
        />
      </div>

      {/* Footer */}
      <div className="border-t px-3 py-2">
        <Link href="/cabinet/feedback" className="text-xs text-primary hover:underline">
          Перейти к полной переписке →
        </Link>
      </div>
    </div>
  )
}
