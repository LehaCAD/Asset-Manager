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
    if (e.key === 'Enter' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
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
      <div className="px-4 py-3 border-b space-y-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-medium text-muted-foreground shrink-0">
              {conv.user.username.charAt(0).toUpperCase()}
            </div>
            {/* User info */}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm text-foreground truncate">{conv.user.username}</span>
                <a href={adminUserUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary shrink-0">
                  <ExternalLink className="w-3 h-3 inline" />
                </a>
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {conv.user.email} · {conv.user.balance} Кадров
              </div>
            </div>
          </div>
          {/* Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 border-border/50" onClick={() => setRewardOpen(true)}>
              <Zap className="w-3 h-3" /> Начислить
            </Button>
            <Button
              size="sm"
              variant={conv.status === 'open' ? 'default' : 'outline'}
              className="h-7 text-xs gap-1.5"
              onClick={toggleStatus}
            >
              <Check className="w-3 h-3" />
              {conv.status === 'open' ? 'Решено' : 'Открыть'}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                  <Tag className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {TAG_OPTIONS.map((opt) => (
                  <DropdownMenuItem key={opt.value} onClick={() => setTag(opt.value)}>
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {/* Tag badge — below header row */}
        {conv.tag && (
          <div className="pt-2">
            <Badge variant="outline" className="text-xs border-border/50">
              {TAG_OPTIONS.find((t) => t.value === conv.tag)?.label || conv.tag}
            </Badge>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg, index) => {
          const prevMsg = index > 0 ? messages[index - 1] : null
          const showAvatar = !prevMsg || prevMsg.is_admin !== msg.is_admin
          const msgDate = new Date(msg.created_at).toLocaleDateString('ru-RU')
          const prevDate = prevMsg ? new Date(prevMsg.created_at).toLocaleDateString('ru-RU') : null
          const showDateSeparator = msgDate !== prevDate

          return (
            <div key={msg.id}>
              {showDateSeparator && (
                <div className="flex items-center gap-3 py-3">
                  <div className="flex-1 h-px bg-border/50" />
                  <span className="text-[10px] text-muted-foreground font-medium px-2">{msgDate}</span>
                  <div className="flex-1 h-px bg-border/50" />
                </div>
              )}
              {msg.text.startsWith('⚡') ? (
                <SystemMessage text={msg.text} createdAt={msg.created_at} />
              ) : (
                <MessageBubble message={msg} isOwnMessage={msg.is_admin} showAvatar={showAvatar} />
              )}
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border/50 px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ответить... (Enter — отправить)"
            rows={1}
            className="flex-1 resize-none bg-muted/30 text-foreground rounded-lg text-sm border border-border/50 outline-none focus:border-primary/50 placeholder:text-muted-foreground min-h-[36px] max-h-[120px] px-3 py-2 transition-colors"
          />
          <Button size="icon" onClick={handleSend} disabled={!text.trim() || isSending} className="h-9 w-9 shrink-0 rounded-lg bg-primary hover:bg-primary/90">
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
