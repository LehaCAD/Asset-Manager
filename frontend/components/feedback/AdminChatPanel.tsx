'use client'

import { useState, useEffect, useRef } from 'react'
import { Send, Zap, Check, Tag, ExternalLink } from 'lucide-react'
import { useFeedbackAdminStore } from '@/lib/store/feedback-admin'
import { MessageBubble } from './MessageBubble'
import { SystemMessage } from './SystemMessage'
import { RewardModal } from './RewardModal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const TAG_OPTIONS = [
  { value: '', label: 'Без тега' },
  { value: 'bug', label: 'Баг' },
  { value: 'question', label: 'Вопрос' },
  { value: 'idea', label: 'Идея' },
]

export function AdminChatPanel() {
  const { activeConversation, messages, sendReply, updateConversation, grantReward } = useFeedbackAdminStore()
  const [text, setText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [rewardOpen, setRewardOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (!activeConversation) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Выберите диалог
      </div>
    )
  }

  const conv = activeConversation

  const handleSend = async () => {
    const trimmed = text.trim()
    if (!trimmed || isSending) return
    setIsSending(true)
    setText('')
    await sendReply(trimmed)
    setIsSending(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSend()
    }
  }

  const toggleStatus = () => {
    const newStatus = conv.status === 'open' ? 'resolved' : 'open'
    updateConversation(conv.id, { status: newStatus })
  }

  const setTag = (tag: string) => {
    updateConversation(conv.id, { tag })
  }

  const handleReward = async (amount: number, comment: string) => {
    await grantReward(conv.id, amount, comment)
  }

  // Django admin URL for user
  const adminUserUrl = `/admin/users/user/${conv.user.id}/change/`

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium text-primary">
              {conv.user.username.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{conv.user.username}</span>
                <a
                  href={adminUserUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-primary"
                >
                  <ExternalLink className="w-3 h-3 inline" />
                </a>
              </div>
              <div className="text-xs text-muted-foreground">
                {conv.user.email} · Баланс: {conv.user.balance} Кадров
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setRewardOpen(true)}>
              <Zap className="w-3 h-3" /> Начислить
            </Button>
            <Button
              size="sm"
              variant={conv.status === 'open' ? 'default' : 'outline'}
              className="h-7 text-xs gap-1"
              onClick={toggleStatus}
            >
              <Check className="w-3 h-3" />
              {conv.status === 'open' ? 'Решено' : 'Открыть'}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                  <Tag className="w-3 h-3" /> Тег
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {TAG_OPTIONS.map((opt) => (
                  <DropdownMenuItem key={opt.value} onClick={() => setTag(opt.value)}>
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {conv.tag && (
          <Badge variant="outline" className="text-xs">
            {TAG_OPTIONS.find((t) => t.value === conv.tag)?.label || conv.tag}
          </Badge>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg) =>
          msg.text.startsWith('⚡') ? (
            <SystemMessage key={msg.id} text={msg.text} createdAt={msg.created_at} />
          ) : (
            <MessageBubble key={msg.id} message={msg} isOwnMessage={msg.is_admin} />
          )
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ответить... (Ctrl+Enter — отправить)"
            rows={1}
            className="flex-1 resize-none bg-muted/50 rounded-lg text-sm border-0 outline-none placeholder:text-muted-foreground min-h-[40px] max-h-[120px] px-3 py-2.5"
          />
          <Button size="icon" onClick={handleSend} disabled={!text.trim() || isSending} className="h-9 w-9 shrink-0">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <RewardModal
        open={rewardOpen}
        onOpenChange={setRewardOpen}
        onSubmit={handleReward}
        userName={conv.user.username}
      />
    </div>
  )
}
