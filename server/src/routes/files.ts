import express, { Router } from 'express'
import { HttpError } from '../errors.js'
import { contentDisposition, type LocalDiskStorage } from '../storage.js'
import { MAX_FILE_MB } from './documents.js'

/*
 * /api/files/<token>  - the local-disk driver's stand-in for a cloud bucket (development only;
 * mounted in app.ts only when STORAGE_DRIVER=local).
 *
 * No login here, exactly like a presigned bucket URL: the signed token IS the permission.
 * It names one file and one operation (put or get) and expires within minutes.
 */
export function localFilesRouter(local: LocalDiskStorage) {
  const router = Router()

  // PUT: the browser uploads the raw bytes (not a form), as it would to R2.
  router.put('/:token', express.raw({ type: () => true, limit: MAX_FILE_MB * 1024 * 1024 }), async (req, res) => {
    const ticket = local.readTicket(req.params.token)
    if (ticket?.op !== 'put') throw new HttpError(403, 'This upload link is invalid or has expired.')
    // Like S3, the Content-Type is part of what was signed.
    if (req.headers['content-type'] !== ticket.contentType) throw new HttpError(403, 'Wrong Content-Type for this upload link.')
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, 'The file is empty.')
    try {
      await local.save(ticket.key, req.body)
    } catch (err) {
      if ((err as { code?: string }).code === 'EEXIST') throw new HttpError(409, 'This upload link was already used.')
      throw err
    }
    res.status(200).end()
  })

  router.get('/:token', async (req, res) => {
    const ticket = local.readTicket(req.params.token)
    if (ticket?.op !== 'get') throw new HttpError(403, 'This download link is invalid or has expired.')
    let stream
    try {
      stream = await local.open(ticket.key)
    } catch {
      throw new HttpError(404, 'This file is missing from storage.')
    }
    res.set({
      'Content-Type': ticket.contentType,
      'Content-Disposition': contentDisposition(ticket.fileName, ticket.inline),
      'X-Content-Type-Options': 'nosniff', // the browser must trust our Content-Type, not guess
      'Cache-Control': 'private, no-store',
    })
    stream.pipe(res) // bytes flow from disk to the browser without being held in memory
  })

  return router
}
