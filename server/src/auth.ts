import type { Request, RequestHandler } from 'express'
import jwt from 'jsonwebtoken'
import { pool } from './db.js'
import { HttpError } from './errors.js'

const secret = process.env.JWT_SECRET
if (!secret) throw new Error('JWT_SECRET is not set. Check server/.env')

/**
 * A JWT is a signed note saying "this is user X". The signature stops anyone forging it.
 * ver = the user's token_version when it was issued (see requireAuth).
 */
export function signToken(userId: string, tokenVersion: number) {
  return jwt.sign({ sub: userId, ver: tokenVersion }, secret!, { expiresIn: '7d' })
}

/** Short-lived proof that a sign-up's OTP was verified. Only usable to finish THAT sign-up. */
export function signSignupToken(signupId: string) {
  return jwt.sign({ sub: signupId, purpose: 'signup' }, secret!, { expiresIn: '20m' })
}

export function verifySignupToken(token: string): string {
  try {
    const payload = jwt.verify(token, secret!) as { sub: string; purpose?: string }
    if (payload.purpose !== 'signup') throw new Error('wrong purpose')
    return payload.sub
  } catch {
    throw new HttpError(400, 'Your verification expired. Please start again.')
  }
}

/** Short-lived proof that a password-reset code was verified. Only usable to set that user's password. */
export function signResetToken(userId: string) {
  return jwt.sign({ sub: userId, purpose: 'reset' }, secret!, { expiresIn: '15m' })
}

export function verifyResetToken(token: string): string {
  try {
    const payload = jwt.verify(token, secret!) as { sub: string; purpose?: string }
    if (payload.purpose !== 'reset') throw new Error('wrong purpose')
    return payload.sub
  } catch {
    throw new HttpError(400, 'Your reset session expired. Please request a new code.')
  }
}

// Teach TypeScript that authenticated requests carry req.userId
declare module 'express-serve-static-core' {
  interface Request {
    userId: string
  }
}

/**
 * Middleware that runs BEFORE a protected route.
 * It reads "Authorization: Bearer <token>", verifies the signature, and stores the
 * user's id on the request. No valid token -> 401 and the route never runs.
 *
 * A signature alone can't be "taken back": a stolen token would work until it expires. So we
 * also compare the token's version with the user's current token_version in the database.
 * A password change bumps that number, and every older token stops working immediately.
 * (The same lookup also rejects tokens of deleted accounts.)
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) throw new HttpError(401, 'Please log in.')

  let payload: { sub: string; purpose?: string; ver?: number }
  try {
    payload = jwt.verify(token, secret!) as typeof payload
    // A sign-up or reset token must never double as a login token.
    if (payload.purpose) throw new Error('not a login token')
  } catch {
    throw new HttpError(401, 'Your session has expired. Please log in again.')
  }

  const { rows } = await pool.query('SELECT token_version FROM users WHERE id = $1', [payload.sub])
  // Tokens from before versions existed have no "ver": they count as version 0.
  if (!rows[0] || rows[0].token_version !== (payload.ver ?? 0)) {
    throw new HttpError(401, 'Your session has expired. Please log in again.')
  }
  req.userId = payload.sub
  next()
}

/**
 * For public pages: who is asking, if they happen to be logged in? Never throws; returns null
 * for no token or a bad one. (Used so the freelancer opening their own invoice link isn't
 * counted as "viewed by client".)
 */
export function optionalUserId(req: Request): string | null {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return null
  try {
    const payload = jwt.verify(header.slice(7), secret!) as { sub: string; purpose?: string }
    return payload.purpose ? null : payload.sub
  } catch {
    return null
  }
}
