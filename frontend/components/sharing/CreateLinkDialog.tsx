'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Copy } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { sharingApi } from '@/lib/api/sharing'

interface CreateLinkDialogProps {
  isOpen: boolean
  onClose: () => void
  projectId: number
  elementIds: number[]
}

const EXPIRY_OPTIONS = [
  { label: 'Без ограничений', value: '' },
  { label: '7 дней', value: '7' },
  { label: '30 дней', value: '30' },
]

export function CreateLinkDialog({
  isOpen,
  onClose,
  projectId,
  elementIds,
}: CreateLinkDialogProps) {
  const [name, setName] = useState('')
  const [expiry, setExpiry] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function buildExpiresAt(days: string): string | undefined {
    if (!days) return undefined
    const date = new Date()
    date.setDate(date.getDate() + Number(days))
    return date.toISOString()
  }

  async function handleSubmit() {
    setIsSubmitting(true)
    try {
      const link = await sharingApi.createLink({
        project: projectId,
        element_ids: elementIds,
        name: name.trim() || undefined,
        expires_at: buildExpiresAt(expiry),
      })

      const fullUrl = `${window.location.origin}${link.url}`
      await navigator.clipboard.writeText(fullUrl)
      toast.success('Ссылка скопирована')
      handleClose()
    } catch {
      toast.error('Не удалось создать ссылку')
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleClose() {
    setName('')
    setExpiry('')
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Создать ссылку для просмотра</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            {elementIds.length === 1
              ? '1 элемент будет доступен по ссылке'
              : `${elementIds.length} элементов будет доступно по ссылке`}
          </p>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="link-name">
              Название ссылки
              <span className="text-muted-foreground font-normal ml-1">(необязательно)</span>
            </label>
            <input
              id="link-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Ревью клиента"
              className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="link-expiry">
              Срок действия
            </label>
            <select
              id="link-expiry"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {EXPIRY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Copy className="w-4 h-4" />
            {isSubmitting ? 'Создание...' : 'Создать и скопировать'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
