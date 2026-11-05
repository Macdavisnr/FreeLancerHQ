import { api } from '@/lib/api'
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

/**
 * Upload one file, optionally filed under a client and/or project. Three steps (see the server's
 * routes/documents.ts): ask for a presigned upload URL, send the file straight to storage,
 * then tell the API it arrived.
 */
export async function uploadDocument(file: File, links: { clientId?: string | null; projectId?: string | null } = {}) {
  const { key, uploadUrl, contentType } = await api<{ key: string; uploadUrl: string; contentType: string }>(
    '/documents/uploads',
    { method: 'POST', body: { name: file.name, size: file.size, ...links } },
  )
  // Plain fetch, NOT api(): api() adds our login token, which must never be sent to another site.
  let uploaded: Response
  try {
    uploaded = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file })
  } catch {
    throw new Error('The upload failed. Check your connection and try again.')
  }
  if (!uploaded.ok) throw new Error('The upload failed. Please try again.')
  const { document } = await api<{ document: Document }>('/documents', {
    method: 'POST',
    body: { key, name: file.name, ...links },
  })
  return document
}

export async function deleteDocument(id: string): Promise<void> {
  await api<void>(`/documents/${id}`, { method: 'DELETE' })
}

/** Types the server lets the browser display. Others are offered as downloads only. */
const PREVIEWABLE = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'text/plain'])
export const canPreview = (doc: Document) => PREVIEWABLE.has(doc.mimeType)

/** A link to the file that works for about a minute; the server checks the document is ours first. */
async function fileLink(doc: Document, inline: boolean) {
  const { url } = await api<{ url: string }>(`/documents/${doc.id}/link${inline ? '?inline=1' : ''}`)
  return url
}

/** Save the file to the computer. The link is served as an "attachment", so the page stays put. */
export async function downloadDocument(doc: Document) {
  const link = document.createElement('a')
  link.href = await fileLink(doc, false)
  link.click()
}

/**
 * Open a PDF/image/text file in a new tab. The tab is opened FIRST (still inside the click),
 * because browsers block pop-ups opened after waiting for a network request.
 */
export async function previewDocument(doc: Document) {
  const tab = window.open('', '_blank')
  try {
    const url = await fileLink(doc, true)
    if (tab) tab.location.href = url
    else window.location.href = url
  } catch (err) {
    tab?.close()
    throw err
  }
}
