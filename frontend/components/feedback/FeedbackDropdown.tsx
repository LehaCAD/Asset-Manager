'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useFeedbackStore } from '@/lib/store/feedback'
import { ChatMessageList } from './ChatMessageList'
import { ChatInput } from './ChatInput'

export function FeedbackDropdown() {
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

  const lastMessages = messages.slice(-15)

  return (
    <div className="flex flex-col">
      {/* Header — changed from "Связаться с нами" */}
      <div className="px-4 py-3 border-b">
        <h3 className="text-sm font-semibold">Чат поддержки</h3>
      </div>

      {/* Messages — increased height */}
      <div className="max-h-[400px] overflow-y-auto px-3 py-2">
        {lastMessages.length === 0 && !isLoading && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Нашли баг? Есть идея? Напишите — мы читаем каждое сообщение.
          </p>
        )}
        <ChatMessageList messages={lastMessages} isOwnMessage={(m) => !m.is_admin} />
      </div>

      {/* Input — now with attachments */}
      <div className="border-t px-3 py-2">
        <ChatInput
          onSend={handleSend}
          onAttachment={handleAttachment}
          placeholder="Написать сообщение..."
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
