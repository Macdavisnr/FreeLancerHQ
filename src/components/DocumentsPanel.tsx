import { useEffect, useRef, useState, type DragEvent } from 'react'
import {
  ACCEPTED_EXTENSIONS,
  MAX_FILE_MB,
  canPreview,
  deleteDocument,
  downloadDocument,
  listDocuments,
  previewDocument,
  uploadDocument,
} from '@/services/documentService'
import type { Document } from '@/types/document'
import { formatBytes } from '@/utils/format'

interface Props {
  /** What to list, and where new uploads are filed. Empty = all documents, filed under nothing. */
  filter?: { clientId?: string; projectId?: string }
  /** Show which client/project each file belongs to (pointless on that client's own page). */
  showOwner?: boolean
  emptyMessage?: string
}

/** Colour per kind of file, for the little badge in front of the name. */
function badgeClass(mime: string) {
  if (mime === 'application/pdf') return 'bg-red-50 text-red-700'
  if (mime.startsWith('image/')) return 'bg-violet-50 text-violet-700'
  if (mime.includes('sheet') || mime.includes('excel') || mime === 'text/csv') return 'bg-emerald-50 text-emerald-700'
  if (mime.includes('word') || mime.includes('opendocument.text')) return 'bg-sky-50 text-sky-700'
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'bg-orange-50 text-orange-700'
  return 'bg-slate-100 text-slate-700'
}

const extension = (name: string) => (name.includes('.') ? name.split('.').pop()!.slice(0, 4).toUpperCase() : 'FILE')

export default function DocumentsPanel({ filter = {}, showOwner = false, emptyMessage = 'No documents yet.' }: Props) {
  const { clientId, projectId } = filter
  const [documents, setDocuments] = useState<Document[] | null>(null)
  const [uploading, setUploading] = useState(0) // files still to upload
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0) // bump to re-fetch
  const picker = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let stale = false
    listDocuments({ clientId, projectId })
      .then((docs) => !stale && setDocuments(docs))
      .catch((err) => !stale && setError(err instanceof Error ? err.message : 'Could not load documents.'))
    return () => {
      stale = true
    }
  }, [clientId, projectId, version])

  /** Upload one at a time so each file gets its own clear success or error. */
  async function upload(files: File[]) {
    if (!files.length) return
    setError('')
    const problems: string[] = []
    setUploading(files.length)
    for (const file of files) {
      try {
        if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`Files can be at most ${MAX_FILE_MB} MB.`)
        await uploadDocument(file, { clientId, projectId })
      } catch (err) {
        problems.push(`${file.name}: ${err instanceof Error ? err.message : 'upload failed.'}`)
      }
      setUploading((n) => n - 1)
    }
    if (problems.length) setError(problems.join(' '))
    setVersion((v) => v + 1)
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    upload([...e.dataTransfer.files])
  }

  async function act(action: () => Promise<void>) {
    setError('')
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  async function handleDelete(doc: Document) {
    if (!confirm(`Delete "${doc.name}"? This cannot be undone.`)) return
    await act(async () => {
      await deleteDocument(doc.id)
      setDocuments((d) => d && d.filter((x) => x.id !== doc.id))
    })
  }

  return (
    <section
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        // Only when leaving the panel itself, not when moving between its children.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={handleDrop}
      className={`rounded-2xl border bg-white p-6 shadow-sm transition-colors ${
        dragging ? 'border-brand-600 bg-brand-50' : 'border-line'
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-bold">Documents</h2>
        <button
          type="button"
          onClick={() => picker.current?.click()}
          disabled={uploading > 0}
          className="text-sm font-semibold text-brand-700 disabled:opacity-60"
        >
          {uploading > 0 ? `Uploading ${uploading}…` : '+ Upload'}
        </button>
        <input
          ref={picker}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS}
          className="hidden"
          onChange={(e) => {
            upload([...(e.target.files ?? [])])
            e.target.value = '' // allow choosing the same file again
          }}
        />
      </div>

      {error && <p role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {documents === null && <p className="text-muted">Loading…</p>}

      {documents !== null && documents.length === 0 && (
        <button
          type="button"
          onClick={() => picker.current?.click()}
          className="w-full rounded-xl border border-dashed border-line px-4 py-8 text-center text-muted hover:border-brand-600 hover:text-ink"
        >
          {emptyMessage}
          <span className="mt-1 block text-sm">Drop files here or click to upload · PDF, images, Office, text, ZIP · up to {MAX_FILE_MB} MB</span>
        </button>
      )}

      <ul>
        {documents?.map((doc) => (
          <li key={doc.id} className="flex items-center gap-3 border-t border-line py-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${badgeClass(doc.mimeType)}`}>
              {extension(doc.name)}
            </span>
            <span className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => act(() => (canPreview(doc) ? previewDocument(doc) : downloadDocument(doc)))}
                title={canPreview(doc) ? 'Open' : 'Download'}
                className="block max-w-full truncate text-left font-semibold hover:text-brand-700"
              >
                {doc.name}
              </button>
              <span className="block truncate text-sm text-muted">
                {formatBytes(doc.size)} · {new Date(doc.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                {showOwner && (doc.projectName || doc.clientName) && ` · ${[doc.clientName, doc.projectName].filter(Boolean).join(' / ')}`}
              </span>
            </span>
            <button
              type="button"
              onClick={() => act(() => downloadDocument(doc))}
              aria-label={`Download "${doc.name}"`}
              title="Download"
              className="rounded-lg p-2 text-muted hover:bg-canvas hover:text-ink"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => handleDelete(doc)}
              aria-label={`Delete "${doc.name}"`}
              className="px-2 text-muted hover:text-red-600"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      {documents !== null && documents.length > 0 && (
        <p className="mt-2 text-xs text-muted">Tip: drop files anywhere on this card to upload.</p>
      )}
    </section>
  )
}
