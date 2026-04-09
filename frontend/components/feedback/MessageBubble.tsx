'use client'

import { formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'
import type { FeedbackMessage } from '@/lib/types'
import { AttachmentPreview } from './AttachmentPreview'

interface MessageBubbleProps {
  message: FeedbackMessage
  isOwnMessage: boolean // true = own message (darker blue bubble), false = other (surface bubble)
  showAvatar?: boolean
}

export function MessageBubble({ message, isOwnMessage, showAvatar = true }: MessageBubbleProps) {
  // System messages (start with ⚡) handled by SystemMessage component, not here

  const bubbleCorners = showAvatar
    ? 'rounded-tl-[4px] rounded-tr-xl rounded-br-xl rounded-bl-xl'
    : 'rounded-xl'

  return (
    <div className="flex gap-2 items-end">
      {/* Avatar or spacer */}
      {showAvatar ? (
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
          message.is_admin ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
        }`}>
          {message.sender_name?.charAt(0).toUpperCase() || '?'}
        </div>
      ) : (
        <div className="flex-shrink-0 w-8" />
      )}

      {/* Bubble */}
      <div className="max-w-[75%] flex flex-col items-start">
        <div className={`px-3 py-2 text-sm ${bubbleCorners} ${
          isOwnMessage ? 'bg-[#1A2744]' : 'bg-[#1E293B]'
        }`}>
          {message.text && <p className="whitespace-pre-wrap break-words text-foreground">{message.text}</p>}

          {message.attachments.length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5">
              {message.attachments.map((att) => (
                <AttachmentPreview key={att.id} attachment={att} />
              ))}
            </div>
          )}

          <p className="text-[10px] text-muted-foreground text-right mt-1">
            {formatDistanceToNow(new Date(message.created_at), { addSuffix: true, locale: ru })}
          </p>
        </div>
      </div>
    </div>
  )
}
