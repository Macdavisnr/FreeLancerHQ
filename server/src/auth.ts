import type { Request, RequestHandler } from 'express'
import jwt from 'jsonwebtoken'
import { HttpError } from './errors.js'

const secret = process.env.JWT_SECRET
if (!secret) throw new Error('JWT_SECRET is not set. Check server/.env')

/** A JWT is a signed note saying "this is user X". The signature stops anyone forging it. */
export function signToken(userId: string) {
  return jwt.sign({ sub: userId }, secret!, { expiresIn: '7d' })
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
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) throw new HttpError(401, 'Please log in.')

  try {
    const payload = jwt.verify(token, secret!) as { sub: string; purpose?: string }
    // A sign-up or reset token must never double as a login token.
    if (payload.purpose) throw new Error('not a login token')
    req.userId = payload.sub
    next()
  } catch {
    throw new HttpError(401, 'Your session has expired. Please log in again.')
  }
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
