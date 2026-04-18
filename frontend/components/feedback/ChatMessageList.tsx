'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
import type { FeedbackMessage } from '@/lib/types'
import { MessageBubble, type BubblePosition } from './MessageBubble'
import { SystemMessage } from './SystemMessage'

/* ── Types ─────────────────────────────────────────────────── */

interface ChatMessageListProps {
  messages: FeedbackMessage[]
  isOwnMessage: (msg: FeedbackMessage) => boolean
  onLoadMore?: () => void
  hasMore?: boolean
  isLoadingMore?: boolean
  lastReadAt?: string | null
  className?: string
}

/* ── Helpers ───────────────────────────────────────────────── */

const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

const GROUP_WINDOW_MS = 5 * 60 * 1000 // 5 minutes
const NEAR_BOTTOM_THRESHOLD = 150

function isSystemMsg(msg: FeedbackMessage): boolean {
  return msg.text.startsWith('[SYS]') || msg.text.startsWith('\u26A1')
}

/** Telegram-style relative date label in Russian. */
function formatDateLabel(date: Date): string {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86_400_000)

  if (diffDays === 0) return 'Сегодня'
  if (diffDays === 1) return 'Вчера'

  const day = date.getDate()
  const month = MONTHS_GENITIVE[date.getMonth()]

  if (date.getFullYear() === now.getFullYear()) {
    return `${day} ${month}`
  }
  return `${day} ${month} ${date.getFullYear()}`
}

/** Check if two dates are on the same calendar day. */
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/* ── Grouping ──────────────────────────────────────────────── */

interface GroupedMessage {
  msg: FeedbackMessage
  position: BubblePosition
  isSystem: boolean
  showDatePill: boolean
  dateLabel: string
  /** Gap class before this item. */
  gapClass: string
}

function buildGroupedMessages(
  messages: FeedbackMessage[],
): GroupedMessage[] {
  if (messages.length === 0) return []

  // Pass 1: assign each message to a group index.
  // A new group starts when:
  //   - first message
  //   - sender changes (sender_name)
  //   - current or previous message is system
  //   - time gap > 5 minutes
  //   - date changes
  const groupIds: number[] = []
  let currentGroup = 0

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    const prev = i > 0 ? messages[i - 1] : null

    if (i === 0) {
      groupIds.push(currentGroup)
      continue
    }

    const breaksGroup =
      isSystemMsg(msg) ||
      isSystemMsg(prev!) ||
      msg.sender_name !== prev!.sender_name ||
      !isSameDay(new Date(msg.created_at), new Date(prev!.created_at)) ||
      new Date(msg.created_at).getTime() - new Date(prev!.created_at).getTime() > GROUP_WINDOW_MS

    if (breaksGroup) currentGroup++
    groupIds.push(currentGroup)
  }

  // Pass 2: within each group, compute BubblePosition.
  const result: GroupedMessage[] = []

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    const msgDate = new Date(msg.created_at)
    const prevDate = i > 0 ? new Date(messages[i - 1].created_at) : null
    const showDatePill = !prevDate || !isSameDay(msgDate, prevDate)
    const dateLabel = showDatePill ? formatDateLabel(msgDate) : ''
    const system = isSystemMsg(msg)

    // Position within group
    let position: BubblePosition = 'single'
    if (!system) {
      const gid = groupIds[i]
      const prevSameGroup = i > 0 && groupIds[i - 1] === gid
      const nextSameGroup = i < messages.length - 1 && groupIds[i + 1] === gid

      if (prevSameGroup && nextSameGroup) position = 'middle'
      else if (prevSameGroup) position = 'last'
      else if (nextSameGroup) position = 'first'
      else position = 'single'
    }

    // Gap class
    let gapClass = ''
    if (i > 0) {
      if (showDatePill || system || isSystemMsg(messages[i - 1]) || groupIds[i] !== groupIds[i - 1]) {
        gapClass = 'mt-2'
      } else {
        gapClass = 'mt-0.5'
      }
    }

    result.push({ msg, position, isSystem: system, showDatePill, dateLabel, gapClass })
  }

  return result
}

/* ── Component ─────────────────────────────────────────────── */

