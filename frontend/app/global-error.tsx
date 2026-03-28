'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="ru">
      <body className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-white">
        <div className="text-center space-y-4">
          <h2 className="text-xl font-semibold">Критическая ошибка</h2>
          <p className="text-gray-400 text-sm">
            Приложение не может продолжить работу.
          </p>
          <button
            onClick={reset}
            className="px-4 py-2 bg-white text-black rounded-md text-sm"
          >
            Перезагрузить
          </button>
        </div>
      </body>
    </html>
  )
}
