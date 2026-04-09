'use client'

import { useState, useEffect, useRef } from 'react'
import { Send } from 'lucide-react'
import Link from 'next/link'
import { useFeedbackStore } from '@/lib/store/feedback'
import { MessageBubble } from './MessageBubble'
import { SystemMessage } from './SystemMessage'
import { Button } from '@/components/ui/button'

export function FeedbackDropdown() {
  const { conversation, messages, isLoading, loadConversation, loadMessages, sendMessage, connectWS, disconnectWS, markAsRead } = useFeedbackStore()
  const [text, setText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    const trimmed = text.trim()
    if (!trimmed || isSending) return
    setIsSending(true)
    setText('')
    await sendMessage(trimmed)
    setIsSending(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const lastMessages = messages.slice(-5)

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b">
        <h3 className="text-sm font-semibold">Связаться с нами</h3>
      </div>

      {/* Messages area */}
      <div className="max-h-[300px] overflow-y-auto px-3 py-2 space-y-3">
        {lastMessages.length === 0 && !isLoading && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Нашли баг? Есть идея? Напишите — мы читаем каждое сообщение.
          </p>
        )}

        {lastMessages.map((msg, index) => {
          const prevMsg = index > 0 ? lastMessages[index - 1] : null
          const showAvatar = !prevMsg || prevMsg.is_admin !== msg.is_admin
          return (msg.text.startsWith('[SYS]') || msg.text.startsWith('⚡')) ? (
            <SystemMessage key={msg.id} text={msg.text} createdAt={msg.created_at} />
          ) : (
            <MessageBubble key={msg.id} message={msg} isOwnMessage={!msg.is_admin} showAvatar={showAvatar} />
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t px-3 py-2">
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Написать сообщение..."
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-foreground border border-border/50 rounded-lg outline-none focus:border-primary/50 placeholder:text-muted-foreground min-h-[36px] max-h-[80px] px-3 py-2 transition-colors"
          />
          <Button
            size="icon"
            variant="ghost"
            onClick={handleSend}
            disabled={!text.trim() || isSending}
            className="h-8 w-8 shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">Вложения хранятся 90 дней</p>
      </div>

      {/* Footer */}
      <div className="border-t px-3 py-2">
        <Link
          href="/cabinet/feedback"
          className="text-xs text-primary hover:underline"
        >
          Перейти к полной переписке →
        </Link>
      </div>
    </div>
  )
}
