import { HttpError } from './errors.js'

/*
 * A tiny in-memory "N per window" limiter, used to cap how often one person can trigger paid
 * AI calls. It resets if the server restarts and is per server process, which is fine for one
 * server; with several servers behind a load balancer this moves to the database or Redis.
 */
const hits = new Map<string, number[]>()

export function checkRateLimit(key: string, max: number, windowMs: number, what: string) {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= max) {
    const minutes = Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 60_000))
    throw new HttpError(429, `You have used all ${max} ${what} for now. Please try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`)
  }
  recent.push(now)
  hits.set(key, recent)
}
