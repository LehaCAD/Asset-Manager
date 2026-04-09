'use client'

import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'
import { useFeedbackAdminStore } from '@/lib/store/feedback-admin'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { AdminConversation } from '@/lib/types'

const STATUS_FILTERS = [
  { label: 'Все', value: '' },
  { label: 'Открытые', value: 'open' },
  { label: 'Решённые', value: 'resolved' },
]

const TAG_LABELS: Record<string, string> = {
  bug: 'Баг',
  question: 'Вопрос',
  idea: 'Идея',
}

export function ConversationList() {
  const { conversations, activeConversation, filters, loadConversations, selectConversation, setFilters } = useFeedbackAdminStore()
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadConversations()
  }, [])

  const handleSearchChange = (value: string) => {
    setSearch(value)
    // Debounce search
    const timer = setTimeout(() => setFilters({ ...filters, search: value || undefined }), 300)
    return () => clearTimeout(timer)
  }

  const handleStatusFilter = (status: string) => {
    setFilters({ ...filters, status: status || undefined })
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    if (isToday) return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  }

  return (
    <div className="w-[280px] border-r flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Поиск..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
        <div className="flex gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => handleStatusFilter(f.value)}
              className={cn(
                'text-xs px-2 py-1 rounded-full transition-colors',
                (filters.status || '') === f.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {conversations.map((conv) => (
          <button
            key={conv.id}
            onClick={() => selectConversation(conv.id)}
            className={cn(
              'w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-muted/50 transition-colors',
              activeConversation?.id === conv.id && 'bg-muted border-l-2 border-l-primary',
            )}
          >
            <div className="flex items-start gap-2.5">
              {/* Avatar */}
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium text-primary shrink-0">
                {conv.user.username.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium truncate">{conv.user.username}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                    {conv.last_message_preview && formatTime(conv.last_message_preview.created_at)}
                  </span>
                </div>

                {conv.last_message_preview && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {conv.last_message_preview.is_admin && <span className="text-primary">Вы: </span>}
                    {conv.last_message_preview.text}
                  </p>
                )}

                <div className="flex items-center gap-1 mt-1">
                  {conv.tag && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                      {TAG_LABELS[conv.tag] || conv.tag}
                    </Badge>
                  )}
                  {conv.unread_by_admin > 0 && (
                    <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
                      {conv.unread_by_admin}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </button>
        ))}

        {conversations.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Нет обращений</p>
        )}
      </div>
    </div>
  )
}
