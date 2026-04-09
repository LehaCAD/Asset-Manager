'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Zap } from 'lucide-react'
import { toast } from 'sonner'

interface RewardModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (amount: number, comment: string) => Promise<void>
  userName: string
}

export function RewardModal({ open, onOpenChange, onSubmit, userName }: RewardModalProps) {
  const [amount, setAmount] = useState('')
  const [comment, setComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    const numAmount = Number(amount)
    if (!numAmount || numAmount < 1) {
      toast.error('Укажите сумму')
      return
    }

    setIsSubmitting(true)
    try {
      await onSubmit(numAmount, comment)
      toast.success(`Начислено ${numAmount} Кадров`)
      onOpenChange(false)
      setAmount('')
      setComment('')
    } catch {
      toast.error('Не удалось начислить Кадры')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            Начислить Кадры
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Награда для <span className="font-medium text-foreground">{userName}</span>
          </p>

          <div className="space-y-2">
            <Label htmlFor="reward-amount">Сумма</Label>
            <Input
              id="reward-amount"
              type="number"
              min="1"
              placeholder="100"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reward-comment">Комментарий</Label>
            <Textarea
              id="reward-comment"
              placeholder="За репорт бага с загрузкой"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Начисление...' : 'Начислить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
