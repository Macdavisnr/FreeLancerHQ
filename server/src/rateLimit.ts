import { pool } from './db.js'
import { HttpError } from './errors.js'

/*
 * "At most N per window" limiter, e.g. 10 AI proposals per hour per person.
 *
 * The counts are kept in Postgres (table rate_limit_hits), not in a Map in memory: on Vercel
 * each request may be handled by a different copy of the API, and a Map in one copy can't see
 * the hits counted by another. The database is the one thing every copy shares.
 *
 * pg_advisory_xact_lock(key) makes two simultaneous requests for the SAME key take turns,
 * so both can't read "9 so far" and both slip in as number 10. The lock is released
 * automatically when the transaction ends.
 */
export async function checkRateLimit(key: string, max: number, windowMs: number, what: string) {
  const db = await pool.connect()
  try {
    await db.query('BEGIN')
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key])
    const { rows } = await db.query(
      `SELECT count(*)::int AS hits, min(hit_at) AS oldest
       FROM rate_limit_hits WHERE key = $1 AND hit_at > now() - make_interval(secs => $2)`,
      [key, windowMs / 1000],
    )
    if (rows[0].hits >= max) {
      await db.query('ROLLBACK')
      const msLeft = windowMs - (Date.now() - new Date(rows[0].oldest).getTime())
      const minutes = Math.max(1, Math.ceil(msLeft / 60_000))
      throw new HttpError(429, `You have used all ${max} ${what} for now. Please try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`)
    }
    await db.query('INSERT INTO rate_limit_hits (key) VALUES ($1)', [key])
    await db.query('COMMIT')
  } catch (err) {
    if (!(err instanceof HttpError)) await db.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    db.release()
  }
}

/** Run by the scheduled jobs: forget hits older than any window we use (the longest is 1 hour). */
export async function pruneRateLimits() {
  await pool.query(`DELETE FROM rate_limit_hits WHERE hit_at < now() - interval '1 day'`)
}
