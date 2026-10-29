import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/*
 * HASHING vs ENCRYPTING
 *  - A password is HASHED (bcrypt): we never need it back, only to check a guess against it.
 *  - A Paystack secret key is ENCRYPTED: we DO need it back, to call Paystack for the user.
 *
 * AES-256-GCM is "authenticated" encryption: besides hiding the text, it adds a tag that makes
 * decryption FAIL if anyone changed even one byte, so a tampered value is never silently used.
 * A fresh random IV (nonce) per value means the same key encrypted twice looks different.
 *
 * Stored format:  v1:<iv>:<tag>:<ciphertext>   (each part base64). "v1" lets us change the
 * scheme later without breaking values already stored.
 */

const raw = process.env.ENCRYPTION_KEY ? Buffer.from(process.env.ENCRYPTION_KEY, 'base64') : null
if (!raw || raw.length !== 32) {
  throw new Error('ENCRYPTION_KEY must be 32 random bytes in base64. See server/.env.example')
}
const KEY = raw

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12) // 96-bit IV, the size GCM is designed for
  const cipher = createCipheriv('aes-256-gcm', KEY, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join(':')
}

export function decrypt(stored: string): string {
  const [version, iv, tag, ciphertext] = stored.split(':')
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Unrecognised encrypted value.')
  const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8')
}
