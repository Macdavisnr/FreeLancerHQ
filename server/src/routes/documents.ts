import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth.js'
import { pool } from '../db.js'
import { HttpError } from '../errors.js'
import { storage } from '../storage.js'

export const documentsRouter = Router()
documentsRouter.use(requireAuth)

export const MAX_FILE_MB = 10
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024

/*
 * Only these kinds of file are accepted, decided by EXTENSION, and the type we store and later
 * send back comes from this table, not from the browser (anyone can lie about Content-Type).
 * Deliberately missing: .html/.svg/.js (can run scripts in a browser) and executables.
 */
const ALLOWED_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.zip': 'application/zip',
}

const DOCUMENT_SELECT = `
  SELECT d.id, d.name, d.mime_type AS "mimeType", d.size_bytes AS size, d.created_at AS "createdAt",
         d.client_id AS "clientId", c.name AS "clientName",
         d.project_id AS "projectId", p.name AS "projectName"
  FROM documents d
  LEFT JOIN clients c ON c.id = d.client_id
  LEFT JOIN projects p ON p.id = d.project_id`

const id = (value: unknown) => z.uuid('Invalid id.').parse(value)
const optionalId = z.union([z.uuid(), z.literal('')]).nullish().transform((v) => v || null)

// GET /api/documents  (?clientId= / ?projectId= to filter)
documentsRouter.get('/', async (req, res) => {
  const params: unknown[] = [req.userId]
  let where = 'WHERE d.user_id = $1'
  if (typeof req.query.clientId === 'string') {
    params.push(id(req.query.clientId))
    where += ` AND d.client_id = $${params.length}`
  }
  if (typeof req.query.projectId === 'string') {
    params.push(id(req.query.projectId))
    where += ` AND d.project_id = $${params.length}`
  }
  const { rows } = await pool.query(`${DOCUMENT_SELECT} ${where} ORDER BY d.created_at DESC`, params)
  res.json({ documents: rows })
})

/** Types that are safe to display in the browser. Anything else is always downloaded. */
const PREVIEWABLE = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'text/plain'])

/** The file name to keep (no folders), and its type from our allow-list. */
function checkName(fileName: string) {
  const name = path.basename(fileName).slice(0, 200) || 'file'
  const mimeType = ALLOWED_TYPES[path.extname(name).toLowerCase()]
  if (!mimeType) {
    throw new HttpError(415, 'That type of file is not supported. Use PDF, images, Office documents, text/CSV or ZIP.')
  }
  return { name, mimeType }
}

/**
 * Ownership checks. A project already belongs to a client, so filing under a project also
 * files under its client, and the two can never disagree. Returns the client id to store.
 */
async function checkLinks(userId: string, links: { clientId: string | null; projectId: string | null }) {
  if (links.projectId) {
    const { rows } = await pool.query('SELECT client_id FROM projects WHERE id = $1 AND user_id = $2', [links.projectId, userId])
    if (!rows[0]) throw new HttpError(400, 'Choose one of your projects.')
    if (links.clientId && links.clientId !== rows[0].client_id) throw new HttpError(400, 'That project belongs to a different client.')
    return rows[0].client_id as string | null
  }
  if (links.clientId) {
    const { rowCount } = await pool.query('SELECT 1 FROM clients WHERE id = $1 AND user_id = $2', [links.clientId, userId])
    if (!rowCount) throw new HttpError(400, 'Choose one of your clients.')
  }
  return links.clientId
}

const linksSchema = { clientId: optionalId, projectId: optionalId }

/*
 * Uploading is three steps, so the file goes straight from the browser to storage:
 *   1. POST /api/documents/uploads  "may I upload contract.pdf, 3 MB?"  -> checks, then a presigned URL
 *   2. the browser PUTs the bytes to that URL (to R2 in production, not to us)
 *   3. POST /api/documents           "done"  -> we check the file really arrived, then record it
 */

