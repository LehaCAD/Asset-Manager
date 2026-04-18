'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { ArrowUp, Paperclip, X, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import type { PendingAttachment } from '@/lib/store/feedback'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const MAX_FILES = 5

type UploadStatus = 'uploading' | 'ready' | 'error'

interface StagedFile {
  id: string
  file: File
  previewUrl: string | null
  status: UploadStatus
  progress: number
  descriptor: PendingAttachment | null
  error: string | null
}

interface ChatInputProps {
  /** Upload the file to S3 ahead of message creation. Called on attach. */
  onUploadFile?: (file: File, onProgress: (pct: number) => void) => Promise<PendingAttachment>
  /** Send the message with the already-uploaded attachment descriptors. */
  onSend: (text: string, attachments?: PendingAttachment[]) => Promise<void>
  onTyping?: () => void
  placeholder?: string
  showAttachButton?: boolean
}

export function ChatInput({
  onUploadFile,
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

  useEffect(() => {
    return () => {
      stagedFiles.forEach((sf) => { if (sf.previewUrl) URL.revokeObjectURL(sf.previewUrl) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const anyUploading = stagedFiles.some((sf) => sf.status === 'uploading')
  const hasReadyAttachments = stagedFiles.some((sf) => sf.status === 'ready')
  const hasContent = text.trim().length > 0 || hasReadyAttachments
  const canSend = hasContent && !isSending && !anyUploading

  const handleSend = useCallback(async () => {
    const trimmed = text.trim()
    if (!canSend) return

    const readyDescriptors = stagedFiles
      .filter((sf) => sf.status === 'ready' && sf.descriptor)
      .map((sf) => sf.descriptor!)

    setIsSending(true)
    try {
      await onSend(trimmed, readyDescriptors.length > 0 ? readyDescriptors : undefined)
      // Clear only on success
      stagedFiles.forEach((sf) => { if (sf.previewUrl) URL.revokeObjectURL(sf.previewUrl) })
      setStagedFiles([])
      setText('')
      resetTextareaHeight()
    } finally {
      setIsSending(false)
    }
  }, [text, canSend, stagedFiles, onSend, resetTextareaHeight])

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

  const startUpload = useCallback(async (id: string, file: File) => {
    if (!onUploadFile) return
    try {
      const descriptor = await onUploadFile(file, (pct) => {
        setStagedFiles((prev) =>
          prev.map((sf) => (sf.id === id ? { ...sf, progress: pct } : sf)),
        )
      })
      setStagedFiles((prev) =>
        prev.map((sf) =>
          sf.id === id ? { ...sf, status: 'ready', progress: 100, descriptor } : sf,
        ),
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Не удалось загрузить файл'
      setStagedFiles((prev) =>
        prev.map((sf) => (sf.id === id ? { ...sf, status: 'error', error: msg } : sf)),
      )
    }
  }, [onUploadFile])

  const stageFile = useCallback((file: File) => {
    if (!validateFile(file)) return
    if (stagedFiles.length >= MAX_FILES) {
      toast.error(`Максимум ${MAX_FILES} файлов`)
      return
    }
    const isImage = file.type.startsWith('image/')
    const previewUrl = isImage ? URL.createObjectURL(file) : null
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setStagedFiles((prev) => [
      ...prev,
      {
        id, file, previewUrl,
        status: 'uploading', progress: 0, descriptor: null, error: null,
      },
    ])
    startUpload(id, file)
  }, [validateFile, stagedFiles.length, startUpload])

  const retryUpload = useCallback((id: string) => {
    const sf = stagedFiles.find((x) => x.id === id)
    if (!sf) return
    setStagedFiles((prev) =>
      prev.map((x) => (x.id === id ? { ...x, status: 'uploading', progress: 0, error: null } : x)),
    )
    startUpload(id, sf.file)
  }, [stagedFiles, startUpload])

  const removeStaged = useCallback((id: string) => {
    setStagedFiles((prev) => {
      const removed = prev.find((sf) => sf.id === id)
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
      return prev.filter((sf) => sf.id !== id)
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

  return (
    <div className="flex flex-col gap-2">
      {/* Staged files preview */}
      {stagedFiles.length > 0 && (
        <div className="flex items-center gap-1.5 px-1 flex-wrap">
          {stagedFiles.map((sf) => {
            const isUploading = sf.status === 'uploading'
            const isError = sf.status === 'error'
            return (
              <div key={sf.id} className="relative group">
                {sf.previewUrl ? (
                  <img
                    src={sf.previewUrl}
                    alt={sf.file.name}
                    className={
                      'w-10 h-10 object-cover rounded border transition-opacity ' +
                      (isUploading ? 'opacity-50 border-border/50' :
                        isError ? 'border-destructive' : 'border-border/50')
                    }
                  />
                ) : (
                  <div className={
                    'w-10 h-10 rounded border bg-muted/30 flex items-center justify-center ' +
                    (isError ? 'border-destructive' : 'border-border/50')
                  }>
                    <span className={'text-[8px] ' + (isUploading ? 'text-muted-foreground/50' : 'text-muted-foreground')}>
                      {sf.file.name.split('.').pop()?.toUpperCase()?.slice(0, 3)}
                    </span>
                  </div>
                )}
                {isUploading && (
                  <div
                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    aria-label={`Загружается, ${sf.progress}%`}
                  >
                    <Loader2 className="w-4 h-4 animate-spin text-foreground drop-shadow" />
                  </div>
                )}
                {isError && (
                  <button
                    type="button"
                    onClick={() => retryUpload(sf.id)}
                    className="absolute inset-0 flex items-center justify-center bg-destructive/15 rounded"
                    title={sf.error ?? 'Ошибка загрузки. Повторить?'}
                  >
                    <AlertCircle className="w-4 h-4 text-destructive" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeStaged(sf.id)}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Удалить вложение"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            )
          })}
          <span className="text-[10px] text-muted-foreground ml-1">
            {stagedFiles.length}/{MAX_FILES}
            {anyUploading && ' · загружается…'}
          </span>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2">
        {showAttachButton && (
          <>
            <button
              type="button"
              disabled={isSending || stagedFiles.length >= MAX_FILES}
              className="h-9 w-9 shrink-0 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Прикрепить файл"
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
          disabled={isSending}
          style={{ overflow: 'hidden' }}
          className="flex-1 resize-none bg-muted text-foreground rounded-lg text-sm border border-border outline-none focus:border-primary/50 placeholder:text-muted-foreground min-h-9 max-h-[120px] px-3 py-2 transition-colors disabled:opacity-70 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        />

        <Button
          size="icon"
          onClick={handleSend}
          disabled={!canSend}
          title={anyUploading ? 'Дождитесь завершения загрузки' : undefined}
          className="h-9 w-9 shrink-0 rounded-full bg-primary hover:bg-primary/90"
        >
          {isSending || anyUploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ArrowUp className="w-4 h-4" />
          )}
        </Button>
      </div>
    </div>
  )
}
