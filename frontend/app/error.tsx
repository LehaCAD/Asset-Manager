'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <h2 className="text-xl font-semibold text-foreground">Что-то пошло не так</h2>
        <p className="text-muted-foreground text-sm">
          Произошла ошибка. Попробуйте обновить страницу.
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
        >
          Попробовать снова
        </button>
      </div>
    </div>
  )
}