export function ChatMessageList({
  messages,
  isOwnMessage,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
  lastReadAt,
  className,
}: ChatMessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const unreadSepRef = useRef<HTMLDivElement>(null)

  const [isNearBottom, setIsNearBottom] = useState(true)
  const [newMsgCount, setNewMsgCount] = useState(0)

  const prevMessagesLenRef = useRef(0)
  const prevScrollHeightRef = useRef(0)
  const didInitialScrollRef = useRef(false)

  /* ── Track scroll position ─────────────────────────────── */

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const nearBottom = distanceFromBottom < NEAR_BOTTOM_THRESHOLD
    setIsNearBottom(nearBottom)
    if (nearBottom) setNewMsgCount(0)
  }, [])

  /* ── Smart auto-scroll ─────────────────────────────────── */

  useEffect(() => {
    const isNewMessage = messages.length > prevMessagesLenRef.current
    const isInitialLoad = !didInitialScrollRef.current && messages.length > 0
    const wasPrepend = prevScrollHeightRef.current > 0

    prevMessagesLenRef.current = messages.length

    if (isInitialLoad) {
      didInitialScrollRef.current = true
      // First load — scroll to unread separator or bottom
      requestAnimationFrame(() => {
        if (unreadSepRef.current) {
          unreadSepRef.current.scrollIntoView({ block: 'center' })
        } else {
          bottomRef.current?.scrollIntoView()
        }
      })
      return
    }

    // Preserve scroll position after prepending older messages
    if (wasPrepend) {
      const el = scrollContainerRef.current
      if (el) {
        const addedHeight = el.scrollHeight - prevScrollHeightRef.current
        el.scrollTop += addedHeight
      }
      prevScrollHeightRef.current = 0
      return
    }

    if (isNewMessage && isNearBottom) {
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      })
    } else if (isNewMessage && !isNearBottom) {
      setNewMsgCount((c) => c + 1)
    }
  }, [messages, isNearBottom])

  /* ── Infinite scroll — IntersectionObserver at top ──────── */

  useEffect(() => {
    if (!onLoadMore || !hasMore) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isLoadingMore) {
          // Save scroll height before loading more
          const el = scrollContainerRef.current
          if (el) prevScrollHeightRef.current = el.scrollHeight
          onLoadMore()
        }
      },
      { root: scrollContainerRef.current, threshold: 0.1 },
    )
    if (sentinelRef.current) observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [onLoadMore, hasMore, isLoadingMore])

  /* ── Jump to bottom ────────────────────────────────────── */

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    setNewMsgCount(0)
  }, [])

  /* ── Build items ───────────────────────────────────────── */

  const items = buildGroupedMessages(messages)

  // Pre-compute unread separator position
  const lastReadDate = lastReadAt ? new Date(lastReadAt) : null
  let unreadSepIdx = -1
  if (lastReadDate) {
    for (let i = 0; i < items.length; i++) {
      const msgDate = new Date(items[i].msg.created_at)
      if (msgDate > lastReadDate) {
        // Only show separator if the previous message was at or before lastReadAt
        const prevMsgDate = i > 0 ? new Date(items[i - 1].msg.created_at) : null
        if (!prevMsgDate || prevMsgDate <= lastReadDate) {
          unreadSepIdx = i
        }
        break
      }
    }
  }

  /* ── Render ────────────────────────────────────────────── */

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className={`relative flex-1 overflow-y-auto ${className ?? ''}`}
    >
      <div className="px-4 py-3">
        {/* Sentinel for infinite scroll — sits at top */}
        {hasMore && <div ref={sentinelRef} className="h-1" />}
        {isLoadingMore && (
          <div className="flex justify-center py-2">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Messages */}
        {items.map(({ msg, position, isSystem, showDatePill, dateLabel, gapClass }, idx) => {
          // Detect conversation boundary from conversation_id in unified stream
          const prevConvId = idx > 0 ? items[idx - 1].msg.conversation_id : undefined
          const currConvId = msg.conversation_id
          const showConversationBoundary = prevConvId && currConvId && prevConvId !== currConvId

          return (
          <div key={msg.id} className={gapClass}>
            {/* Conversation boundary pill */}
            {showConversationBoundary && (
              <div className="flex justify-center py-2">
                <span className="bg-primary/20 text-primary text-[11px] font-medium rounded-full px-3 py-0.5">
                  Новое обращение
                </span>
              </div>
            )}

            {/* Unread separator */}
            {idx === unreadSepIdx && (
              <div ref={unreadSepRef} className="flex items-center gap-3 py-2">
                <div className="flex-1 h-px bg-primary/30" />
                <span className="text-[11px] text-primary font-medium px-2">
                  Новые сообщения
                </span>
                <div className="flex-1 h-px bg-primary/30" />
              </div>
            )}

            {showDatePill && (
              <div className="flex justify-center py-1.5">
                <span className="bg-muted text-muted-foreground text-[11px] font-medium rounded-full px-3 py-0.5">
                  {dateLabel}
                </span>
              </div>
            )}

            {isSystem ? (
              <SystemMessage text={msg.text} createdAt={msg.created_at} />
            ) : (
              <MessageBubble
                message={msg}
                isOwn={isOwnMessage(msg)}
                position={position}
              />
            )}
          </div>
          )
        })}

        <div ref={bottomRef} />
      </div>

      {/* Jump to bottom button */}
      {!isNearBottom && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 w-10 h-10 rounded-full bg-muted/90 border border-border/50 flex items-center justify-center shadow-lg hover:bg-muted transition-colors z-10"
        >
          <ChevronDown className="w-5 h-5 text-foreground" />
          {newMsgCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-medium flex items-center justify-center px-1">
              {newMsgCount}
            </span>
          )}
        </button>
      )}
    </div>
  )
}
