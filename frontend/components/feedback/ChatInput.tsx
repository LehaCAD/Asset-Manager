'use client'

import { useState, useRef, useCallback } from 'react'
import { ArrowUp, Paperclip, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

interface StagedFile {
  file: File
  previewUrl: string | null // blob URL for images, null for PDFs
}

interface ChatInputProps {
  onSend: (text: string, files?: File[]) => Promise<void>
  onTyping?: () => void
  placeholder?: string
  showAttachButton?: boolean
}

export function ChatInput({
  onSend,
  onTyping,
  placeholder = 'Сообщение...',
  showAttachButton = true,
}: ChatInputProps) {
  const [text, setText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetTextareaHeight = useCallback(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = '36px'
      el.style.overflow = 'hidden'
    }
  }, [])

  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget
    el.style.height = 'auto'
    const newHeight = Math.min(el.scrollHeight, 120)
    el.style.height = newHeight + 'px'
    el.style.overflow = el.scrollHeight > 120 ? 'auto' : 'hidden'
  }, [])

  const handleSend = useCallback(async () => {
    const trimmed = text.trim()
    const hasFiles = stagedFiles.length > 0
    if (!trimmed && !hasFiles) return
    if (isSending) return

    setIsSending(true)
    const filesToSend = stagedFiles.map(sf => sf.file)

    // Clean up preview URLs
    stagedFiles.forEach(sf => { if (sf.previewUrl) URL.revokeObjectURL(sf.previewUrl) })
    setStagedFiles([])
    setText('')
    resetTextareaHeight()

    try {
      await onSend(trimmed, filesToSend.length > 0 ? filesToSend : undefined)
    } finally {
      setIsSending(false)
    }
  }, [text, stagedFiles, isSending, onSend, resetTextareaHeight])

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

  const stageFile = useCallback((file: File) => {
    if (!validateFile(file)) return
    if (stagedFiles.length >= 5) return
    const isImage = file.type.startsWith('image/')
    const previewUrl = isImage ? URL.createObjectURL(file) : null
    setStagedFiles(prev => [...prev, { file, previewUrl }])
  }, [validateFile, stagedFiles.length])

  const removeStaged = useCallback((index: number) => {
    setStagedFiles(prev => {
      const removed = prev[index]
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
      return prev.filter((_, i) => i !== index)
    })
  }, [])

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData.items
      for (const item of Array.from(items)) {
        if (item.kind === 'file') {
          const file = item.getAsFile()
          if (file) {
            e.preventDefault()
            stageFile(file)
          }
          return
        }
      }
    },
    [stageFile],
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files?.length) return
      for (const file of Array.from(files)) {
        stageFile(file)
      }
      e.target.value = ''
    },
    [stageFile],
  )

  const hasContent = text.trim().length > 0 || stagedFiles.length > 0

  return (
    <div className="flex flex-col gap-2">
      {/* Staged files preview */}
      {stagedFiles.length > 0 && (
        <div className="flex items-center gap-1.5 px-1">
          {stagedFiles.map((sf, i) => (
            <div key={i} className="relative group">
              {sf.previewUrl ? (
                <img
                  src={sf.previewUrl}
                  alt={sf.file.name}
                  className="w-8 h-8 object-cover rounded border border-border/50"
                />
              ) : (
                <div className="w-8 h-8 rounded border border-border/50 bg-muted/30 flex items-center justify-center">
                  <span className="text-[8px] text-muted-foreground">
                    {sf.file.name.split('.').pop()?.toUpperCase()?.slice(0, 3)}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => removeStaged(i)}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
          <span className="text-[10px] text-muted-foreground ml-1">
            {stagedFiles.length}/5
          </span>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2">
        {showAttachButton && (
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
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
          </>
        )}

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => { setText(e.target.value); onTyping?.() }}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          rows={1}
          style={{ overflow: 'hidden' }}
          className="flex-1 resize-none bg-muted/30 text-foreground rounded-lg text-sm border border-border/50 outline-none focus:border-primary/50 placeholder:text-muted-foreground min-h-9 max-h-[120px] px-3 py-2 transition-colors [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        />

        <Button
          size="icon"
          onClick={handleSend}
          disabled={!hasContent || isSending}
          className="h-9 w-9 shrink-0 rounded-full bg-primary hover:bg-primary/90"
        >
          <ArrowUp className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
