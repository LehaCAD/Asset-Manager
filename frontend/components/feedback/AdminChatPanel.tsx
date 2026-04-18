'use client'

import { useState, useCallback, useRef } from 'react'
import { Check, Tag, ExternalLink, RotateCcw } from 'lucide-react'
import { useFeedbackAdminStore } from '@/lib/store/feedback-admin'
import { ChatMessageList } from './ChatMessageList'
import { ChatInput } from './ChatInput'
import { RewardModal } from './RewardModal'
import { Button } from '@/components/ui/button'
import { KadrIcon } from '@/components/ui/kadr-icon'
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
  const { activeConversation, messages, sendReply, updateConversation, grantReward, uploadAttachment, loadOlderMessages, sendTyping } = useFeedbackAdminStore()
  const [rewardOpen, setRewardOpen] = useState(false)
  const lastTypingSent = useRef(0)
  const prevConvIdRef = useRef<number | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // Reset hasMore when switching conversations
  const convId = activeConversation?.id ?? null
  if (convId !== prevConvIdRef.current) {
    prevConvIdRef.current = convId
    setHasMore(true)
    setIsLoadingMore(false)
  }

  const loadOlder = useCallback(async () => {
    if (isLoadingMore || !messages.length) return
    setIsLoadingMore(true)
    try {
      const loaded = await loadOlderMessages()
      if (loaded.length < 30) setHasMore(false)
    } finally {
      setIsLoadingMore(false)
    }
  }, [isLoadingMore, messages, loadOlderMessages])

  const handleTyping = useCallback(() => {
    const now = Date.now()
    if (now - lastTypingSent.current > 5000) {
      sendTyping()
      lastTypingSent.current = now
    }
  }, [sendTyping])

  if (!activeConversation) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Выберите диалог
      </div>
    )
  }

  const conv = activeConversation

  const handleSend = async (text: string, files?: File[]) => {
    const msg = await sendReply(text || '')
    if (files?.length && msg) {
      for (const file of files) {
        try { await uploadAttachment(msg.id, file) } catch { /* toast in ChatInput */ }
      }
    }
  }

  const toggleStatus = () => {
    const newStatus = conv.status === 'open' ? 'closed' : 'open'
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
      <div className="px-4 py-3 border-b">
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
                {conv.tag && (
                  <Badge variant="outline" className="text-xs border-border/50">
                    {TAG_OPTIONS.find((t) => t.value === conv.tag)?.label || conv.tag}
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {conv.user.email} · {conv.user.balance} Кадров
              </div>
            </div>
          </div>
          {/* Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 border-border/50" onClick={() => setRewardOpen(true)}>
              <KadrIcon size="xs" /> Начислить
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5 border-border/50"
              onClick={toggleStatus}
            >
              {conv.status === 'open' ? (
                <>
                  <Check className="w-3 h-3" />
                  Закрыть
                </>
              ) : (
                <>
                  <RotateCcw className="w-3 h-3" />
                  Открыть
                </>
              )}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 border-border/50 w-8 p-0">
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
      </div>

      {/* Messages — ChatMessageList owns its own scroll container */}
      <ChatMessageList
        messages={messages}
        isOwnMessage={(m) => m.is_admin}
        onLoadMore={loadOlder}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
      />

      {/* Input */}
      <div className="border-t border-border/50 px-4 py-3">
        <ChatInput onSend={handleSend} onTyping={handleTyping} placeholder="Ответить..." />
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
