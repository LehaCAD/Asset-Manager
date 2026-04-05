import { MessageCircle, CheckCircle2, XCircle, ThumbsUp, Upload } from 'lucide-react'
import type { NotificationType } from '@/lib/types'

const ICON_CONFIG: Record<NotificationType, { icon: React.ElementType; colorClass: string }> = {
  comment_new: { icon: MessageCircle, colorClass: 'text-primary bg-primary/10' },
  reaction_new: { icon: ThumbsUp, colorClass: 'text-primary bg-primary/10' },
  generation_completed: { icon: CheckCircle2, colorClass: 'text-success bg-success/10' },
  generation_failed: { icon: XCircle, colorClass: 'text-destructive bg-destructive/10' },
  upload_completed: { icon: Upload, colorClass: 'text-success bg-success/10' },
}

interface NotificationIconProps {
  type: NotificationType
  size?: 'sm' | 'md'
}

export function NotificationIcon({ type, size = 'md' }: NotificationIconProps) {
  const config = ICON_CONFIG[type]
  if (!config) return null

  const Icon = config.icon
  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'

  if (size === 'sm') {
    return <Icon className={`${iconSize} shrink-0 ${config.colorClass.split(' ')[0]}`} strokeWidth={1.75} />
  }

  return (
    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${config.colorClass}`}>
      <Icon className={iconSize} />
    </div>
  )
}
