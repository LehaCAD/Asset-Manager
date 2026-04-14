'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import {
  buildAndDownloadZip,
  type DownloadableElement,
  type DownloadStage,
} from '@/lib/utils/zip'

interface DownloadProgress {
  current: number
  total: number
  currentFile: string
}

interface UseBatchDownloadReturn {
  stage: DownloadStage
  progress: DownloadProgress
  result: { downloaded: number; skipped: number } | null
  start: (
    elements: DownloadableElement[],
    groupPaths: Record<number, string>,
    projectName: string
  ) => void
  cancel: () => void
  reset: () => void
}

export function useBatchDownload(): UseBatchDownloadReturn {
  const [stage, setStage] = useState<DownloadStage>('idle')
  const [progress, setProgress] = useState<DownloadProgress>({
    current: 0, total: 0, currentFile: '',
  })
  const [result, setResult] = useState<{ downloaded: number; skipped: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // beforeunload guard
  useEffect(() => {
    if (stage !== 'fetching' && stage !== 'packing') return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [stage])

  // Cleanup on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  const start = useCallback((
    elements: DownloadableElement[],
    groupPaths: Record<number, string>,
    projectName: string
  ) => {
    const controller = new AbortController()
    abortRef.current = controller

    setStage('idle')
    setProgress({ current: 0, total: elements.length, currentFile: '' })
    setResult(null)

    buildAndDownloadZip(
      elements,
      groupPaths,
      projectName,
      (current, total, filename) => {
        setProgress({ current, total, currentFile: filename })
      },
      setStage,
      controller.signal
    ).then((res) => {
      setResult(res)
      if (res.skipped > 0) {
        toast.warning(`${res.skipped} файл(ов) пропущено`)
      }
    }).catch((err) => {
      if (controller.signal.aborted) {
        setStage('cancelled')
        toast('Скачивание отменено')
      } else {
        setStage('error')
        toast.error('Не удалось скачать архив')
        console.error('Batch download error:', err)
      }
    })
  }, [])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStage('idle')
    setProgress({ current: 0, total: 0, currentFile: '' })
    setResult(null)
  }, [])

  return { stage, progress, result, start, cancel, reset }
}
