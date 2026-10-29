import { api, apiBlob } from '@/lib/api'
import type { Document } from '@/types/document'

export const MAX_FILE_MB = 10

/** Same list as the server's ALLOWED_TYPES, for the file picker. The server still decides. */
export const ACCEPTED_EXTENSIONS =
  '.pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.zip'

export async function listDocuments(filter: { clientId?: string; projectId?: string } = {}): Promise<Document[]> {
  const query = new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as [string, string][]).toString()
  const { documents } = await api<{ documents: Document[] }>(`/documents${query ? `?${query}` : ''}`)
  return documents
}

/** Upload one file as multipart/form-data, optionally filed under a client and/or project. */
export async function uploadDocument(file: File, links: { clientId?: string | null; projectId?: string | null } = {}) {
  const form = new FormData()
  form.append('file', file)
  if (links.clientId) form.append('clientId', links.clientId)
  if (links.projectId) form.append('projectId', links.projectId)
  const { document } = await api<{ document: Document }>('/documents', { method: 'POST', body: form })
  return document
}

export async function deleteDocument(id: string): Promise<void> {
  await api<void>(`/documents/${id}`, { method: 'DELETE' })
}

/*
 * Types that are safe to open in a browser tab. A blob: URL runs with OUR site's permissions,
 * so anything that could contain script (HTML, SVG) must never be opened this way; the server
 * doesn't accept those anyway, and this list is a second line of defence.
 */
const PREVIEWABLE = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'text/plain'])
export const canPreview = (doc: Document) => PREVIEWABLE.has(doc.mimeType)

async function fileUrl(doc: Document) {
  const blob = await apiBlob(`/documents/${doc.id}/download`)
  // Re-wrap with the type we trust, rather than whatever the response claimed.
  return URL.createObjectURL(new Blob([blob], { type: doc.mimeType }))
}

/** Save the file to the computer under its original name. */
export async function downloadDocument(doc: Document) {
  const url = await fileUrl(doc)
  const link = document.createElement('a')
  link.href = url
  link.download = doc.name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000) // free the memory once the download has started
}

/**
 * Open a PDF/image/text file in a new tab. The tab is opened FIRST (still inside the click),
 * because browsers block pop-ups opened after waiting for a network request.
 */
export async function previewDocument(doc: Document) {
  const tab = window.open('', '_blank')
  try {
    const url = await fileUrl(doc)
    if (tab) tab.location.href = url
    else window.location.href = url
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (err) {
    tab?.close()
    throw err
  }
}
