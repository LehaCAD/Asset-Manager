'use client'

import { useState, useEffect, useRef } from 'react'
import { Search } from 'lucide-react'
import { useFeedbackAdminStore } from '@/lib/store/feedback-admin'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { AdminConversation } from '@/lib/types'

const STATUS_FILTERS = [
  { label: 'Все', value: '' },
  { label: 'Открытые', value: 'open' },
  { label: 'Закрытые', value: 'closed' },
]

const TAG_LABELS: Record<string, string> = {
  bug: 'Баг',
  question: 'Вопрос',
  idea: 'Идея',
}

export function ConversationList() {
  const { conversations, activeConversation, filters, loadConversations, selectConversation, setFilters } = useFeedbackAdminStore()
  const [search, setSearch] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    loadConversations()
  }, [])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const handleSearchChange = (value: string) => {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setFilters((f) => ({ ...f, search: value || undefined }))
    }, 300)
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
            className="pl-8 h-9 text-sm bg-muted/30 border border-border/50 rounded-lg"
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
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted',
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
              'w-full text-left px-3 py-2.5 border-b border-border/50 transition-colors',
              activeConversation?.id === conv.id
                ? 'bg-[#14213D] border-l-2 border-l-primary/50'
                : 'border-l-2 border-l-transparent hover:bg-muted/30',
            )}
          >
            <div className="flex items-start gap-2.5">
              {/* Avatar */}
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium text-primary shrink-0">
                {conv.user.username.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                {/* Row 1: Name + Tag + Time */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm font-medium truncate">{conv.user.username}</span>
                    {conv.tag && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 shrink-0">
                        {TAG_LABELS[conv.tag] || conv.tag}
                      </Badge>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                    {conv.last_message_preview && formatTime(conv.last_message_preview.created_at)}
                  </span>
                </div>

                {/* Row 2: Preview + Unread badge */}
                <div className="flex items-center justify-between mt-0.5">
                  {conv.last_message_preview ? (
                    <p className="text-xs text-muted-foreground truncate flex-1 min-w-0">
                      {conv.last_message_preview.is_admin && <span className="text-primary">Вы: </span>}
                      {conv.last_message_preview.text}
                    </p>
                  ) : (
                    <span />
                  )}
                  {conv.unread_by_admin > 0 && (
                    <span className="min-w-[20px] h-5 rounded-full bg-primary text-primary-foreground text-[11px] font-medium flex items-center justify-center px-1.5 ml-2 shrink-0">
                      {conv.unread_by_admin > 99 ? '99+' : conv.unread_by_admin}
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
