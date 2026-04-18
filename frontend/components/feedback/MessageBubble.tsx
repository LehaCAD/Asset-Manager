'use client'

import type { FeedbackMessage } from '@/lib/types'
import { AttachmentPreview } from './AttachmentPreview'
import { cn } from '@/lib/utils'

/* ── Types ─────────────────────────────────────────────────── */

export type BubblePosition = 'single' | 'first' | 'middle' | 'last'

interface MessageBubbleProps {
  message: FeedbackMessage
  isOwn: boolean        // alignment only, NOT color
  position: BubblePosition
}

/* ── Border-radius ─────────────────────────────────────────── */

/**
 * All radius class strings are written as literals so Tailwind's
 * scanner detects them. No template interpolation.
 *
 * Left-stack: stacking side is left (all messages on md+, other's on narrow).
 * Right-stack: stacking side is right (own messages on narrow only).
 */

// Left-stack: base classes (no responsive prefix)
const leftBase: Record<BubblePosition, string> = {
  single: 'rounded-tl-[15px] rounded-tr-[15px] rounded-br-[15px] rounded-bl-[15px]',
  first:  'rounded-tl-[15px] rounded-tr-[15px] rounded-br-[15px] rounded-bl-[5px]',
  middle: 'rounded-tl-[5px] rounded-tr-[15px] rounded-br-[15px] rounded-bl-[5px]',
  last:   'rounded-tl-[5px] rounded-tr-[15px] rounded-br-[15px] rounded-bl-[15px]',
}

// Right-stack: base classes (narrow screen default for isOwn)
const rightBase: Record<BubblePosition, string> = {
  single: 'rounded-tl-[15px] rounded-tr-[15px] rounded-br-[15px] rounded-bl-[15px]',
  first:  'rounded-tl-[15px] rounded-tr-[15px] rounded-br-[5px] rounded-bl-[15px]',
  middle: 'rounded-tl-[15px] rounded-tr-[5px] rounded-br-[5px] rounded-bl-[15px]',
  last:   'rounded-tl-[15px] rounded-tr-[5px] rounded-br-[15px] rounded-bl-[15px]',
}

// Left-stack: md-prefixed overrides (for isOwn to switch from right→left at md+)
const leftMd: Record<BubblePosition, string> = {
  single: 'md:rounded-tl-[15px] md:rounded-tr-[15px] md:rounded-br-[15px] md:rounded-bl-[15px]',
  first:  'md:rounded-tl-[15px] md:rounded-tr-[15px] md:rounded-br-[15px] md:rounded-bl-[5px]',
  middle: 'md:rounded-tl-[5px] md:rounded-tr-[15px] md:rounded-br-[15px] md:rounded-bl-[5px]',
  last:   'md:rounded-tl-[5px] md:rounded-tr-[15px] md:rounded-br-[15px] md:rounded-bl-[15px]',
}

/**
 * Returns Tailwind border-radius classes.
 *
 * - !isOwn: always left-stack (no responsive switch needed)
 * - isOwn:  narrow = right-stack, md+ = left-stack
 */
function radiusClasses(position: BubblePosition, isOwn: boolean): string {
  if (!isOwn) return leftBase[position]
  // 'single' is identical for both stacks — skip md override
  if (position === 'single') return leftBase[position]
  return `${rightBase[position]} ${leftMd[position]}`
}

/* ── Component ─────────────────────────────────────────────── */

export function MessageBubble({ message, isOwn, position }: MessageBubbleProps) {
  // Color always based on is_admin, never isOwn.
  // admin → brand-tinted (primary/15), user → neutral (muted).
  const bubbleColor = message.is_admin
    ? 'bg-primary/15 border border-primary/20'
    : 'bg-muted border border-border/50'
  const timeColor = 'text-muted-foreground'

  return (
    <div
      className={cn(
        'flex w-full',
        isOwn ? 'justify-end md:justify-start' : 'justify-start',
      )}
    >
      <div
        className={cn(
          'max-w-[80%] px-3 py-1.5 text-sm',
          bubbleColor,
          radiusClasses(position, isOwn),
        )}
      >
        {message.text && (
          <p className="whitespace-pre-wrap break-words text-foreground">
            {message.text}
          </p>
        )}

        {message.attachments.length > 0 && (
          <div className={cn('flex flex-col gap-1.5', message.text && 'mt-2')}>
            {message.attachments.map((att) => (
              <AttachmentPreview key={att.id} attachment={att} />
            ))}
          </div>
        )}

        <p className={cn('text-[10px] text-right mt-0.5', timeColor)}>
          {message.edited_at && (
            <span className="mr-1 opacity-60">изм.</span>
          )}
          {new Date(message.created_at).toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
    </div>
  )
}
