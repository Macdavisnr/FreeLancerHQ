import { timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import { HttpError } from '../errors.js'
import { runScheduledJobs } from '../notifications.js'

export const cronRouter = Router()

/*
 * GET /api/cron/run  - for a cron service (e.g. Vercel Cron) to trigger the scheduled jobs.
 * It's a public URL, so it needs a password: the caller must send
 *   Authorization: Bearer <CRON_SECRET>
 * (Vercel Cron sends exactly this when CRON_SECRET is set in the project.) Without
 * CRON_SECRET configured the endpoint is switched off.
 */
cronRouter.get('/run', async (req, res) => {
  const secret = process.env.CRON_SECRET
  if (!secret) throw new HttpError(404, 'Not found.')
  const given = Buffer.from(req.headers.authorization ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new HttpError(401, 'Unauthorized.')
  res.json(await runScheduledJobs())
})