// STEP 1: POST /api/documents/uploads  body: { name, size, clientId?, projectId? }
documentsRouter.post('/uploads', async (req, res) => {
  const input = z
    .object({ name: z.string().trim().min(1).max(500), size: z.number().int().min(0), ...linksSchema })
    .parse(req.body)
  const { mimeType } = checkName(input.name)
  if (input.size === 0) throw new HttpError(400, 'That file is empty.')
  if (input.size > MAX_FILE_BYTES) throw new HttpError(413, `Files can be at most ${MAX_FILE_MB} MB.`)
  await checkLinks(req.userId, input) // fail now, before the browser spends time uploading

  const key = `${req.userId}/${randomUUID()}`
  res.json({ key, contentType: mimeType, uploadUrl: await storage.uploadUrl(key, mimeType) })
})

// STEP 3: POST /api/documents  body: { key, name, clientId?, projectId? }
documentsRouter.post('/', async (req, res) => {
  const input = z.object({ key: z.string(), name: z.string().trim().min(1).max(500), ...linksSchema }).parse(req.body)
  // The key must be one step 1 could have given THIS user: their own folder, a uuid.
  const [owner, fileId] = input.key.split('/')
  if (owner !== req.userId || !z.uuid().safeParse(fileId).success || input.key.split('/').length !== 2) {
    throw new HttpError(400, 'Invalid upload.')
  }
  const { name, mimeType } = checkName(input.name)
  // Checked again: a client or project could have been deleted while the file was uploading.
  const clientId = await checkLinks(req.userId, input)

  // Trust the size storage reports, not the size the browser announced in step 1.
  const size = await storage.sizeOf(input.key)
  if (size === null) throw new HttpError(400, 'The upload did not arrive. Please try again.')
  if (size === 0 || size > MAX_FILE_BYTES) {
    await storage.remove(input.key).catch(() => {})
    throw new HttpError(413, `Files can be at most ${MAX_FILE_MB} MB.`)
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO documents (user_id, client_id, project_id, name, storage_key, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [req.userId, clientId, input.projectId, name, input.key, mimeType, size],
    )
    const created = await pool.query(`${DOCUMENT_SELECT} WHERE d.id = $1`, [rows[0].id])
    res.status(201).json({ document: created.rows[0] })
  } catch (err) {
    // 23505 = this key is already recorded (step 3 sent twice). Keep the file: it belongs to that record.
    if ((err as { code?: string }).code === '23505') throw new HttpError(409, 'This upload was already saved.')
    // Any other failure: remove the file, so we never keep one that nobody can see.
    await storage.remove(input.key).catch(() => {})
    throw err
  }
})

// GET /api/documents/:id/link  (?inline=1 to preview)  -> a short-lived URL to the file itself
documentsRouter.get('/:id/link', async (req, res) => {
  const { rows } = await pool.query('SELECT name, storage_key, mime_type FROM documents WHERE id = $1 AND user_id = $2', [
    id(req.params.id),
    req.userId,
  ])
  const doc = rows[0]
  if (!doc) throw new HttpError(404, 'Document not found.')
  // Only types that can't carry scripts may be displayed; everything else is a download.
  const inline = req.query.inline === '1' && PREVIEWABLE.has(doc.mime_type)
  res.json({ url: await storage.downloadUrl(doc.storage_key, { fileName: doc.name, contentType: doc.mime_type, inline }) })
})

// DELETE /api/documents/:id
documentsRouter.delete('/:id', async (req, res) => {
  const { rows } = await pool.query(
    'DELETE FROM documents WHERE id = $1 AND user_id = $2 RETURNING storage_key',
    [id(req.params.id), req.userId],
  )
  if (!rows[0]) throw new HttpError(404, 'Document not found.')
  // The record is gone, so the file is unreachable either way. If removing it fails we only log.
  await storage.remove(rows[0].storage_key).catch((err) => console.error('Could not remove stored file:', err))
  res.status(204).end()
})
