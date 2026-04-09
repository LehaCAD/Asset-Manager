'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Paperclip, CheckCircle } from 'lucide-react'
import { useFeedbackStore } from '@/lib/store/feedback'
import { MessageBubble } from './MessageBubble'
import { SystemMessage } from './SystemMessage'
import { AttachmentPreview } from './AttachmentPreview'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

export function FeedbackChat() {
  const {
    conversation, messages, isLoading,
    loadConversation, loadMessages, sendMessage, uploadAttachment,
    connectWS, disconnectWS, markAsRead,
  } = useFeedbackStore()

  const [text, setText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return

    for (const file of Array.from(files)) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(`Тип файла не поддерживается: ${file.name}`)
        continue
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`Файл слишком большой: ${file.name}`)
        continue
      }

      // Need a message to attach to — send one if no recent message
      let msg = messages[messages.length - 1]
      if (!msg || msg.is_admin) {
        const newMsg = await sendMessage('')
        if (!newMsg) {
          toast.error('Не удалось отправить сообщение')
          continue
        }
        msg = newMsg
      }

      try {
        await uploadAttachment(msg.id, file)
      } catch {
        toast.error(`Не удалось загрузить: ${file.name}`)
      }
    }
    e.target.value = ''
  }

  // Group messages by date
  const renderMessages = () => {
    return messages.map((msg, index) => {
      const msgDate = new Date(msg.created_at).toLocaleDateString('ru-RU')
      const prevMsg = index > 0 ? messages[index - 1] : null
      const prevDate = prevMsg ? new Date(prevMsg.created_at).toLocaleDateString('ru-RU') : null
      const showDateSeparator = msgDate !== prevDate

      const isSystemMessage = msg.text.startsWith('⚡')
      const showAvatar = !prevMsg || prevMsg.is_admin !== msg.is_admin

      return (
        <div key={msg.id}>
          {showDateSeparator && (
            <div className="flex items-center gap-3 py-3">
              <div className="flex-1 h-px bg-border/50" />
              <span className="text-[10px] text-muted-foreground font-medium px-2">
                {msgDate}
              </span>
              <div className="flex-1 h-px bg-border/50" />
            </div>
          )}
          {isSystemMessage ? (
            <SystemMessage text={msg.text} createdAt={msg.created_at} />
          ) : (
            <MessageBubble message={msg} isOwnMessage={!msg.is_admin} showAvatar={showAvatar} />
          )}
        </div>
      )
    })
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
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {!conversation && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-muted-foreground">
              Нашли баг? Есть идея? Напишите — мы читаем каждое сообщение.
            </p>
          </div>
        )}

        {renderMessages()}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="border-t border-border/50 px-4 py-3 flex flex-col gap-2">
        <div className="flex items-end gap-2">
          <button
            type="button"
            className="h-9 w-9 shrink-0 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple className="hidden" onChange={handleFileSelect} />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Написать сообщение..."
            rows={1}
            className="flex-1 resize-none bg-muted/30 text-foreground rounded-lg text-sm border border-border/50 outline-none focus:border-primary/50 placeholder:text-muted-foreground min-h-[36px] max-h-[120px] px-3 py-2 transition-colors"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!text.trim() || isSending}
            className="h-9 w-9 shrink-0 rounded-lg bg-primary hover:bg-primary/90"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground pl-11">
          Enter — отправить · Ctrl+Enter / Alt+Enter — новая строка
        </p>
      </div>
    </div>
  )
}
