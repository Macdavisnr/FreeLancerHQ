import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { Router, type RequestHandler } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { requireAuth } from '../auth.js'
import { pool } from '../db.js'
import { HttpError } from '../errors.js'
import { storage } from '../storage.js'

export const documentsRouter = Router()
documentsRouter.use(requireAuth)

const MAX_FILE_MB = 10

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

/*
 * multer reads a multipart/form-data request: the file arrives in req.file, the other form
 * fields in req.body. memoryStorage keeps the file in a Buffer (fine at 10 MB) so we can hand
 * it to our own storage layer.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 1, fields: 5 },
  defParamCharset: 'utf8', // so "Résumé.pdf" or "合同.pdf" keep their names
}).single('file')

/** Run multer, turning its errors into friendly 4xx messages. */
const receiveFile: RequestHandler = (req, res, next) => {
  upload(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      next(new HttpError(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400,
        err.code === 'LIMIT_FILE_SIZE' ? `Files can be at most ${MAX_FILE_MB} MB.` : 'Upload one file at a time.'))
      return
    }
    next(err)
  })
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

// POST /api/documents   multipart/form-data: file, clientId?, projectId?
documentsRouter.post('/', receiveFile, async (req, res) => {
  const file = req.file
  if (!file) throw new HttpError(400, 'Choose a file to upload.')
  const links = z.object({ clientId: optionalId, projectId: optionalId }).parse(req.body)

  const name = path.basename(file.originalname).slice(0, 200) || 'file'
  const mimeType = ALLOWED_TYPES[path.extname(name).toLowerCase()]
  if (!mimeType) {
    throw new HttpError(415, 'That type of file is not supported. Use PDF, images, Office documents, text/CSV or ZIP.')
  }

  // Ownership checks. A project already belongs to a client, so filing under a project also
  // files under its client, and the two can never disagree.
  let clientId = links.clientId
  if (links.projectId) {
    const { rows } = await pool.query('SELECT client_id FROM projects WHERE id = $1 AND user_id = $2', [links.projectId, req.userId])
    if (!rows[0]) throw new HttpError(400, 'Choose one of your projects.')
    if (clientId && clientId !== rows[0].client_id) throw new HttpError(400, 'That project belongs to a different client.')
    clientId = rows[0].client_id
  } else if (clientId) {
    const { rowCount } = await pool.query('SELECT 1 FROM clients WHERE id = $1 AND user_id = $2', [clientId, req.userId])
    if (!rowCount) throw new HttpError(400, 'Choose one of your clients.')
  }

  // 1. bytes into storage, 2. the record into the database. If step 2 fails, undo step 1, so we
  // never keep a file nobody can see.
  const storageKey = `${req.userId}/${randomUUID()}`
  await storage.put(storageKey, file.buffer, mimeType)
  try {
    const { rows } = await pool.query(
      `INSERT INTO documents (user_id, client_id, project_id, name, storage_key, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [req.userId, clientId, links.projectId, name, storageKey, mimeType, file.size],
    )
    const created = await pool.query(`${DOCUMENT_SELECT} WHERE d.id = $1`, [rows[0].id])
    res.status(201).json({ document: created.rows[0] })
  } catch (err) {
    await storage.remove(storageKey).catch(() => {})
    throw err
  }
})

// GET /api/documents/:id/download  -> the file itself
documentsRouter.get('/:id/download', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT name, storage_key, mime_type, size_bytes FROM documents WHERE id = $1 AND user_id = $2',
    [id(req.params.id), req.userId],
  )
  const doc = rows[0]
  if (!doc) throw new HttpError(404, 'Document not found.')

  let stream
  try {
    stream = await storage.get(doc.storage_key)
  } catch {
    throw new HttpError(404, 'This file is missing from storage.')
  }
  res.set({
    'Content-Type': doc.mime_type,
    'Content-Length': String(doc.size_bytes),
    // "attachment" = save, never display inline on our domain. filename* carries non-ASCII names.
    'Content-Disposition': `attachment; filename="${doc.name.replace(/[^\x20-\x7e]|["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
    'X-Content-Type-Options': 'nosniff', // the browser must trust our Content-Type, not guess
    'Cache-Control': 'private, no-store',
  })
  stream.pipe(res) // bytes flow from storage to the browser without being held in memory
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
