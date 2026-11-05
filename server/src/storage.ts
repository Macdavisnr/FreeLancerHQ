import { createReadStream } from 'node:fs'
import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import jwt from 'jsonwebtoken'

/*
 * File storage behind one small interface, with two drivers:
 *   - "local": files in server/uploads/ (development)
 *   - "s3":    any S3-compatible bucket: Cloudflare R2 in production, also AWS S3, MinIO...
 *
 * The bytes never pass through our API. Serverless functions (Vercel) accept at most 4.5 MB per
 * request or response, and holding files in memory is wasteful anyway. Instead the API hands
 * the browser PRESIGNED URLs: links that carry a signature proving "the API allowed THIS
 * operation on THIS file until THIS time". The browser uploads/downloads with them directly.
 * Both drivers work this way, so the routes and the frontend are identical for both.
 *
 * Keys look like "<userId>/<random uuid>". They are never built from the uploaded file
 * name, so a file called "../../.env" can't escape its folder.
 */
export interface DownloadOptions {
  fileName: string
  contentType: string
  /** true = show in the browser (preview), false = save as a file */
  inline: boolean
}

export interface FileStorage {
  /** A URL the browser PUTs the file to, with "Content-Type: <contentType>". Valid for a few minutes. */
  uploadUrl(key: string, contentType: string): Promise<string>
  /** The stored file's size in bytes, or null if nothing has been uploaded under this key. */
  sizeOf(key: string): Promise<number | null>
  /** A short-lived URL that downloads (or previews) the file. */
  downloadUrl(key: string, options: DownloadOptions): Promise<string>
  remove(key: string): Promise<void>
}

const UPLOAD_URL_SECONDS = 5 * 60
const DOWNLOAD_URL_SECONDS = 60

/** "attachment" = save it; "inline" = display it. filename* carries non-ASCII names like "Résumé.pdf". */
export function contentDisposition(fileName: string, inline: boolean) {
  const ascii = fileName.replace(/[^\x20-\x7e]|["\\]/g, '_')
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}

/** What a local signed URL carries (see LocalDiskStorage). */
export type LocalFileTicket =
  | { op: 'put'; key: string; contentType: string }
  | { op: 'get'; key: string; contentType: string; fileName: string; inline: boolean }

/*
 * Development driver: files go in server/uploads/ (git-ignored).
 *
 * To behave like a cloud bucket it hands out its own "presigned" URLs: /api/files/<token>,
 * where the token is a short-lived JWT naming the one operation allowed. routes/files.ts
 * checks the token and reads or writes the file. Same idea as S3's signatures, our own format.
 */
export class LocalDiskStorage implements FileStorage {
  constructor(
    private root: string,
    private secret: string,
  ) {}

  /** Belt and braces: even though keys are ours, refuse anything that resolves outside root. */
  private pathFor(key: string) {
    const full = path.resolve(this.root, key)
    if (!full.startsWith(this.root + path.sep)) throw new Error(`Invalid storage key: ${key}`)
    return full
  }

  private sign(ticket: LocalFileTicket, seconds: number) {
    return `/api/files/${jwt.sign({ ...ticket, purpose: 'file' }, this.secret, { expiresIn: seconds })}`
  }

  /** null if the token is forged, expired or not a file token. */
  readTicket(token: string): LocalFileTicket | null {
    try {
      const { purpose, ...ticket } = jwt.verify(token, this.secret) as LocalFileTicket & { purpose?: string }
      return purpose === 'file' ? ticket : null
    } catch {
      return null
    }
  }

  async uploadUrl(key: string, contentType: string) {
    this.pathFor(key) // reject a bad key now, not when the browser uses the URL
    return this.sign({ op: 'put', key, contentType }, UPLOAD_URL_SECONDS)
  }

  async downloadUrl(key: string, options: DownloadOptions) {
    return this.sign({ op: 'get', key, ...options }, DOWNLOAD_URL_SECONDS)
  }

  async save(key: string, data: Buffer) {
    const full = this.pathFor(key)
    await mkdir(path.dirname(full), { recursive: true })
    await writeFile(full, data, { flag: 'wx' }) // 'wx' = fail rather than overwrite an existing file
  }

  /** A stream of the file's bytes, so big files are never loaded into memory to download. */
  async open(key: string): Promise<Readable> {
    const stream = createReadStream(this.pathFor(key))
    // Surface "file missing" now (as a rejected promise) instead of midway through a response.
    await new Promise<void>((resolve, reject) => {
      stream.once('open', () => resolve())
      stream.once('error', reject)
    })
    return stream
  }

  async sizeOf(key: string) {
    try {
      return (await stat(this.pathFor(key))).size
    } catch {
      return null
    }
  }

  async remove(key: string) {
    await rm(this.pathFor(key), { force: true })
  }
}

/*
 * Production driver for any S3-compatible service. With Cloudflare R2:
 *   S3_ENDPOINT = https://<account id>.r2.cloudflarestorage.com   S3_REGION = auto
 * The AWS SDK computes the signatures; only the bucket's owner keys can produce them.
 */
class S3Storage implements FileStorage {
  constructor(
    private client: S3Client,
    private bucket: string,
  ) {}

  uploadUrl(key: string, contentType: string) {
    // ContentType is part of the signature: the browser must upload with exactly this type.
    return getSignedUrl(this.client, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }), {
      expiresIn: UPLOAD_URL_SECONDS,
    })
  }

  async sizeOf(key: string) {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))
      return head.ContentLength ?? 0
    } catch (err) {
      if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null
      throw err
    }
  }

  downloadUrl(key: string, { fileName, contentType, inline }: DownloadOptions) {
    // The Response* fields tell the bucket which headers to send back with the file, so it is
    // served with the type WE trust and as a download unless it's a safe preview.
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentType: contentType,
        ResponseContentDisposition: contentDisposition(fileName, inline),
      }),
      { expiresIn: DOWNLOAD_URL_SECONDS },
    )
  }

  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }
}

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set (needed for STORAGE_DRIVER=s3). Check the environment variables.`)
  return value
}

function createStorage(): FileStorage {
  const driver = process.env.STORAGE_DRIVER || 'local'
  if (driver === 'local') {
    if (process.env.NODE_ENV === 'production') {
      console.warn('STORAGE_DRIVER=local in production: uploads are lost whenever the server is redeployed.')
    }
    const defaultDir = fileURLToPath(new URL('../uploads', import.meta.url))
    return new LocalDiskStorage(path.resolve(process.env.UPLOADS_DIR || defaultDir), required('JWT_SECRET'))
  }
  if (driver === 's3') {
    const client = new S3Client({
      endpoint: required('S3_ENDPOINT'),
      region: process.env.S3_REGION || 'auto',
      credentials: { accessKeyId: required('S3_ACCESS_KEY_ID'), secretAccessKey: required('S3_SECRET_ACCESS_KEY') },
      forcePathStyle: true, // https://<endpoint>/<bucket>/<key>: works with R2, MinIO and S3 alike
      // Newer SDKs add checksum fields to presigned uploads that a browser can't supply. Only when required.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    })
    return new S3Storage(client, required('S3_BUCKET'))
  }
  throw new Error(`Unknown STORAGE_DRIVER "${driver}". Supported: local, s3`)
}

export const storage = createStorage()
