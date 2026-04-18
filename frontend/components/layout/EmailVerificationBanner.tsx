'use client'

import { useState } from 'react'
import { AlertTriangle, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/store/auth'
import { authApi } from '@/lib/api/auth'

export function EmailVerificationBanner() {
  const user = useAuthStore((s) => s.user)
  const [dismissed, setDismissed] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendDone, setResendDone] = useState(false)

  if (!user || user.is_email_verified !== false || dismissed) return null

  async function handleResend() {
    setResendLoading(true)
    try {
      await authApi.resendVerification()
      setResendDone(true)
      toast.success('Письмо отправлено')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка'
      toast.error(message)
    } finally {
      setResendLoading(false)
    }
  }

  return (
    <div className="bg-surface border-b border-border px-3 sm:px-4 py-2">
      <div className="flex items-center gap-2 sm:gap-3 max-w-7xl mx-auto">
        <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />
        <p className="flex-1 min-w-0 text-[12px] sm:text-sm text-muted-foreground leading-snug truncate sm:whitespace-normal">
          <span className="hidden sm:inline">
            Отправили письмо со ссылкой для подтверждения адреса. Подтвердите почту, чтобы получать рассылки о важных изменениях в вашем аккаунте.
            {' '}Иногда Gmail помечает письма как спам. Если у вас так — нажмите «Письмо безопасно».
          </span>
          <span className="sm:hidden">Подтвердите почту — ссылка в письме.</span>
        </p>
        {!resendDone ? (
          <button
            onClick={handleResend}
            disabled={resendLoading}
            className="flex-shrink-0 rounded-md border border-primary bg-transparent px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-sm font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            {resendLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Отправить'}
          </button>
        ) : (
          <span className="flex-shrink-0 text-[12px] sm:text-sm text-muted-foreground">Отправлено</span>
        )}
        <button
          onClick={() => setDismissed(true)}
          className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 cursor-pointer"
          aria-label="Закрыть"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
