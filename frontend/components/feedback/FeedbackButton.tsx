'use client'

import { useEffect } from 'react'
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
        <button
          className="relative inline-flex items-center h-9 px-3 rounded-full text-xs font-medium bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors"
          aria-label="Чат поддержки"
        >
          Чат поддержки
          {hasUnreadReply && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-background" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="p-0 w-[360px] max-sm:w-screen max-sm:max-w-none max-sm:h-[50vh] max-sm:rounded-none max-sm:border-x-0 max-sm:border-b-0"
      >
        <FeedbackDropdown />
      </PopoverContent>
    </Popover>
  )
}
