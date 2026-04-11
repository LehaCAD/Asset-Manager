'use client'

import { useEffect } from 'react'
import { useFeedbackStore } from '@/lib/store/feedback'
import { ChatMessageList } from './ChatMessageList'
import { ChatInput } from './ChatInput'
import { Badge } from '@/components/ui/badge'

export function FeedbackChat() {
  const {
    conversation, messages, isLoading,
    loadConversation, loadMessages, sendMessage, uploadAttachment,
    connectWS, disconnectWS, markAsRead,
  } = useFeedbackStore()

  useEffect(() => {
    const init = async () => {
      await loadConversation()
      await loadMessages()
      connectWS()
      markAsRead()
    }
    init()
    return () => disconnectWS()
  }, [])

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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {!conversation && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-muted-foreground">
              Нашли баг? Есть идея? Напишите — мы читаем каждое сообщение.
            </p>
          </div>
        )}
        <ChatMessageList messages={messages} isOwnMessage={(m) => !m.is_admin} />
      </div>

      {/* Input */}
      <div className="border-t border-border/50 px-4 py-3">
        <ChatInput
          onSend={handleSend}
          onAttachment={handleAttachment}
          placeholder="Написать сообщение..."
        />
      </div>
    </div>
  )
}
