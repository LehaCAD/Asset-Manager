'use client'

import { useEffect, useRef } from 'react'
import type { FeedbackMessage } from '@/lib/types'
import { MessageBubble, type BubblePosition } from './MessageBubble'
import { SystemMessage } from './SystemMessage'

/* ── Types ─────────────────────────────────────────────────── */

interface ChatMessageListProps {
  messages: FeedbackMessage[]
  isOwnMessage: (msg: FeedbackMessage) => boolean
}

/* ── Helpers ───────────────────────────────────────────────── */

const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

const GROUP_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

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

export function ChatMessageList({ messages, isOwnMessage }: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const items = buildGroupedMessages(messages)

  return (
    <>
      {items.map(({ msg, position, isSystem, showDatePill, dateLabel, gapClass }) => (
        <div key={msg.id} className={gapClass}>
          {showDatePill && (
            <div className="flex justify-center py-1.5">
              <span className="bg-[#213040]/80 text-white/80 text-[11px] font-medium rounded-full px-3 py-0.5">
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
      ))}
      <div ref={bottomRef} />
    </>
  )
}
