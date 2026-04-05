'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface RenameDialogProps {
  open: boolean
  currentName: string
  onConfirm: (name: string) => void
  onCancel: () => void
}

export function RenameDialog({ open, currentName, onConfirm, onCancel }: RenameDialogProps) {
  const [value, setValue] = useState(currentName)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setValue(currentName) }, [currentName])
  useEffect(() => {
    if (open) setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 50)
  }, [open])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (trimmed && trimmed !== currentName) onConfirm(trimmed)
    else onCancel()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Переименовать</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancel}>Отмена</Button>
            <Button type="submit">Сохранить</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
