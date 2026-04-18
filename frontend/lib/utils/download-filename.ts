/**
 * Build a sensible download filename for an element.
 *
 * The branded URL `/elements/<id>/` no longer contains a file extension
 * (it used to be parsed out of the S3 URL), so callers can't derive the
 * extension from the URL anymore. Prefer the stored `original_filename`,
 * fall back to an extension implied by the element type.
 */
export interface NamedElement {
  id: number | string
  element_type?: 'IMAGE' | 'VIDEO' | string
  original_filename?: string | null
}

function pickExtension(el: NamedElement): string {
  const fromName = el.original_filename?.match(/\.([A-Za-z0-9]{2,5})$/)?.[1]
  if (fromName) return fromName.toLowerCase()
  return el.element_type === 'VIDEO' ? 'mp4' : 'png'
}

export function getDownloadFilename(el: NamedElement): string {
  if (el.original_filename) {
    // Already has an extension → use as-is; otherwise append one.
    if (/\.[A-Za-z0-9]{2,5}$/.test(el.original_filename)) {
      return el.original_filename
    }
    return `${el.original_filename}.${pickExtension(el)}`
  }
  return `element-${el.id}.${pickExtension(el)}`
}
