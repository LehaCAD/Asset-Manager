'use client'

import { formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'
import type { FeedbackMessage } from '@/lib/types'
import { AttachmentPreview } from './AttachmentPreview'

interface MessageBubbleProps {
  message: FeedbackMessage
  isOwnMessage: boolean // true = right-aligned (user's own or admin's own)
}

export function MessageBubble({ message, isOwnMessage }: MessageBubbleProps) {
  // System messages (start with ⚡) handled by SystemMessage component, not here

  return (
    <div className={`flex gap-2.5 ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar: initials circle */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
        message.is_admin ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
      }`}>
        {message.sender_name?.charAt(0).toUpperCase() || '?'}
      </div>

      {/* Bubble */}
      <div className={`max-w-[75%] flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'}`}>
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-medium text-foreground/70">
            {message.is_admin ? 'Команда' : message.sender_name}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {formatDistanceToNow(new Date(message.created_at), { addSuffix: true, locale: ru })}
          </span>
        </div>

        <div className={`rounded-lg px-3 py-2 text-sm ${
          isOwnMessage
            ? 'bg-primary/20 text-foreground'
            : 'bg-muted text-foreground'
        }`}>
          {message.text && <p className="whitespace-pre-wrap break-words">{message.text}</p>}

          {message.attachments.length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5">
              {message.attachments.map((att) => (
                <AttachmentPreview key={att.id} attachment={att} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
