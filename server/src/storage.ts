import { createReadStream } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

/*
 * File storage behind one small interface. Routes only ever call storage.put/get/remove, so
 * moving from the local disk to a cloud bucket means writing one more class here and
 * changing STORAGE_DRIVER. No route changes.
 *
 * Keys look like "<userId>/<random uuid>". They are never built from the uploaded file
 * name, so a file called "../../.env" can't escape the uploads folder.
 */
export interface FileStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>
  /** A stream of the file's bytes, so big files are never loaded into memory to download. */
  get(key: string): Promise<Readable>
  remove(key: string): Promise<void>
}

/** Development driver: files go in server/uploads/ (git-ignored). */
class LocalDiskStorage implements FileStorage {
  constructor(private root: string) {}

  /** Belt and braces: even though keys are ours, refuse anything that resolves outside root. */
  private pathFor(key: string) {
    const full = path.resolve(this.root, key)
    if (!full.startsWith(this.root + path.sep)) throw new Error(`Invalid storage key: ${key}`)
    return full
  }

  async put(key: string, data: Buffer) {
    const full = this.pathFor(key)
    await mkdir(path.dirname(full), { recursive: true })
    await writeFile(full, data, { flag: 'wx' }) // 'wx' = fail rather than overwrite an existing file
  }

  async get(key: string) {
    const stream = createReadStream(this.pathFor(key))
    // Surface "file missing" now (as a rejected promise) instead of midway through a response.
    await new Promise<void>((resolve, reject) => {
      stream.once('open', () => resolve())
      stream.once('error', reject)
    })
    return stream
  }

  async remove(key: string) {
    await rm(this.pathFor(key), { force: true })
  }
}

function createStorage(): FileStorage {
  const driver = process.env.STORAGE_DRIVER || 'local'
  if (driver === 'local') {
    if (process.env.NODE_ENV === 'production') {
      console.warn('STORAGE_DRIVER=local in production: uploads are lost whenever the server is redeployed.')
    }
    const defaultDir = fileURLToPath(new URL('../uploads', import.meta.url))
    return new LocalDiskStorage(path.resolve(process.env.UPLOADS_DIR || defaultDir))
  }
  // Production drivers (e.g. 's3' for Cloudflare R2 / AWS S3) are added here when we deploy.
  throw new Error(`Unknown STORAGE_DRIVER "${driver}". Supported: local`)
}

export const storage = createStorage()
