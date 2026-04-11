'use client'

import { useState, useRef, useCallback } from 'react'
import { Send, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

interface ChatInputProps {
  onSend: (text: string) => Promise<void>
  onAttachment?: (file: File) => Promise<void>
  placeholder?: string
  showAttachButton?: boolean
}

export function ChatInput({
  onSend,
  onAttachment,
  placeholder = 'Сообщение...',
  showAttachButton = true,
}: ChatInputProps) {
  const [text, setText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetTextareaHeight = useCallback(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = '36px'
    }
  }, [])

  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [])

  const handleSend = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed || isSending) return

    setIsSending(true)
    setText('')
    resetTextareaHeight()

    try {
      await onSend(trimmed)
    } finally {
      setIsSending(false)
    }
  }, [text, isSending, onSend, resetTextareaHeight])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const validateFile = useCallback((file: File): boolean => {
    const isAllowedType = ALLOWED_TYPES.includes(file.type) || file.type.startsWith('image/')
    if (!isAllowedType) {
      toast.error(`Тип файла не поддерживается: ${file.name}`)
      return false
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`Файл слишком большой (макс. 10 МБ): ${file.name}`)
      return false
    }
    return true
  }, [])

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (!onAttachment) return
      const items = e.clipboardData.items
      for (const item of Array.from(items)) {
        if (item.kind === 'file') {
          const file = item.getAsFile()
          if (file && validateFile(file)) {
            e.preventDefault()
            onAttachment(file)
          }
        }
      }
    },
    [onAttachment, validateFile],
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!onAttachment) return
      const files = e.target.files
      if (!files?.length) return

      for (const file of Array.from(files)) {
        if (validateFile(file)) {
          onAttachment(file)
        }
      }
      e.target.value = ''
    },
    [onAttachment, validateFile],
  )

  return (
    <div className="flex items-end gap-2">
      {showAttachButton && onAttachment && (
        <>
          <button
            type="button"
            className="h-9 w-9 shrink-0 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf,image/*"
            className="hidden"
            onChange={handleFileSelect}
          />
        </>
      )}

      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={placeholder}
        rows={1}
        className="flex-1 resize-none bg-muted/30 text-foreground rounded-lg text-sm border border-border/50 outline-none focus:border-primary/50 placeholder:text-muted-foreground min-h-9 max-h-[120px] px-3 py-2 transition-colors overflow-y-auto"
      />

      <Button
        size="icon"
        onClick={handleSend}
        disabled={!text.trim() || isSending}
        className="h-9 w-9 shrink-0 rounded-lg bg-primary hover:bg-primary/90"
      >
        <Send className="w-4 h-4" />
      </Button>
    </div>
  )
}
