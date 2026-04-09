'use client'

import { formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'

interface SystemMessageProps {
  text: string
  createdAt: string
}

export function SystemMessage({ text, createdAt }: SystemMessageProps) {
  return (
    <div className="flex justify-center py-1">
      <div className="text-xs text-muted-foreground bg-muted/50 rounded-full px-3 py-1 text-center">
        {text}
        <span className="ml-2 text-[10px] opacity-70">
          {formatDistanceToNow(new Date(createdAt), { addSuffix: true, locale: ru })}
        </span>
      </div>
    </div>
  )
}
