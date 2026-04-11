'use client'

import { useEffect } from 'react'
import { MessageCircle } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useFeedbackStore } from '@/lib/store/feedback'
import { FeedbackDropdown } from './FeedbackDropdown'

export function FeedbackButton() {
  const hasUnreadReply = useFeedbackStore((s) => s.hasUnreadReply)
  const checkUnread = useFeedbackStore((s) => s.checkUnread)

  // Check once on mount — no polling.
  // WS connection (via Navbar) updates hasUnreadReply reactively.
  useEffect(() => {
    checkUnread()
  }, [checkUnread])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors">
          <MessageCircle className="w-4 h-4" />
          <span className="hidden sm:inline">Чат поддержки</span>
          {hasUnreadReply && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-background" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="end">
        <FeedbackDropdown />
      </PopoverContent>
    </Popover>
  )
}
