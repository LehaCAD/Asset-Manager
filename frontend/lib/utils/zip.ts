export interface DownloadableElement {
  id: number
  element_type: 'IMAGE' | 'VIDEO'
  is_favorite: boolean
  source_type: 'GENERATED' | 'UPLOADED'
  file_url: string
  original_filename: string
  file_size: number | null
  scene_id: number | null
}

export type DownloadStage = 'idle' | 'fetching' | 'packing' | 'done' | 'error' | 'cancelled'

const WINDOWS_RESERVED = /^(CON|PRN|AUX|NUL|COM\d|LPT\d)$/i

export function sanitizeFilename(name: string): string {
  let result = name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^\.+|\.+$/g, '_')
    .trim()
    .slice(0, 200)

  if (WINDOWS_RESERVED.test(result.replace(/\.[^.]*$/, ''))) {
    result = `_${result}`
  }

  return result || 'unnamed'
}

export function deduplicateFilename(
  name: string,
  folder: string,
  usedNames: Map<string, Set<string>>
): string {
  if (!usedNames.has(folder)) usedNames.set(folder, new Set())
  const used = usedNames.get(folder)!

  if (!used.has(name)) {
    used.add(name)
    return name
  }

  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''

  let counter = 2
  while (used.has(`${base} (${counter})${ext}`)) counter++
  const result = `${base} (${counter})${ext}`
  used.add(result)
  return result
}

export function buildGroupPaths(
  groups: Array<{ id: number; name: string; parent_id?: number | null; parent?: number | null }>
): Record<number, string> {
  const byId = new Map(groups.map(g => [g.id, g]))
  const paths: Record<number, string> = {}

  function getPath(id: number): string {
    if (paths[id] !== undefined) return paths[id]
    const group = byId.get(id)
    if (!group) return ''
    const parentId = group.parent_id ?? group.parent ?? null
    const parentPath = parentId ? getPath(parentId) : ''
    paths[id] = parentPath
      ? `${parentPath}/${sanitizeFilename(group.name)}`
      : sanitizeFilename(group.name)
    return paths[id]
  }

  groups.forEach(g => getPath(g.id))
  return paths
}

/** Гарантирует, что имя файла имеет расширение. Берёт из URL или element_type. */
function ensureExtension(
  filename: string,
  fileUrl: string,
  elementType: 'IMAGE' | 'VIDEO'
): string {
  const hasExt = /\.\w{2,5}$/.test(filename)
  if (hasExt) return filename

  // Попытка извлечь расширение из URL (до ? query params)
  const urlPath = fileUrl.split('?')[0]
  const urlExt = urlPath.match(/\.(\w{2,5})$/)?.[1]
  if (urlExt) return `${filename}.${urlExt}`

  // Fallback по типу элемента
  return `${filename}.${elementType === 'VIDEO' ? 'mp4' : 'png'}`
}

const CONCURRENCY = 4

async function fetchAllFiles(
  elements: DownloadableElement[],
  signal: AbortSignal,
  onFileComplete: (index: number, blob: Blob | null) => void
) {
  let nextIndex = 0

  async function worker() {
    while (nextIndex < elements.length) {
      const i = nextIndex++
      signal.throwIfAborted()
      const el = elements[i]
      try {
        const resp = await fetch(el.file_url, { mode: 'cors', signal })
        if (!resp.ok) {
          console.warn(`[batch-download] Пропущен элемент id=${el.id}: HTTP ${resp.status} — ${el.file_url}`)
          onFileComplete(i, null)
          continue
        }
        const blob = await resp.blob()
        onFileComplete(i, blob)
      } catch (err) {
        if (signal.aborted) throw err
        console.warn(`[batch-download] Пропущен элемент id=${el.id}: ${err instanceof Error ? err.message : err} — ${el.file_url}`)
        onFileComplete(i, null)
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
}

export async function buildAndDownloadZip(
  elements: DownloadableElement[],
  groupPaths: Record<number, string>,
  projectName: string,
  onProgress: (current: number, total: number) => void,
  onStageChange: (stage: DownloadStage) => void,
  signal: AbortSignal
): Promise<{ downloaded: number; skipped: number }> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const usedNames = new Map<string, Set<string>>()

  onStageChange('fetching')
  let completed = 0
  let skipped = 0
  const total = elements.length
  const blobs = new Array<{ blob: Blob; path: string } | null>(total)

  await fetchAllFiles(elements, signal, (index, blob) => {
    if (!blob) {
      skipped++
      blobs[index] = null
    } else {
      const el = elements[index]
      const folder = el.scene_id ? (groupPaths[el.scene_id] ?? '') : ''
      const rawName = sanitizeFilename(el.original_filename || `element-${el.id}`)
      const filename = deduplicateFilename(
        ensureExtension(rawName, el.file_url, el.element_type),
        folder,
        usedNames
      )
      const path = folder ? `${folder}/${filename}` : filename
      blobs[index] = { blob, path }
    }
    completed++
    onProgress(completed, total)
  })

  for (const entry of blobs) {
    if (entry) zip.file(entry.path, entry.blob)
  }

  onStageChange('packing')
  signal.throwIfAborted()

  const content = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 1 },
  })

  const url = URL.createObjectURL(content)
  const a = document.createElement('a')
  a.href = url
  a.download = `${sanitizeFilename(projectName)}.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)

  onStageChange('done')
  return { downloaded: completed - skipped, skipped }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1_000_000) return '< 1 МБ'
  if (bytes < 1_000_000_000) return `~${Math.round(bytes / 1_000_000)} МБ`
  return `~${(bytes / 1_000_000_000).toFixed(1)} ГБ`
}

export const MAX_DOWNLOAD_FILES = 200
export const MAX_DOWNLOAD_BYTES = 1_000_000_000 // 1 GB
export const WARN_DOWNLOAD_BYTES = 500_000_000  // 500 MB
