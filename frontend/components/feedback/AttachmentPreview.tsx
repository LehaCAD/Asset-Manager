'use client'

import { FileText, AlertCircle } from 'lucide-react'
import type { FeedbackAttachment } from '@/lib/types'

interface AttachmentPreviewProps {
  attachment: FeedbackAttachment
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}

export function AttachmentPreview({ attachment }: AttachmentPreviewProps) {
  if (attachment.is_expired) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1.5">
        <AlertCircle className="w-3.5 h-3.5" />
        <span>Вложение удалено (срок хранения истёк)</span>
      </div>
    )
  }

  const isImage = attachment.content_type.startsWith('image/')

  if (isImage && attachment.url) {
    return (
      <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="block">
        <img
          src={attachment.url}
          alt={attachment.file_name}
          className="rounded max-w-full max-h-[200px] object-contain cursor-pointer hover:opacity-80 transition-opacity"
        />
        <span className="text-[10px] text-muted-foreground mt-0.5 block">
          {attachment.file_name} · {formatFileSize(attachment.file_size)}
        </span>
      </a>
    )
  }

  // PDF or other file
  return (
    <a
      href={attachment.url || '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5 hover:bg-muted transition-colors"
    >
      <FileText className="w-4 h-4 text-muted-foreground" />
      <div>
        <div className="text-foreground">{attachment.file_name}</div>
        <div className="text-muted-foreground">{formatFileSize(attachment.file_size)}</div>
      </div>
    </a>
  )
}
