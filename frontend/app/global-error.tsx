'use client'

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { boundary: "root" },
      extra: { digest: error.digest },
    });
    // eslint-disable-next-line no-console
    console.error("[root-error]", { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <html lang="ru">
      <body className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-white">
        <div className="text-center space-y-4">
          <h2 className="text-xl font-semibold">Критическая ошибка</h2>
          <p className="text-gray-400 text-sm">
            Приложение не может продолжить работу.
          </p>
          {error.digest ? (
            <p className="text-gray-500 text-xs">Код: {error.digest}</p>
          ) : null}
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
